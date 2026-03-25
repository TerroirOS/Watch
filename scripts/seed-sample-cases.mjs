import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import OpenAI from "openai";
import pg from "pg";
import { extractDocumentText, normalizeMimeType } from "../lib/document-parsing.mjs";
import { resolveWatchConfig } from "./watch-config.mjs";

const { Pool } = pg;
const sampleCasesPath = path.resolve(process.cwd(), "test-docs", "sample-cases.json");
const seedLockPath = path.resolve(process.cwd(), ".seed-sample-cases.lock");

function loadSampleCases() {
  const raw = fs.readFileSync(sampleCasesPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("test-docs/sample-cases.json must contain at least one sample case.");
  }

  return parsed.map((item, index) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.title !== "string" ||
      typeof item.description !== "string" ||
      !Array.isArray(item.documents) ||
      item.documents.length === 0 ||
      item.documents.some((value) => typeof value !== "string" || !value.trim())
    ) {
      throw new Error(`Invalid sample case definition at index ${index}.`);
    }

    return {
      title: item.title.trim(),
      description: item.description.trim(),
      documents: item.documents.map((value) => value.trim()),
    };
  });
}

function buildQueryClient(watchConfig) {
  if (watchConfig.persistenceMode === "postgres") {
    const pool = new Pool({ connectionString: watchConfig.databaseUrl });
    return {
      async query(sql, params = []) {
        const result = await pool.query(sql, params);
        return { rows: result.rows };
      },
      async close() {
        await pool.end();
      },
    };
  }

  fs.mkdirSync(path.dirname(watchConfig.sqliteDbPath), { recursive: true });
  const sqlite = new Database(watchConfig.sqliteDbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.function("gen_random_uuid", () => randomUUID());

  return {
    async query(sql, params = []) {
      const convertedSql = sql.replace(/\$\d+/g, "?");
      const trimmed = convertedSql.trim().toUpperCase();
      const isSelect = trimmed.startsWith("SELECT");
      const hasReturning = trimmed.includes("RETURNING");

      if (isSelect) {
        return { rows: sqlite.prepare(convertedSql).all(...params) };
      }

      if (hasReturning) {
        const returningMatch = convertedSql.match(/RETURNING\s+(.+)$/i);
        const returningCols = returningMatch ? returningMatch[1].trim() : "id";
        const baseSql = convertedSql.replace(/\s+RETURNING\s+.+$/i, "").trim();

        if (trimmed.startsWith("INSERT")) {
          const result = sqlite.prepare(baseSql).run(...params);
          const lastId = result.lastInsertRowid;
          const tableMatch = baseSql.match(/INSERT\s+INTO\s+(\w+)/i);
          const table = tableMatch ? tableMatch[1] : "";
          const row = sqlite
            .prepare(`SELECT ${returningCols} FROM ${table} WHERE rowid = ?`)
            .get(lastId);

          return { rows: row ? [row] : [] };
        }
      }

      sqlite.prepare(convertedSql).run(...params);
      return { rows: [] };
    },
    async close() {
      sqlite.close();
    },
  };
}

function generateMockResult(documentTexts) {
  const allText = documentTexts.join(" ").toLowerCase();
  const hasWine =
    allText.includes("wine") || allText.includes("varietal") || allText.includes("vintage");
  const hasOil = allText.includes("oil") || allText.includes("olive");
  const productType = hasWine ? "wine" : hasOil ? "olive oil" : "agricultural product";

  return {
    summary: `[MOCK] Analysis of ${documentTexts.length} document(s) related to ${productType} origin claims. The documents contain various provenance assertions including producer identity, geographic origin, and production dates. This is a simulated analysis for local development - connect an OpenAI API key for real AI-powered extraction.`,
    entities: [
      { claim_type: "producer_name", claim_value: "Example Producer Co.", confidence: 0.92 },
      { claim_type: "pdo_region", claim_value: "Kakheti, Georgia", confidence: 0.88 },
      { claim_type: "varietal", claim_value: "Saperavi", confidence: 0.85 },
      { claim_type: "bottling_date", claim_value: "2024-03-15", confidence: 0.78 },
      { claim_type: "batch_id", claim_value: "BATCH-2024-0042", confidence: 0.95 },
      { claim_type: "harvest_year", claim_value: "2023", confidence: 0.9 },
    ],
    discrepancies:
      documentTexts.length > 1
        ? [
            {
              title: "Bottling date inconsistency",
              description:
                "Document 1 states bottling date as March 2024, while Document 2 references February 2024. A one-month discrepancy may indicate a clerical error or a mismatch between production and certification records.",
              severity: "medium",
            },
            {
              title: "Missing PDO certification reference",
              description:
                "The export declaration does not include a PDO or GI certification number, which is typically required for products claiming protected designation of origin.",
              severity: "high",
            },
          ]
        : [
            {
              title: "Single document - no cross-reference possible",
              description:
                "Only one document was provided. Upload additional documents to enable cross-document discrepancy detection.",
              severity: "low",
            },
          ],
  };
}

async function analyzeDocuments(documentTexts, watchConfig) {
  if (watchConfig.useMockAi) {
    console.log("[Watch] Mock AI mode enabled - using simulated document analysis");
    return generateMockResult(documentTexts);
  }

  const openai = new OpenAI({ apiKey: watchConfig.openAiApiKey });
  const combinedText = documentTexts
    .map((text, index) => `--- Document ${index + 1} ---\n${text}`)
    .join("\n\n");
  const systemPrompt = `
    You are an AI transparency engine for agricultural origin claims (Terroir Watch).
    Your task is to analyze the provided documents (certificates, labels, JSON records).

    1. Summarize what these documents claim (e.g., origin, varietals, dates).
    2. Extract key entities (producer name, bottling date, PDO region, varietal, batch identifiers).
    3. Identify any logical discrepancies, missing fields, or mismatches between the documents.

    Respond in strict JSON format matching this schema:
    {
      "summary": "Plain language summary of the claims",
      "entities": [
        { "claim_type": "string", "claim_value": "string", "confidence": 0.0 to 1.0 }
      ],
      "discrepancies": [
        { "title": "string", "description": "string", "severity": "low|medium|high" }
      ]
    }
  `;
  const response = await openai.chat.completions.create({
    model: watchConfig.openAiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze the following documents:\n\n${combinedText}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  return JSON.parse(response.choices[0].message.content || "{}");
}

async function seedCase(seedCase, queryClient, watchConfig) {
  const existingCase = await queryClient.query(
    "SELECT id FROM cases WHERE title = $1 ORDER BY created_at ASC",
    [
      seedCase.title,
    ],
  );

  if (existingCase.rows.length > 1) {
    for (const duplicateCase of existingCase.rows.slice(1)) {
      await queryClient.query("DELETE FROM cases WHERE id = $1", [duplicateCase.id]);
    }
    console.log(`Removed duplicate seeded cases for: ${seedCase.title}`);
  }

  if (existingCase.rows[0]?.id) {
    const existingCaseId = existingCase.rows[0].id;
    await queryClient.query("DELETE FROM extracted_claims WHERE case_id = $1", [existingCaseId]);
    await queryClient.query("DELETE FROM documents WHERE case_id = $1", [existingCaseId]);
    await queryClient.query("DELETE FROM discrepancies WHERE case_id = $1", [existingCaseId]);
    await queryClient.query("DELETE FROM cases WHERE id = $1", [existingCaseId]);
    fs.rmSync(path.join(watchConfig.uploadDirectory, existingCaseId), {
      recursive: true,
      force: true,
    });
    console.log(`Reseeding existing sample case: ${seedCase.title}`);
  }

  const insertedCase = await queryClient.query(
    "INSERT INTO cases (title, description, status) VALUES ($1, $2, $3) RETURNING id",
    [seedCase.title, seedCase.description, "ready"],
  );
  const caseId = insertedCase.rows[0]?.id;

  if (!caseId) {
    throw new Error(`Failed to create sample case: ${seedCase.title}`);
  }

  const caseUploadDir = path.join(watchConfig.uploadDirectory, caseId);
  fs.mkdirSync(caseUploadDir, { recursive: true });

  const documentTexts = [];
  const documentIds = [];

  for (const fixtureName of seedCase.documents) {
    const fixturePath = path.resolve(process.cwd(), "test-docs", fixtureName);
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Missing sample case fixture: ${fixtureName}`);
    }

    const normalizedMimeType = normalizeMimeType(
      fixtureName.toLowerCase().endsWith(".json") ? "application/json" : "application/pdf",
    );
    const buffer = fs.readFileSync(fixturePath);
    const parsedDocument = await extractDocumentText({
      buffer,
      mimeType: normalizedMimeType,
      filename: fixtureName,
    });
    const destinationPath = path.join(caseUploadDir, parsedDocument.filename);

    fs.copyFileSync(fixturePath, destinationPath);
    documentTexts.push(parsedDocument.extractedText);

    const insertedDocument = await queryClient.query(
      "INSERT INTO documents (case_id, filename, file_url, file_type, extracted_text) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [
        caseId,
        parsedDocument.filename,
        `${watchConfig.uploadPublicBasePath}/${encodeURIComponent(caseId)}/${encodeURIComponent(parsedDocument.filename)}`,
        parsedDocument.mimeType,
        parsedDocument.extractedText,
      ],
    );

    if (insertedDocument.rows[0]?.id) {
      documentIds.push(insertedDocument.rows[0].id);
    }
  }

  const aiResult = await analyzeDocuments(documentTexts, watchConfig);

  await queryClient.query("UPDATE cases SET ai_summary = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [
    aiResult.summary,
    caseId,
  ]);

  for (const entity of aiResult.entities ?? []) {
    await queryClient.query(
      "INSERT INTO extracted_claims (case_id, document_id, claim_type, claim_value, confidence_score) VALUES ($1, $2, $3, $4, $5)",
      [
        caseId,
        documentIds[0] ?? null,
        entity.claim_type,
        entity.claim_value,
        entity.confidence,
      ],
    );
  }

  for (const discrepancy of aiResult.discrepancies ?? []) {
    await queryClient.query(
      "INSERT INTO discrepancies (case_id, title, plain_language_summary, severity) VALUES ($1, $2, $3, $4)",
      [caseId, discrepancy.title, discrepancy.description, discrepancy.severity],
    );
  }

  console.log(
    `Seeded sample case: ${seedCase.title} (${seedCase.documents.length} document(s), ${documentIds.length} stored document(s))`,
  );
}

async function main() {
  const watchConfig = resolveWatchConfig({ cwd: process.cwd() });
  const queryClient = buildQueryClient(watchConfig);
  let lockHandle;

  try {
    lockHandle = fs.openSync(seedLockPath, "wx");
    const sampleCases = loadSampleCases();

    for (const sampleCase of sampleCases) {
      await seedCase(sampleCase, queryClient, watchConfig);
    }
  } finally {
    if (lockHandle !== undefined) {
      fs.closeSync(lockHandle);
      if (fs.existsSync(seedLockPath)) {
        fs.unlinkSync(seedLockPath);
      }
    }
    await queryClient.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed to seed sample cases.");
  process.exit(1);
});

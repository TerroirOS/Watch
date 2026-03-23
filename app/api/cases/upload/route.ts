import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractDocumentText, normalizeMimeType } from "@/lib/document-parsing.mjs";
import { getWatchConfig } from "@/lib/env";
import { processWatchCaseDocuments } from "@/lib/openai";

interface InsertedIdRow {
  id: string;
}

export async function POST(req: NextRequest) {
  try {
    const watchConfig = getWatchConfig();
    const formData = await req.formData();
    const files = formData
      .getAll("documents")
      .filter((value): value is File => value instanceof File);
    const titleValue = formData.get("title");
    const descriptionValue = formData.get("description");
    const title =
      typeof titleValue === "string" && titleValue.trim()
        ? titleValue.trim()
        : "New Watch Case";
    const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";

    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    if (files.length > watchConfig.maxDocuments) {
      return NextResponse.json(
        {
          error: `Too many files uploaded. Limit is ${watchConfig.maxDocuments} document(s) per case.`,
        },
        { status: 400 },
      );
    }

    const caseResult = await db.query<InsertedIdRow>(
      "INSERT INTO cases (title, description) VALUES ($1, $2) RETURNING id",
      [title, description],
    );
    const caseId = caseResult.rows[0]?.id;

    if (!caseId) {
      throw new Error("Case creation did not return an id.");
    }

    const documentTexts: string[] = [];
    const documentIds: string[] = [];

    for (const file of files) {
      const normalizedMimeType = normalizeMimeType(file.type);
      if (!watchConfig.allowedUploadMimeTypes.includes(normalizedMimeType)) {
        return NextResponse.json(
          {
            error: `Unsupported file type for ${file.name}. Allowed MIME types: ${watchConfig.allowedUploadMimeTypes.join(", ")}.`,
          },
          { status: 400 },
        );
      }

      if (file.size > watchConfig.maxUploadBytes) {
        return NextResponse.json(
          {
            error: `${file.name} exceeds the ${watchConfig.maxUploadBytes} byte upload limit.`,
          },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const parsedDocument = await extractDocumentText({
        buffer,
        mimeType: normalizedMimeType,
        filename: file.name,
      });

      documentTexts.push(parsedDocument.extractedText);

      const docResult = await db.query<InsertedIdRow>(
        "INSERT INTO documents (case_id, filename, file_url, file_type, extracted_text) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [
          caseId,
          parsedDocument.filename,
          `${watchConfig.uploadPublicBasePath}/${encodeURIComponent(caseId)}/${encodeURIComponent(parsedDocument.filename)}`,
          parsedDocument.mimeType,
          parsedDocument.extractedText,
        ],
      );
      const documentId = docResult.rows[0]?.id;

      if (documentId) {
        documentIds.push(documentId);
      }
    }

    const aiResult = await processWatchCaseDocuments(documentTexts);

    await db.query("UPDATE cases SET ai_summary = $1 WHERE id = $2", [
      aiResult.summary,
      caseId,
    ]);

    for (const entity of aiResult.entities) {
      await db.query(
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

    for (const discrepancy of aiResult.discrepancies) {
      await db.query(
        "INSERT INTO discrepancies (case_id, title, plain_language_summary, severity) VALUES ($1, $2, $3, $4)",
        [caseId, discrepancy.title, discrepancy.description, discrepancy.severity],
      );
    }

    return NextResponse.json({ success: true, caseId });
  } catch (error: unknown) {
    console.error("Error processing upload:", error);
    return NextResponse.json(
      {
        error: error instanceof Error && error.message ? error.message : "Failed to process files",
      },
      { status: 500 },
    );
  }
}

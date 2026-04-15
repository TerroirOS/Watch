import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { GET as listCases } from "../app/api/cases/route";
import { POST as uploadCase } from "../app/api/cases/upload/route";
import { applySqliteMigrations } from "./watch-migrations.mjs";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

function resetRuntimeState() {
  const globalState = globalThis as typeof globalThis & {
    watchConfigCache?: unknown;
    sqliteDb?: Database.Database;
    postgresPool?: { end?: () => Promise<void> };
  };

  globalState.watchConfigCache = undefined;

  if (globalState.sqliteDb) {
    globalState.sqliteDb.close();
    globalState.sqliteDb = undefined;
  }

  if (globalState.postgresPool?.end) {
    void globalState.postgresPool.end();
    globalState.postgresPool = undefined;
  }
}

function createWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "shield-api-tests-"));
  fs.mkdirSync(path.join(workspace, "uploads"), { recursive: true });
  return workspace;
}

function applyWorkspaceEnv(workspace: string, extraEnv: Record<string, string> = {}) {
  process.chdir(workspace);
  process.env.WATCH_PERSISTENCE_MODE = "sqlite";
  process.env.WATCH_DB_PATH = "./watch.db";
  process.env.WATCH_UPLOAD_DIR = "./uploads";
  process.env.WATCH_UPLOAD_PUBLIC_BASE = "/uploads";
  process.env.WATCH_USE_MOCK_AI = "true";
  process.env.WATCH_ALLOWED_UPLOAD_MIME_TYPES = "application/pdf,application/json";
  process.env.WATCH_MAX_DOCUMENTS = "2";
  process.env.WATCH_MAX_UPLOAD_BYTES = "64";

  for (const [key, value] of Object.entries(extraEnv)) {
    process.env[key] = value;
  }

  resetRuntimeState();
}

function restoreProcessState() {
  process.chdir(originalCwd);

  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  resetRuntimeState();
}

function setupSqliteSchema(workspace: string) {
  const dbPath = path.join(workspace, "watch.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.function("gen_random_uuid", () => randomUUID());
  applySqliteMigrations({ db: sqlite, logger: console });
  sqlite.close();
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  } finally {
    restoreProcessState();
  }
}

async function main() {
  await runTest("upload route rejects empty submissions with a validation error", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);

    const formData = new FormData();
    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.deepEqual(payload, {
      error: {
        code: "validation_error",
        message: "No files uploaded",
      },
    });
  });

  await runTest("upload route rejects unsupported MIME types with a stable error shape", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);

    const formData = new FormData();
    formData.append("documents", new File(["hello"], "notes.txt", { type: "text/plain" }));

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);

    assert.equal(response.status, 415);
    assert.equal((payload.error as { code: string }).code, "unsupported_media_type");
    assert.equal(
      (payload.error as { message: string }).message,
      "Unsupported file type for notes.txt. Allowed MIME types: application/pdf, application/json.",
    );
  });

  await runTest("upload route enforces max document counts with details", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);

    const formData = new FormData();
    formData.append("documents", new File(['{\"a\":1}'], "a.json", { type: "application/json" }));
    formData.append("documents", new File(['{\"b\":2}'], "b.json", { type: "application/json" }));
    formData.append("documents", new File(['{\"c\":3}'], "c.json", { type: "application/json" }));

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal((payload.error as { code: string }).code, "validation_error");
    assert.deepEqual((payload.error as { details: Record<string, unknown> }).details, {
      maxDocuments: 2,
      receivedDocuments: 3,
    });
  });

  await runTest("cases route returns a structured database error when schema is missing", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);

    const response = await listCases();
    const payload = await readJson(response);

    assert.equal(response.status, 500);
    assert.deepEqual(payload, {
      error: {
        code: "database_error",
        message: "Failed to fetch cases",
      },
    });
  });

  await runTest("cases route returns persisted case rows from SQLite", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);
    setupSqliteSchema(workspace);

    const sqlite = new Database(path.join(workspace, "watch.db"));
    sqlite
      .prepare("INSERT INTO cases (id, title, description, status) VALUES (?, ?, ?, ?)")
      .run("case-1", "Sample Case", "Demo case", "ready");
    sqlite
      .prepare(
        "INSERT INTO documents (id, case_id, filename, file_url, file_type, extracted_text) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "doc-1",
        "case-1",
        "certificate.json",
        "/uploads/case-1/certificate.json",
        "application/json",
        "{}",
      );
    sqlite
      .prepare(
        "INSERT INTO discrepancies (id, case_id, title, plain_language_summary, severity) VALUES (?, ?, ?, ?, ?)",
      )
      .run("disc-1", "case-1", "Mismatch", "Origin mismatch", "high");
    sqlite.close();

    const response = await listCases();
    const payload = (await readJson(response)) as {
      cases: Array<{
        id: string;
        title: string;
        description: string | null;
        status: string | null;
        created_at: string;
        document_count: number;
        discrepancy_count: number;
      }>;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.cases.length, 1);
    assert.deepEqual(payload.cases[0], {
      id: "case-1",
      title: "Sample Case",
      description: "Demo case",
      status: "ready",
      created_at: payload.cases[0]?.created_at,
      document_count: 1,
      discrepancy_count: 1,
    });
    assert.equal(typeof payload.cases[0]?.created_at, "string");
  });
}

void main();

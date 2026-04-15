import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { GET as listCases } from "../app/api/cases/route";
import { PATCH as patchCaseStatus } from "../app/api/cases/[id]/status/route";
import { POST as uploadCase } from "../app/api/cases/upload/route";
import { GET as getUploadedDocument } from "../app/uploads/[caseId]/[filename]/route";
import { caseRepository } from "../lib/repositories";
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
  process.env.WATCH_MAX_CASE_UPLOAD_BYTES = "128";

  for (const [key, value] of Object.entries(extraEnv)) {
    process.env[key] = value;
  }

  const maxUploadBytes = Number(process.env.WATCH_MAX_UPLOAD_BYTES ?? "0");
  const maxCaseUploadBytes = Number(process.env.WATCH_MAX_CASE_UPLOAD_BYTES ?? "0");
  if (maxUploadBytes > 0 && maxCaseUploadBytes > 0 && maxCaseUploadBytes < maxUploadBytes) {
    process.env.WATCH_MAX_CASE_UPLOAD_BYTES = String(maxUploadBytes);
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

function assertErrorEnvelope(
  response: Response,
  payload: Record<string, unknown>,
  expected: {
    status: number;
    code: string;
    message: string;
    category: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  },
) {
  const error = payload.error as
    | {
        code: string;
        message: string;
        category: string;
        requestId: string;
        retryable: boolean;
        details?: Record<string, unknown>;
      }
    | undefined;

  assert(error);
  assert.equal(response.status, expected.status);
  assert.equal(error.code, expected.code);
  assert.equal(error.message, expected.message);
  assert.equal(error.category, expected.category);
  assert.equal(error.retryable, expected.retryable);
  assert.equal(typeof error.requestId, "string");
  assert.match(error.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers.get("x-request-id"), error.requestId);

  if (expected.details) {
    assert.deepEqual(error.details, expected.details);
  }
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

    assertErrorEnvelope(response, payload, {
      status: 400,
      code: "validation_error",
      message: "No files uploaded",
      category: "validation",
      retryable: false,
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

    assertErrorEnvelope(response, payload, {
      status: 415,
      code: "unsupported_media_type",
      message:
        "Unsupported file type for notes.txt. Allowed MIME types: application/pdf, application/json.",
      category: "validation",
      retryable: false,
      details: {
        filename: "notes.txt",
        mimeType: "text/plain",
        allowedMimeTypes: ["application/pdf", "application/json"],
      },
    });
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

    assertErrorEnvelope(response, payload, {
      status: 400,
      code: "validation_error",
      message: "Too many files uploaded. Limit is 2 document(s) per case.",
      category: "validation",
      retryable: false,
      details: {
        maxDocuments: 2,
        receivedDocuments: 3,
      },
    });
  });

  await runTest("upload route reports config errors with operator-readable context", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace, { WATCH_UPLOAD_PUBLIC_BASE: "uploads" });

    const formData = new FormData();
    formData.append("documents", new File(['{\"a\":1}'], "a.json", { type: "application/json" }));

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);

    assertErrorEnvelope(response, payload, {
      status: 500,
      code: "configuration_error",
      message: "WATCH_UPLOAD_PUBLIC_BASE must start with '/'.",
      category: "configuration",
      retryable: false,
    });
  });

  await runTest("upload route enforces byte upload limits", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace, { WATCH_MAX_UPLOAD_BYTES: "16" });

    const formData = new FormData();
    formData.append(
      "documents",
      new File(['{"document_type":"PDO Certificate"}'], "certificate.json", {
        type: "application/json",
      }),
    );

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);

    assertErrorEnvelope(response, payload, {
      status: 413,
      code: "payload_too_large",
      message: "certificate.json exceeds the 16 byte upload limit.",
      category: "validation",
      retryable: false,
      details: {
        filename: "certificate.json",
        maxUploadBytes: 16,
        receivedBytes: 35,
      },
    });
  });

  await runTest("upload route enforces aggregate per-case byte limits", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace, {
      WATCH_MAX_UPLOAD_BYTES: "40",
      WATCH_MAX_CASE_UPLOAD_BYTES: "60",
    });

    const formData = new FormData();
    formData.append(
      "documents",
      new File(['{"document_type":"PDO Certificate"}'], "certificate.json", {
        type: "application/json",
      }),
    );
    formData.append(
      "documents",
      new File(['{"document_type":"Export Declaration"}'], "export.json", {
        type: "application/json",
      }),
    );

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);

    assertErrorEnvelope(response, payload, {
      status: 413,
      code: "payload_too_large",
      message: "Combined upload size exceeds the 60 byte per-case limit.",
      category: "validation",
      retryable: false,
      details: {
        maxCaseUploadBytes: 60,
        receivedBytes: 73,
      },
    });
  });

  await runTest("upload route rejects empty files", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);

    const formData = new FormData();
    formData.append("documents", new File([""], "empty.json", { type: "application/json" }));

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);

    assertErrorEnvelope(response, payload, {
      status: 400,
      code: "validation_error",
      message: "empty.json is empty. Upload a non-empty document.",
      category: "validation",
      retryable: false,
      details: {
        filename: "empty.json",
      },
    });
  });

  await runTest("upload route rejects duplicate normalized filenames", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace, { WATCH_MAX_UPLOAD_BYTES: "128" });

    const formData = new FormData();
    formData.append("documents", new File(['{"a":1}'], "batch?.json", { type: "application/json" }));
    formData.append("documents", new File(['{"b":2}'], "batch*.json", { type: "application/json" }));

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);

    assertErrorEnvelope(response, payload, {
      status: 400,
      code: "validation_error",
      message: "Duplicate document filename detected after normalization: batch-.json.",
      category: "validation",
      retryable: false,
      details: {
        filename: "batch*.json",
        normalizedFilename: "batch-.json",
      },
    });
  });

  await runTest("upload route reports parse failures as validation errors", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace, { WATCH_MAX_UPLOAD_BYTES: "128" });

    const formData = new FormData();
    formData.append(
      "documents",
      new File(['{"document_type":]'], "broken.json", { type: "application/json" }),
    );

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);
    const error = payload.error as { details?: Record<string, unknown> };

    assertErrorEnvelope(response, payload, {
      status: 400,
      code: "validation_error",
      message: "Unable to parse broken.json.",
      category: "validation",
      retryable: false,
    });
    assert.equal(error.details?.filename, "broken.json");
    assert.equal(error.details?.mimeType, "application/json");
    assert.equal(typeof error.details?.reason, "string");
  });

  await runTest("cases route returns a structured database error when schema is missing", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);

    const response = await listCases();
    const payload = await readJson(response);

    assertErrorEnvelope(response, payload, {
      status: 500,
      code: "database_error",
      message: "Failed to fetch cases",
      category: "dependency",
      retryable: true,
      details: {
        reason: "no such table: cases",
      },
    });
  });

  await runTest("missing stored files return a not-found error envelope", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace, { WATCH_MAX_UPLOAD_BYTES: "512" });
    setupSqliteSchema(workspace);

    const formData = new FormData();
    formData.append("title", "Missing stored file");
    formData.append(
      "documents",
      new File(
        ['{"document_type":"PDO Certificate","producer":"Marani","batch_id":"BATCH-2024-0042"}'],
        "certificate.json",
        { type: "application/json" },
      ),
    );

    const uploadResponse = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const uploadPayload = await readJson(uploadResponse);
    const caseId = String(uploadPayload.caseId);
    fs.unlinkSync(path.join(workspace, "uploads", caseId, "certificate.json"));

    const fileResponse = await getUploadedDocument(
      new Request(`http://localhost/uploads/${caseId}/certificate.json`) as never,
      {
        params: Promise.resolve({
          caseId,
          filename: "certificate.json",
        }),
      },
    );
    const filePayload = await readJson(fileResponse);

    assertErrorEnvelope(fileResponse, filePayload, {
      status: 404,
      code: "not_found",
      message: "Stored document file is missing.",
      category: "storage",
      retryable: false,
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
        highest_severity: string | null;
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
      highest_severity: "high",
    });
    assert.equal(typeof payload.cases[0]?.created_at, "string");
  });

  await runTest("case status route updates workflow state and records an audit event", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);
    setupSqliteSchema(workspace);

    const sqlite = new Database(path.join(workspace, "watch.db"));
    sqlite
      .prepare("INSERT INTO cases (id, title, description, status) VALUES (?, ?, ?, ?)")
      .run("case-review", "Reviewable Case", "Needs operator decision", "open");
    sqlite.close();

    const response = await patchCaseStatus(
      new Request("http://localhost/api/cases/case-review/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "under_review",
          note: "Triage started by ops.",
          actorId: "operator-17",
        }),
      }) as never,
      { params: Promise.resolve({ id: "case-review" }) },
    );
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.status, "under_review");
    assert.deepEqual(payload.allowedNextStatuses, ["approved", "rejected", "on_hold", "escalated"]);

    const caseDetail = await caseRepository.getDetail("case-review");
    assert(caseDetail);
    assert.equal(caseDetail.caseData.status, "under_review");
    assert.equal(caseDetail.auditLogs.length, 1);
    assert.equal(caseDetail.auditLogs[0]?.event_type, "case.status_changed");
    assert.match(caseDetail.auditLogs[0]?.message ?? "", /Open to Under Review/);
  });

  await runTest("case status route rejects invalid workflow transitions", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);
    setupSqliteSchema(workspace);

    const sqlite = new Database(path.join(workspace, "watch.db"));
    sqlite
      .prepare("INSERT INTO cases (id, title, description, status) VALUES (?, ?, ?, ?)")
      .run("case-exported", "Exported Case", "Already finished", "exported");
    sqlite.close();

    const response = await patchCaseStatus(
      new Request("http://localhost/api/cases/case-exported/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "under_review",
        }),
      }) as never,
      { params: Promise.resolve({ id: "case-exported" }) },
    );
    const payload = await readJson(response);

    assertErrorEnvelope(response, payload, {
      status: 409,
      code: "validation_error",
      message: "Cannot move a case from exported to under review.",
      category: "validation",
      retryable: false,
      details: {
        currentStatus: "exported",
        nextStatus: "under_review",
        allowedTransitions: [],
      },
    });
  });

  await runTest("case status route requires notes for hold and rejection actions", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace);
    setupSqliteSchema(workspace);

    const sqlite = new Database(path.join(workspace, "watch.db"));
    sqlite
      .prepare("INSERT INTO cases (id, title, description, status) VALUES (?, ?, ?, ?)")
      .run("case-hold", "Holdable Case", "Needs more evidence", "under_review");
    sqlite.close();

    const response = await patchCaseStatus(
      new Request("http://localhost/api/cases/case-hold/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "on_hold",
        }),
      }) as never,
      { params: Promise.resolve({ id: "case-hold" }) },
    );
    const payload = await readJson(response);

    assertErrorEnvelope(response, payload, {
      status: 400,
      code: "validation_error",
      message: "A review note is required when moving a case to on hold.",
      category: "validation",
      retryable: false,
      details: {
        currentStatus: "under_review",
        nextStatus: "on_hold",
      },
    });
  });

  await runTest("upload route persists repository-backed case details", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace, { WATCH_MAX_UPLOAD_BYTES: "512" });
    setupSqliteSchema(workspace);

    const formData = new FormData();
    formData.append("title", "Repository-backed upload");
    formData.append("description", "Checks repository helpers after upload");
    formData.append(
      "documents",
      new File(
        ['{"document_type":"PDO Certificate","producer":"Marani","batch_id":"BATCH-2024-0042"}'],
        "certificate.json",
        { type: "application/json" },
      ),
    );

    const response = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const payload = await readJson(response);
    const caseId = payload.caseId;

    assert.equal(response.status, 200);
    assert.equal(typeof caseId, "string");

    const caseDetail = await caseRepository.getDetail(caseId as string);
    assert(caseDetail);
    assert.equal(caseDetail.caseData.title, "Repository-backed upload");
    assert.equal(caseDetail.documents.length, 1);
    assert.equal(caseDetail.claims.length >= 1, true);
    assert.equal(caseDetail.discrepancies.length, 1);
    assert.equal(caseDetail.auditLogs.length, 5);
    assert.deepEqual(
      caseDetail.auditLogs.map((entry) => entry.event_type).sort(),
      [
        "analysis.completed",
        "case.created",
        "claims.recorded",
        "discrepancies.recorded",
        "document.ingested",
      ],
    );
    assert.match(caseDetail.documents[0]?.file_url ?? "", /\/uploads\//);
    assert.equal(
      fs.existsSync(path.join(workspace, "uploads", String(caseId), "certificate.json")),
      true,
    );
  });

  await runTest("uploaded documents can be served back from local storage", async () => {
    const workspace = createWorkspace();
    applyWorkspaceEnv(workspace, { WATCH_MAX_UPLOAD_BYTES: "512" });
    setupSqliteSchema(workspace);

    const formData = new FormData();
    formData.append("title", "Stored file retrieval");
    formData.append(
      "documents",
      new File(
        ['{"document_type":"PDO Certificate","producer":"Marani","batch_id":"BATCH-2024-0042"}'],
        "certificate.json",
        { type: "application/json" },
      ),
    );

    const uploadResponse = await uploadCase(
      new Request("http://localhost/api/cases/upload", { method: "POST", body: formData }) as never,
    );
    const uploadPayload = await readJson(uploadResponse);
    const caseId = String(uploadPayload.caseId);

    const fileResponse = await getUploadedDocument(
      new Request(`http://localhost/uploads/${caseId}/certificate.json`) as never,
      {
        params: Promise.resolve({
          caseId,
          filename: "certificate.json",
        }),
      },
    );

    assert.equal(fileResponse.status, 200);
    assert.equal(fileResponse.headers.get("content-type"), "application/json");
    assert.equal(await fileResponse.text(), '{"document_type":"PDO Certificate","producer":"Marani","batch_id":"BATCH-2024-0042"}');
  });
}

void main();

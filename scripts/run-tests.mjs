import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  jsonDocumentToText,
  normalizeDocumentFilename,
  normalizeDocumentText,
} from "../lib/document-parsing.mjs";
import { auditEnvironment } from "./check-env.mjs";
import {
  applySqliteMigrations,
  getLatestSchemaVersion,
  getPendingSqliteMigrations,
} from "./watch-migrations.mjs";
import { resolveWatchConfig } from "./watch-config.mjs";

const requiredDependencies = [
  "next",
  "react",
  "react-dom",
  "better-sqlite3",
  "openai",
  "pdf-parse",
  "typescript",
];

function createFixtureWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "shield-check-env-"));
  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify({
      name: "fixture",
      dependencies: Object.fromEntries(requiredDependencies.map((name) => [name, "1.0.0"])),
    }),
  );

  for (const dependency of requiredDependencies) {
    const dependencyDir = path.join(workspace, "node_modules", dependency);
    fs.mkdirSync(dependencyDir, { recursive: true });
    fs.writeFileSync(
      path.join(dependencyDir, "package.json"),
      JSON.stringify({ name: dependency, version: "1.0.0" }),
    );
  }

  return workspace;
}

function captureLogger() {
  const messages = [];
  return {
    logger: {
      log(message) {
        messages.push(String(message));
      },
    },
    messages,
  };
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

runTest("check-env passes with default mock AI mode", () => {
  const workspace = createFixtureWorkspace();
  const { logger, messages } = captureLogger();

  auditEnvironment({ cwd: workspace, env: {}, logger });

  assert(messages.some((line) => line.includes("Environment audit passed.")));
});

runTest("check-env fails when mock mode is disabled without an API key", () => {
  const workspace = createFixtureWorkspace();
  const { logger } = captureLogger();

  assert.throws(
    () => auditEnvironment({ cwd: workspace, env: { WATCH_USE_MOCK_AI: "false" }, logger }),
    /OPENAI_API_KEY is required when WATCH_USE_MOCK_AI=false\./,
  );
});

runTest("check-env fails when postgres mode is enabled without a connection string", () => {
  const workspace = createFixtureWorkspace();
  const { logger } = captureLogger();

  assert.throws(
    () => auditEnvironment({ cwd: workspace, env: { WATCH_PERSISTENCE_MODE: "postgres" }, logger }),
    /DATABASE_URL is required when WATCH_PERSISTENCE_MODE=postgres\./,
  );
});

runTest("watch config keeps sqlite as the canonical default mode", () => {
  const workspace = createFixtureWorkspace();
  const config = resolveWatchConfig({
    cwd: workspace,
    env: {
      DATABASE_URL: "postgres://watch:secret@localhost:5432/watch",
    },
  });

  assert.equal(config.persistenceMode, "sqlite");
  assert.equal(config.persistenceModeSource, "default");
});

runTest("sqlite migrations create schema metadata and are idempotent", () => {
  const workspace = createFixtureWorkspace();
  const dbPath = path.join(workspace, "watch.db");
  const db = new Database(dbPath);
  db.function("gen_random_uuid", () => "00000000-0000-4000-8000-000000000000");

  const firstRun = applySqliteMigrations({ db, logger: { log() {} } });
  const secondRun = applySqliteMigrations({ db, logger: { log() {} } });
  const migrationRows = db
    .prepare("SELECT version, name FROM watch_schema_migrations ORDER BY version ASC")
    .all();

  assert.equal(firstRun.latestVersion, getLatestSchemaVersion());
  assert.equal(secondRun.latestVersion, getLatestSchemaVersion());
  assert.deepEqual(firstRun.appliedVersions, [1]);
  assert.deepEqual(secondRun.appliedVersions, [1]);
  assert.deepEqual(migrationRows, [{ version: 1, name: "initial_watch_schema" }]);
  assert.equal(
    db.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'cases'",
    ).get().count,
    1,
  );

  db.close();
});

runTest("sqlite migrations baseline an existing pre-migration schema", () => {
  const workspace = createFixtureWorkspace();
  const dbPath = path.join(workspace, "legacy-watch.db");
  const db = new Database(dbPath);
  db.function("gen_random_uuid", () => "00000000-0000-4000-8000-000000000000");
  db.exec(`
    CREATE TABLE cases (id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE documents (id TEXT PRIMARY KEY, case_id TEXT, filename TEXT NOT NULL, file_url TEXT NOT NULL);
    CREATE TABLE extracted_claims (id TEXT PRIMARY KEY, case_id TEXT, document_id TEXT, claim_type TEXT NOT NULL, claim_value TEXT NOT NULL);
    CREATE TABLE discrepancies (id TEXT PRIMARY KEY, case_id TEXT, title TEXT NOT NULL, plain_language_summary TEXT NOT NULL);
  `);

  const result = applySqliteMigrations({ db, logger: { log() {} } });
  const migrationRows = db
    .prepare("SELECT version, name FROM watch_schema_migrations ORDER BY version ASC")
    .all();

  assert.equal(result.latestVersion, getLatestSchemaVersion());
  assert.deepEqual(result.appliedVersions, [1]);
  assert.deepEqual(migrationRows, [{ version: 1, name: "initial_watch_schema" }]);

  db.close();
});

runTest("watch config parses upload limits and MIME types", () => {
  const workspace = createFixtureWorkspace();
  const config = resolveWatchConfig({
    cwd: workspace,
    env: {
      WATCH_MAX_DOCUMENTS: "3",
      WATCH_MAX_UPLOAD_BYTES: "2048",
      WATCH_ALLOWED_UPLOAD_MIME_TYPES: "application/pdf,text/plain",
    },
  });

  assert.equal(config.maxDocuments, 3);
  assert.equal(config.maxUploadBytes, 2048);
  assert.deepEqual(config.allowedUploadMimeTypes, ["application/pdf", "text/plain"]);
});

runTest("document parsing normalizes filenames and whitespace", () => {
  assert.equal(normalizeDocumentFilename(" ..\\Batch 42?.json "), "Batch 42-.json");
  assert.equal(normalizeDocumentText(" line one\r\n\r\n\r\nline\t\t two "), "line one\n\nline two");
});

runTest("document parsing converts JSON fixtures into searchable text", () => {
  const certificateFixture = fs.readFileSync(
    path.join(process.cwd(), "test-docs", "certificate.json"),
    "utf-8",
  );
  const exportFixture = fs.readFileSync(
    path.join(process.cwd(), "test-docs", "export-declaration.json"),
    "utf-8",
  );

  const certificateText = jsonDocumentToText(certificateFixture);
  const exportText = jsonDocumentToText(exportFixture);

  assert.match(certificateText, /document_type: PDO Certificate/);
  assert.match(certificateText, /certification_number: GEO-PDO-2024-1187/);
  assert.match(exportText, /origin_region: Kakheti, Georgia/);
  assert.match(exportText, /batch_id: BATCH-2024-0042/);
});

runTest("sample case fixtures reference real test documents", () => {
  const sampleCases = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "test-docs", "sample-cases.json"), "utf-8"),
  );

  assert(Array.isArray(sampleCases));
  assert(sampleCases.length >= 1);

  for (const sampleCase of sampleCases) {
    assert.equal(typeof sampleCase.title, "string");
    assert.equal(typeof sampleCase.description, "string");
    assert(Array.isArray(sampleCase.documents));
    assert(sampleCase.documents.length >= 1);

    for (const fixtureName of sampleCase.documents) {
      assert.equal(typeof fixtureName, "string");
      assert(
        fs.existsSync(path.join(process.cwd(), "test-docs", fixtureName)),
        `Missing fixture referenced by sample seed: ${fixtureName}`,
      );
    }
  }
});

runTest("sqlite migrations are versioned and idempotent", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "watch-migrations-"));
  const sqliteDbPath = path.join(workspace, "watch.db");
  const db = new Database(sqliteDbPath);
  db.function("gen_random_uuid", () => "test-uuid");

  try {
    const firstRun = applySqliteMigrations({
      db,
      logger: { log() {} },
    });
    assert.equal(firstRun.pendingCount, getLatestSchemaVersion());
    assert.equal(firstRun.latestVersion, getLatestSchemaVersion());
    assert.deepEqual(
      firstRun.appliedMigrations.map((migration) => migration.version),
      [1],
    );

    const secondRun = applySqliteMigrations({
      db,
      logger: { log() {} },
    });
    assert.equal(secondRun.pendingCount, 0);
    assert.equal(secondRun.latestVersion, getLatestSchemaVersion());

    const pendingMigrations = getPendingSqliteMigrations({ db });
    assert.equal(pendingMigrations.length, 0);
  } finally {
    db.close();
  }
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

const apiRouteTests = spawnSync(
  process.execPath,
  ["--import", "tsx", path.join(process.cwd(), "scripts", "api-route-tests.ts")],
  {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf-8",
  },
);

const apiRouteTestsOutput = [apiRouteTests.stdout, apiRouteTests.stderr].filter(Boolean).join("");

if (apiRouteTestsOutput) {
  process.stdout.write(apiRouteTestsOutput);
}

if (
  apiRouteTests.error?.code === "EPERM" ||
  apiRouteTests.stderr?.includes("Error: spawn EPERM")
) {
  console.warn("SKIP api route tests (subprocess spawn is blocked with EPERM in this environment)");
  process.exit(process.exitCode ?? 0);
}

if (apiRouteTests.status !== 0) {
  process.exit(apiRouteTests.status ?? 1);
}

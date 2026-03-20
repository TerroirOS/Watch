import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditEnvironment } from "./check-env.mjs";
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

if (process.exitCode) {
  process.exit(process.exitCode);
}

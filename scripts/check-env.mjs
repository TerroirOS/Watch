import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  DEFAULT_ALLOWED_UPLOAD_MIME_TYPES,
  DEFAULT_MAX_DOCUMENTS,
  DEFAULT_MAX_UPLOAD_BYTES,
  parseDotEnv,
  resolveWatchConfig,
} from "./watch-config.mjs";

const expectedDependencyNames = [
  "next",
  "react",
  "react-dom",
  "better-sqlite3",
  "openai",
  "pdf-parse",
  "typescript",
];

export function getInstalledDependencyVersion(name, cwd = process.cwd()) {
  const dependencyPackageJsonPath = path.join(cwd, "node_modules", name, "package.json");

  if (!fs.existsSync(dependencyPackageJsonPath)) {
    return null;
  }

  const dependencyPackageJson = JSON.parse(fs.readFileSync(dependencyPackageJsonPath, "utf-8"));
  return dependencyPackageJson.version ?? "unknown";
}

export function auditEnvironment({
  cwd = process.cwd(),
  env = process.env,
  logger = console,
} = {}) {
  const envFilePath = path.join(cwd, ".env.local");
  const packageJsonPath = path.join(cwd, "package.json");
  const envFileValues = parseDotEnv(envFilePath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const nodeMajorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  const watchConfig = resolveWatchConfig({ cwd, env, fileValues: envFileValues });

  logger.log("Terroir Watch local environment audit");
  logger.log(`- .env.local present: ${fs.existsSync(envFilePath) ? "yes" : "no (using defaults)"}`);
  logger.log(`- Node.js: ${process.versions.node}`);
  logger.log(`- Persistence mode: ${watchConfig.persistenceMode}`);
  if (watchConfig.persistenceMode === "postgres") {
    logger.log(`- PostgreSQL URL configured: ${watchConfig.databaseUrl ? "yes" : "no"}`);
  } else {
    logger.log(
      `- SQLite DB path: ${watchConfig.sqliteDbPath} (${watchConfig.configuredDbPath ? "WATCH_DB_PATH" : "default"})`,
    );
    logger.log(
      `- SQLite DB directory present: ${fs.existsSync(path.dirname(watchConfig.sqliteDbPath)) ? "yes" : "no"}`,
    );
  }
  logger.log(`- OpenAI API key configured: ${watchConfig.openAiApiKey ? "yes" : "no"}`);
  logger.log(`- Mock AI mode: ${watchConfig.useMockAi ? "enabled" : "disabled"}`);
  logger.log(`- OpenAI model: ${watchConfig.openAiModel}`);
  logger.log(`- Upload storage directory: ${watchConfig.uploadDirectory}`);
  logger.log(`- Upload public base path: ${watchConfig.uploadPublicBasePath}`);
  logger.log(
    `- Upload limits: ${watchConfig.maxDocuments} document(s) per case, ${watchConfig.maxUploadBytes} byte(s) per file`,
  );
  logger.log(
    `- Allowed upload MIME types: ${watchConfig.allowedUploadMimeTypes.join(", ")}`,
  );

  logger.log("- Dependency validation:");
  for (const dependencyName of expectedDependencyNames) {
    const declaredVersion =
      packageJson.dependencies?.[dependencyName] ??
      packageJson.devDependencies?.[dependencyName] ??
      "not declared";
    const installedVersion = getInstalledDependencyVersion(dependencyName, cwd);
    logger.log(
      `  - ${dependencyName}: declared ${declaredVersion}; installed ${installedVersion ?? "missing"}`,
    );
  }

  if (nodeMajorVersion < 20) {
    throw new Error("Node.js 20 or newer is required.");
  }

  const missingDependencies = expectedDependencyNames.filter(
    (dependencyName) => !getInstalledDependencyVersion(dependencyName, cwd),
  );
  if (missingDependencies.length > 0) {
    throw new Error(
      `Missing installed dependencies: ${missingDependencies.join(", ")}. Run npm.cmd install before continuing.`,
    );
  }

  if (watchConfig.maxDocuments !== DEFAULT_MAX_DOCUMENTS) {
    logger.log("- Custom document count limit active via WATCH_MAX_DOCUMENTS.");
  }

  if (watchConfig.maxUploadBytes !== DEFAULT_MAX_UPLOAD_BYTES) {
    logger.log("- Custom upload byte limit active via WATCH_MAX_UPLOAD_BYTES.");
  }

  if (
    watchConfig.allowedUploadMimeTypes.join(",") !==
    DEFAULT_ALLOWED_UPLOAD_MIME_TYPES.join(",")
  ) {
    logger.log("- Custom MIME allowlist active via WATCH_ALLOWED_UPLOAD_MIME_TYPES.");
  }

  logger.log("Environment audit passed.");
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isDirectRun) {
  try {
    auditEnvironment();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Environment audit failed.");
    process.exit(1);
  }
}

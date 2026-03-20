import fs from "fs";
import path from "path";

export const DEFAULT_SQLITE_DB_FILENAME = "watch.db";
export const DEFAULT_UPLOAD_DIRECTORY = "uploads";
export const DEFAULT_PUBLIC_UPLOAD_PATH = "/uploads";
export const DEFAULT_MAX_DOCUMENTS = 5;
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DEFAULT_ALLOWED_UPLOAD_MIME_TYPES = ["application/pdf", "application/json"];
export const DEFAULT_OPENAI_MODEL = "gpt-4o";
export const WATCH_PERSISTENCE_MODES = ["sqlite", "postgres"];

export function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return values;
}

export function readStringEnv(name, fileValues, env = process.env) {
  const processValue = env[name]?.trim();
  if (processValue) {
    return processValue;
  }

  const fileValue = fileValues[name]?.trim();
  return fileValue ? fileValue : undefined;
}

export function readBooleanEnv(name, fileValues, env = process.env) {
  const value = readStringEnv(name, fileValues, env)?.toLowerCase();
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export function readIntegerEnv(name, fileValues, env = process.env) {
  const value = readStringEnv(name, fileValues, env);
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

export function resolveWatchConfig({
  cwd = process.cwd(),
  env = process.env,
  fileValues,
} = {}) {
  const envFileValues = fileValues ?? parseDotEnv(path.join(cwd, ".env.local"));
  const persistenceModeValue = readStringEnv("WATCH_PERSISTENCE_MODE", envFileValues, env);
  const databaseUrl = readStringEnv("DATABASE_URL", envFileValues, env);
  const persistenceMode = persistenceModeValue ?? (databaseUrl ? "postgres" : "sqlite");

  if (!WATCH_PERSISTENCE_MODES.includes(persistenceMode)) {
    throw new Error(
      `WATCH_PERSISTENCE_MODE must be one of: ${WATCH_PERSISTENCE_MODES.join(", ")}.`,
    );
  }

  if (persistenceMode === "postgres" && !databaseUrl) {
    throw new Error("DATABASE_URL is required when WATCH_PERSISTENCE_MODE=postgres.");
  }

  const configuredDbPath = readStringEnv("WATCH_DB_PATH", envFileValues, env);
  const sqliteDbPath = configuredDbPath
    ? path.resolve(cwd, configuredDbPath)
    : path.join(cwd, DEFAULT_SQLITE_DB_FILENAME);

  const openAiApiKey = readStringEnv("OPENAI_API_KEY", envFileValues, env);
  const useMockAiValue = readBooleanEnv("WATCH_USE_MOCK_AI", envFileValues, env);
  const useMockAi = useMockAiValue !== undefined ? useMockAiValue : !openAiApiKey;
  const openAiModel = readStringEnv("WATCH_OPENAI_MODEL", envFileValues, env) ?? DEFAULT_OPENAI_MODEL;
  const uploadDirectoryValue =
    readStringEnv("WATCH_UPLOAD_DIR", envFileValues, env) ?? DEFAULT_UPLOAD_DIRECTORY;
  const uploadDirectory = path.resolve(cwd, uploadDirectoryValue);
  const uploadPublicBasePath =
    readStringEnv("WATCH_UPLOAD_PUBLIC_BASE", envFileValues, env) ?? DEFAULT_PUBLIC_UPLOAD_PATH;
  const maxDocuments = readIntegerEnv("WATCH_MAX_DOCUMENTS", envFileValues, env);
  const maxUploadBytes = readIntegerEnv("WATCH_MAX_UPLOAD_BYTES", envFileValues, env);
  const allowedUploadMimeTypesValue = readStringEnv(
    "WATCH_ALLOWED_UPLOAD_MIME_TYPES",
    envFileValues,
    env,
  );
  const allowedUploadMimeTypes = (
    allowedUploadMimeTypesValue
      ? allowedUploadMimeTypesValue.split(",").map((value) => value.trim()).filter(Boolean)
      : DEFAULT_ALLOWED_UPLOAD_MIME_TYPES
  ).map((value) => value.toLowerCase());

  const invalidBooleanEnvironmentVariables = ["WATCH_USE_MOCK_AI"].filter((name) => {
    return (
      readStringEnv(name, envFileValues, env) !== undefined &&
      readBooleanEnv(name, envFileValues, env) === undefined
    );
  });
  const invalidIntegerEnvironmentVariables = [
    "WATCH_MAX_DOCUMENTS",
    "WATCH_MAX_UPLOAD_BYTES",
  ].filter((name) => {
    return (
      readStringEnv(name, envFileValues, env) !== undefined &&
      readIntegerEnv(name, envFileValues, env) === undefined
    );
  });

  if (invalidBooleanEnvironmentVariables.length > 0) {
    throw new Error(
      `Invalid boolean env value(s): ${invalidBooleanEnvironmentVariables.join(", ")}. Use true, false, or leave empty.`,
    );
  }

  if (invalidIntegerEnvironmentVariables.length > 0) {
    throw new Error(
      `Invalid integer env value(s): ${invalidIntegerEnvironmentVariables.join(", ")}. Use positive whole numbers.`,
    );
  }

  if (!openAiApiKey && !useMockAi) {
    throw new Error("OPENAI_API_KEY is required when WATCH_USE_MOCK_AI=false.");
  }

  if (maxDocuments !== undefined && maxDocuments < 1) {
    throw new Error("WATCH_MAX_DOCUMENTS must be at least 1.");
  }

  if (maxUploadBytes !== undefined && maxUploadBytes < 1) {
    throw new Error("WATCH_MAX_UPLOAD_BYTES must be at least 1.");
  }

  if (!uploadPublicBasePath.startsWith("/")) {
    throw new Error("WATCH_UPLOAD_PUBLIC_BASE must start with '/'.");
  }

  if (allowedUploadMimeTypes.length === 0) {
    throw new Error("WATCH_ALLOWED_UPLOAD_MIME_TYPES must contain at least one MIME type.");
  }

  return {
    envFileValues,
    persistenceMode,
    databaseUrl,
    sqliteDbPath,
    configuredDbPath,
    openAiApiKey,
    useMockAi,
    openAiModel,
    uploadDirectory,
    uploadDirectoryValue,
    uploadPublicBasePath,
    maxDocuments: maxDocuments ?? DEFAULT_MAX_DOCUMENTS,
    maxUploadBytes: maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
    allowedUploadMimeTypes,
  };
}

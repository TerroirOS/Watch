import path from "path";

const DEFAULT_SQLITE_DB_FILENAME = "watch.db";
const DEFAULT_UPLOAD_DIRECTORY = "uploads";
const DEFAULT_PUBLIC_UPLOAD_PATH = "/uploads";
const DEFAULT_MAX_DOCUMENTS = 5;
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_ALLOWED_UPLOAD_MIME_TYPES = ["application/pdf", "application/json"];
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const WATCH_PERSISTENCE_MODES = ["sqlite", "postgres"] as const;

type WatchPersistenceMode = (typeof WATCH_PERSISTENCE_MODES)[number];

function readStringEnv(name: string, env = process.env): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readBooleanEnv(name: string, env = process.env): boolean | undefined {
  const value = readStringEnv(name, env)?.toLowerCase();
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function readIntegerEnv(name: string, env = process.env): number | undefined {
  const value = readStringEnv(name, env);
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

export interface WatchConfig {
  persistenceMode: WatchPersistenceMode;
  databaseUrl?: string;
  sqliteDbPath: string;
  useMockAi: boolean;
  openAiApiKey?: string;
  openAiModel: string;
  uploadDirectory: string;
  uploadPublicBasePath: string;
  maxDocuments: number;
  maxUploadBytes: number;
  allowedUploadMimeTypes: string[];
}

declare global {
  var watchConfigCache: WatchConfig | undefined;
}

export function getWatchConfig(env = process.env): WatchConfig {
  if (env === process.env && globalThis.watchConfigCache) {
    return globalThis.watchConfigCache;
  }

  const persistenceModeValue = readStringEnv("WATCH_PERSISTENCE_MODE", env);
  const databaseUrl = readStringEnv("DATABASE_URL", env);
  const persistenceMode = (persistenceModeValue ?? (databaseUrl ? "postgres" : "sqlite")) as
    | WatchPersistenceMode
    | string;

  if (!WATCH_PERSISTENCE_MODES.includes(persistenceMode as WatchPersistenceMode)) {
    throw new Error(
      `WATCH_PERSISTENCE_MODE must be one of: ${WATCH_PERSISTENCE_MODES.join(", ")}.`,
    );
  }

  if (persistenceMode === "postgres" && !databaseUrl) {
    throw new Error("DATABASE_URL is required when WATCH_PERSISTENCE_MODE=postgres.");
  }

  const openAiApiKey = readStringEnv("OPENAI_API_KEY", env);
  const useMockAiValue = readBooleanEnv("WATCH_USE_MOCK_AI", env);
  if (readStringEnv("WATCH_USE_MOCK_AI", env) !== undefined && useMockAiValue === undefined) {
    throw new Error("WATCH_USE_MOCK_AI must be true or false when set.");
  }

  const useMockAi = useMockAiValue !== undefined ? useMockAiValue : !openAiApiKey;
  if (!openAiApiKey && !useMockAi) {
    throw new Error("OPENAI_API_KEY is required when WATCH_USE_MOCK_AI=false.");
  }

  const maxDocuments = readIntegerEnv("WATCH_MAX_DOCUMENTS", env);
  if (readStringEnv("WATCH_MAX_DOCUMENTS", env) !== undefined && maxDocuments === undefined) {
    throw new Error("WATCH_MAX_DOCUMENTS must be a positive whole number.");
  }

  const maxUploadBytes = readIntegerEnv("WATCH_MAX_UPLOAD_BYTES", env);
  if (readStringEnv("WATCH_MAX_UPLOAD_BYTES", env) !== undefined && maxUploadBytes === undefined) {
    throw new Error("WATCH_MAX_UPLOAD_BYTES must be a positive whole number.");
  }

  const uploadPublicBasePath =
    readStringEnv("WATCH_UPLOAD_PUBLIC_BASE", env) ?? DEFAULT_PUBLIC_UPLOAD_PATH;
  if (!uploadPublicBasePath.startsWith("/")) {
    throw new Error("WATCH_UPLOAD_PUBLIC_BASE must start with '/'.");
  }

  const allowedUploadMimeTypes = (
    readStringEnv("WATCH_ALLOWED_UPLOAD_MIME_TYPES", env)
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? DEFAULT_ALLOWED_UPLOAD_MIME_TYPES
  ).map((value) => value.toLowerCase());

  if (allowedUploadMimeTypes.length === 0) {
    throw new Error("WATCH_ALLOWED_UPLOAD_MIME_TYPES must contain at least one MIME type.");
  }

  const config: WatchConfig = {
    persistenceMode: persistenceMode as WatchPersistenceMode,
    databaseUrl,
    sqliteDbPath: path.resolve(
      process.cwd(),
      readStringEnv("WATCH_DB_PATH", env) ?? DEFAULT_SQLITE_DB_FILENAME,
    ),
    useMockAi,
    openAiApiKey,
    openAiModel: readStringEnv("WATCH_OPENAI_MODEL", env) ?? DEFAULT_OPENAI_MODEL,
    uploadDirectory: path.resolve(
      process.cwd(),
      readStringEnv("WATCH_UPLOAD_DIR", env) ?? DEFAULT_UPLOAD_DIRECTORY,
    ),
    uploadPublicBasePath,
    maxDocuments: maxDocuments ?? DEFAULT_MAX_DOCUMENTS,
    maxUploadBytes: maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
    allowedUploadMimeTypes,
  };

  if (config.maxDocuments < 1) {
    throw new Error("WATCH_MAX_DOCUMENTS must be at least 1.");
  }

  if (config.maxUploadBytes < 1) {
    throw new Error("WATCH_MAX_UPLOAD_BYTES must be at least 1.");
  }

  if (env === process.env) {
    globalThis.watchConfigCache = config;
  }

  return config;
}

import fs from "node:fs/promises";
import path from "node:path";
import { getWatchConfig } from "@/lib/env";

export interface PersistDocumentInput {
  caseId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface StoredDocument {
  path: string;
  publicUrl: string;
}

export interface ReadStoredDocumentInput {
  caseId: string;
  filename: string;
}

export interface ReadStoredDocumentResult {
  path: string;
  buffer: Buffer;
}

interface WatchFileStorage {
  persistDocument(input: PersistDocumentInput): Promise<StoredDocument>;
  readDocument(input: ReadStoredDocumentInput): Promise<ReadStoredDocumentResult>;
  removeCaseDocuments(caseId: string): Promise<void>;
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

function resolveStoragePath(caseId: string, filename: string) {
  const { uploadDirectory } = getWatchConfig();
  const uploadsRoot = path.resolve(uploadDirectory);
  const storagePath = path.resolve(uploadsRoot, caseId, filename);

  if (storagePath !== uploadsRoot && !storagePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Resolved storage path escaped the configured uploads directory.");
  }

  return storagePath;
}

function resolveCaseStorageDirectory(caseId: string) {
  const { uploadDirectory } = getWatchConfig();
  const uploadsRoot = path.resolve(uploadDirectory);
  const caseDirectory = path.resolve(uploadsRoot, caseId);

  if (caseDirectory !== uploadsRoot && !caseDirectory.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Resolved storage path escaped the configured uploads directory.");
  }

  return caseDirectory;
}

const localFileStorage: WatchFileStorage = {
  async persistDocument({ caseId, filename, buffer }) {
    const { uploadPublicBasePath } = getWatchConfig();
    const storagePath = resolveStoragePath(caseId, filename);
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.writeFile(storagePath, buffer);

    return {
      path: storagePath,
      publicUrl: `${uploadPublicBasePath}/${encodePathSegment(caseId)}/${encodePathSegment(filename)}`,
    };
  },

  async readDocument({ caseId, filename }) {
    const storagePath = resolveStoragePath(caseId, filename);
    const buffer = await fs.readFile(storagePath);

    return {
      path: storagePath,
      buffer,
    };
  },

  async removeCaseDocuments(caseId) {
    const caseDirectory = resolveCaseStorageDirectory(caseId);
    await fs.rm(caseDirectory, { recursive: true, force: true });
  },
};

export function getWatchFileStorage(): WatchFileStorage {
  const { fileStorageMode } = getWatchConfig();

  switch (fileStorageMode) {
    case "local":
      return localFileStorage;
    default:
      throw new Error(`Unsupported file storage mode: ${String(fileStorageMode)}`);
  }
}

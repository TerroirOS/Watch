import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import pg from "pg";
import { resolveWatchConfig } from "./watch-config.mjs";

const { Pool } = pg;

const sqliteSchemaSql = `
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    title TEXT NOT NULL,
    description TEXT,
    ai_summary TEXT,
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    extracted_text TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS extracted_claims (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    claim_type TEXT NOT NULL,
    claim_value TEXT NOT NULL,
    confidence_score REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS discrepancies (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    plain_language_summary TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    created_at TEXT DEFAULT (datetime('now'))
  );
`;

const postgresSchemaSql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    ai_summary TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    extracted_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS extracted_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    claim_type TEXT NOT NULL,
    claim_value TEXT NOT NULL,
    confidence_score REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    plain_language_summary TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

async function run() {
  const watchConfig = resolveWatchConfig({ cwd: process.cwd() });

  if (watchConfig.persistenceMode === "postgres") {
    console.log("Setting up PostgreSQL database schema ...");
    const pool = new Pool({ connectionString: watchConfig.databaseUrl });

    try {
      await pool.query(postgresSchemaSql);
      console.log("PostgreSQL schema created successfully.");
    } finally {
      await pool.end();
    }

    return;
  }

  console.log(`Setting up SQLite database at ${watchConfig.sqliteDbPath} ...`);

  fs.mkdirSync(path.dirname(watchConfig.sqliteDbPath), { recursive: true });
  const db = new Database(watchConfig.sqliteDbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.function("gen_random_uuid", () => randomUUID());
  db.exec(sqliteSchemaSql);

  console.log("Schema created successfully.");
  db.close();
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "Database setup failed.");
  process.exit(1);
});

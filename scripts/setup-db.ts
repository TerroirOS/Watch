import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { getWatchDbPath } from '../lib/env';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DB_PATH = getWatchDbPath();

function run() {
    console.log(`Setting up SQLite database at ${DB_PATH} ...`);

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.function('gen_random_uuid', () => randomUUID());

    db.exec(`
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
    `);

    console.log('Schema created successfully.');
    db.close();
}

run();

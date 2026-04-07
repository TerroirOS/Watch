import pg from "pg";

const { Pool } = pg;

const sqliteMigrationTableSql = `
  CREATE TABLE IF NOT EXISTS watch_schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const postgresMigrationTableSql = `
  CREATE TABLE IF NOT EXISTS watch_schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

export const WATCH_MIGRATIONS = [
  {
    version: 1,
    name: "initial_watch_schema",
    sqliteSql: `
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
    `,
    postgresSql: `
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
    `,
  },
];

function listPendingMigrations(appliedVersions) {
  return WATCH_MIGRATIONS.filter((migration) => !appliedVersions.has(migration.version));
}

export function getLatestSchemaVersion() {
  return WATCH_MIGRATIONS.at(-1)?.version ?? 0;
}

export function getPendingSqliteMigrations({ db }) {
  db.exec(sqliteMigrationTableSql);
  const appliedVersions = new Set(
    db
      .prepare("SELECT version FROM watch_schema_migrations ORDER BY version ASC")
      .all()
      .map((row) => row.version),
  );

  return listPendingMigrations(appliedVersions);
}

export function applySqliteMigrations({ db, logger = console }) {
  const pendingMigrations = getPendingSqliteMigrations({ db });

  for (const migration of pendingMigrations) {
    const applyMigration = db.transaction(() => {
      db.exec(migration.sqliteSql);
      db.prepare("INSERT INTO watch_schema_migrations (version, name) VALUES (?, ?)")
        .run(migration.version, migration.name);
    });

    applyMigration();
    logger.log(`Applied SQLite migration v${migration.version}: ${migration.name}`);
  }

  const appliedMigrations = db
    .prepare("SELECT version, name, applied_at FROM watch_schema_migrations ORDER BY version ASC")
    .all();

  return {
    latestVersion: appliedMigrations.at(-1)?.version ?? 0,
    pendingCount: pendingMigrations.length,
    appliedVersions: appliedMigrations.map((migration) => migration.version),
    appliedMigrations,
  };
}

async function getPendingPostgresMigrations({ pool }) {
  await pool.query(postgresMigrationTableSql);
  const result = await pool.query(
    "SELECT version FROM watch_schema_migrations ORDER BY version ASC",
  );
  const appliedVersions = new Set(result.rows.map((row) => row.version));
  return listPendingMigrations(appliedVersions);
}

export async function applyPostgresMigrations({ connectionString, logger = console }) {
  const pool = new Pool({ connectionString });

  try {
    const pendingMigrations = await getPendingPostgresMigrations({ pool });

    for (const migration of pendingMigrations) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(migration.postgresSql);
        await client.query(
          "INSERT INTO watch_schema_migrations (version, name) VALUES ($1, $2)",
          [migration.version, migration.name],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      logger.log(`Applied PostgreSQL migration v${migration.version}: ${migration.name}`);
    }

    const appliedMigrations = (
      await pool.query(
        "SELECT version, name, applied_at FROM watch_schema_migrations ORDER BY version ASC",
      )
    ).rows;

    return {
      latestVersion: appliedMigrations.at(-1)?.version ?? 0,
      pendingCount: pendingMigrations.length,
      appliedVersions: appliedMigrations.map((migration) => migration.version),
      appliedMigrations,
    };
  } finally {
    await pool.end();
  }
}

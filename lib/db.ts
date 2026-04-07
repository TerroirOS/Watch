import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { Pool, type PoolClient } from "pg";
import { getWatchConfig } from "@/lib/env";

type SqlValue = string | number | null | Uint8Array;
type QueryRow = object;

interface QueryResult<TRow extends QueryRow> {
  rows: TRow[];
}

interface MutationResult {
  rowCount: number;
}

interface DatabaseAdapterInfo {
  persistenceMode: "sqlite" | "postgres";
  persistenceModeSource: "default" | "explicit";
  sqliteDbPath?: string;
  hasDatabaseUrl: boolean;
}

interface DatabaseExecutor {
  query<TRow extends QueryRow = QueryRow>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<QueryResult<TRow>>;
  execute(sql: string, params?: readonly SqlValue[]): Promise<MutationResult>;
  insertReturningId(sql: string, params?: readonly SqlValue[]): Promise<string>;
}

const globalForDb = globalThis as unknown as {
  sqliteDb: Database.Database | undefined;
  postgresPool: Pool | undefined;
};

function getSqliteDb(): Database.Database {
  const watchConfig = getWatchConfig();

  if (!globalForDb.sqliteDb) {
    fs.mkdirSync(path.dirname(watchConfig.sqliteDbPath), { recursive: true });
    globalForDb.sqliteDb = new Database(watchConfig.sqliteDbPath);
    globalForDb.sqliteDb.pragma("journal_mode = WAL");
    globalForDb.sqliteDb.pragma("foreign_keys = ON");
    globalForDb.sqliteDb.function("gen_random_uuid", () => randomUUID());
  }

  return globalForDb.sqliteDb;
}

function getPostgresPool(): Pool {
  const watchConfig = getWatchConfig();

  if (!watchConfig.databaseUrl) {
    throw new Error("DATABASE_URL is required when WATCH_PERSISTENCE_MODE=postgres.");
  }

  if (!globalForDb.postgresPool) {
    globalForDb.postgresPool = new Pool({
      connectionString: watchConfig.databaseUrl,
    });
  }

  return globalForDb.postgresPool;
}

function normalizeSqlForSqlite(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

function isReadQuery(sql: string): boolean {
  const normalizedSql = sql.trim().toUpperCase();
  return normalizedSql.startsWith("SELECT") || normalizedSql.startsWith("WITH");
}

function normalizePgParams(params: readonly SqlValue[]): (string | number | null | Uint8Array)[] {
  return [...params];
}

function createPostgresExecutor(client: Pool | PoolClient): DatabaseExecutor {
  return {
    async query<TRow extends QueryRow = QueryRow>(
      sql: string,
      params: readonly SqlValue[] = [],
    ): Promise<QueryResult<TRow>> {
      const result = await client.query<TRow>(sql, normalizePgParams(params));
      return { rows: result.rows };
    },

    async execute(sql: string, params: readonly SqlValue[] = []): Promise<MutationResult> {
      const result = await client.query(sql, normalizePgParams(params));
      return { rowCount: result.rowCount ?? 0 };
    },

    async insertReturningId(sql: string, params: readonly SqlValue[] = []): Promise<string> {
      const result = await client.query<{ id: string }>(
        `${sql.trim()} RETURNING id`,
        normalizePgParams(params),
      );
      const id = result.rows[0]?.id;

      if (!id) {
        throw new Error("Insert did not return an id.");
      }

      return id;
    },
  };
}

function createSqliteExecutor(sqlite: Database.Database): DatabaseExecutor {
  return {
    async query<TRow extends QueryRow = QueryRow>(
      sql: string,
      params: readonly SqlValue[] = [],
    ): Promise<QueryResult<TRow>> {
      if (!isReadQuery(sql)) {
        throw new Error("Use db.execute or db.insertReturningId for write operations.");
      }

      const rows = sqlite.prepare(normalizeSqlForSqlite(sql)).all(...params) as TRow[];
      return { rows };
    },

    async execute(sql: string, params: readonly SqlValue[] = []): Promise<MutationResult> {
      const result = sqlite.prepare(normalizeSqlForSqlite(sql)).run(...params);
      return { rowCount: result.changes };
    },

    async insertReturningId(sql: string, params: readonly SqlValue[] = []): Promise<string> {
      const normalizedSql = normalizeSqlForSqlite(sql);
      const tableMatch = normalizedSql.match(/INSERT\s+INTO\s+(\w+)/i);
      const tableName = tableMatch?.[1];

      if (!tableName) {
        throw new Error("Could not determine SQLite table name for insert.");
      }

      const result = sqlite.prepare(normalizedSql).run(...params);
      const insertedRow = sqlite
        .prepare(`SELECT id FROM ${tableName} WHERE rowid = ?`)
        .get(result.lastInsertRowid) as { id?: string } | undefined;
      const id = insertedRow?.id;

      if (!id) {
        throw new Error(`Insert into ${tableName} did not return an id.`);
      }

      return id;
    },
  };
}

function getExecutor(): DatabaseExecutor {
  const watchConfig = getWatchConfig();
  return watchConfig.persistenceMode === "postgres"
    ? createPostgresExecutor(getPostgresPool())
    : createSqliteExecutor(getSqliteDb());
}

async function withPostgresTransaction<T>(
  fn: (executor: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const result = await fn(createPostgresExecutor(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function withSqliteTransaction<T>(
  fn: (executor: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  const sqlite = getSqliteDb();
  sqlite.exec("BEGIN IMMEDIATE");

  try {
    const result = await fn(createSqliteExecutor(sqlite));
    sqlite.exec("COMMIT");
    return result;
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

export const db = {
  getAdapterInfo(): DatabaseAdapterInfo {
    const watchConfig = getWatchConfig();
    return {
      persistenceMode: watchConfig.persistenceMode,
      persistenceModeSource: watchConfig.persistenceModeSource,
      sqliteDbPath:
        watchConfig.persistenceMode === "sqlite" ? watchConfig.sqliteDbPath : undefined,
      hasDatabaseUrl: Boolean(watchConfig.databaseUrl),
    };
  },

  async query<TRow extends QueryRow = QueryRow>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<QueryResult<TRow>> {
    return getExecutor().query<TRow>(sql, params);
  },

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<MutationResult> {
    return getExecutor().execute(sql, params);
  },

  async insertReturningId(sql: string, params: readonly SqlValue[] = []): Promise<string> {
    return getExecutor().insertReturningId(sql, params);
  },

  async transaction<T>(fn: (executor: DatabaseExecutor) => Promise<T>): Promise<T> {
    const watchConfig = getWatchConfig();
    return watchConfig.persistenceMode === "postgres"
      ? withPostgresTransaction(fn)
      : withSqliteTransaction(fn);
  },
};

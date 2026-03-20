import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import { getWatchConfig } from "@/lib/env";

type SqlValue = string | number | null | Uint8Array;
type QueryRow = object;

interface QueryResult<TRow extends QueryRow> {
  rows: TRow[];
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

export const db = {
  async query<TRow extends QueryRow = QueryRow>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<QueryResult<TRow>> {
    const watchConfig = getWatchConfig();

    if (watchConfig.persistenceMode === "postgres") {
      const result = await getPostgresPool().query<TRow>(
        sql,
        params as (string | number | null)[],
      );
      return { rows: result.rows };
    }

    const sqlite = getSqliteDb();
    const convertedSql = sql.replace(/\$\d+/g, "?");
    const trimmed = convertedSql.trim().toUpperCase();
    const isSelect = trimmed.startsWith("SELECT");
    const hasReturning = trimmed.includes("RETURNING");

    if (isSelect) {
      const rows = sqlite.prepare(convertedSql).all(...params) as TRow[];
      return { rows };
    }

    if (hasReturning) {
      const returningMatch = convertedSql.match(/RETURNING\s+(.+)$/i);
      const returningCols = returningMatch ? returningMatch[1].trim() : "id";
      const baseSql = convertedSql.replace(/\s+RETURNING\s+.+$/i, "").trim();

      if (trimmed.startsWith("INSERT")) {
        const result = sqlite.prepare(baseSql).run(...params);
        const lastId = result.lastInsertRowid;
        const tableMatch = baseSql.match(/INSERT\s+INTO\s+(\w+)/i);
        const table = tableMatch ? tableMatch[1] : "";
        const row = sqlite
          .prepare(`SELECT ${returningCols} FROM ${table} WHERE rowid = ?`)
          .get(lastId) as TRow | undefined;

        return { rows: row ? [row] : [] };
      }

      if (trimmed.startsWith("UPDATE")) {
        const tableMatch = baseSql.match(/UPDATE\s+(\w+)/i);
        const table = tableMatch ? tableMatch[1] : "";
        const whereMatch = baseSql.match(/WHERE\s+(.+)$/i);

        sqlite.prepare(baseSql).run(...params);

        if (whereMatch) {
          const whereClause = whereMatch[1];
          const row = sqlite
            .prepare(`SELECT ${returningCols} FROM ${table} WHERE ${whereClause}`)
            .get(params.at(-1)) as TRow | undefined;

          return { rows: row ? [row] : [] };
        }
      }
    }

    sqlite.prepare(convertedSql).run(...params);
    return { rows: [] };
  },
};

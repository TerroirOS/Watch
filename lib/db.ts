import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';

const DB_PATH = path.join(process.cwd(), 'watch.db');

const globalForDb = globalThis as unknown as {
    sqliteDb: Database.Database | undefined;
};

function getDb(): Database.Database {
    if (!globalForDb.sqliteDb) {
        globalForDb.sqliteDb = new Database(DB_PATH);
        globalForDb.sqliteDb.pragma('journal_mode = WAL');
        globalForDb.sqliteDb.pragma('foreign_keys = ON');

        // Register a gen_random_uuid() SQL function so existing queries work
        globalForDb.sqliteDb.function('gen_random_uuid', () => randomUUID());
    }
    return globalForDb.sqliteDb;
}

/**
 * pg-compatible query adapter for SQLite.
 * Accepts $1, $2... style parameterized queries and returns { rows: [...] }.
 */
export const db = {
    query(sql: string, params?: any[]): { rows: any[] } {
        const sqlite = getDb();

        // Convert pg-style $1, $2 placeholders to SQLite ? placeholders
        let idx = 0;
        const convertedSql = sql.replace(/\$\d+/g, () => {
            idx++;
            return '?';
        });

        const trimmed = convertedSql.trim().toUpperCase();
        const isSelect = trimmed.startsWith('SELECT');
        const hasReturning = trimmed.includes('RETURNING');

        if (isSelect) {
            const rows = sqlite.prepare(convertedSql).all(...(params || []));
            return { rows };
        }

        if (hasReturning) {
            // SQLite doesn't support RETURNING natively — split into exec + select
            const returningMatch = convertedSql.match(/RETURNING\s+(.+)$/i);
            const returningCols = returningMatch ? returningMatch[1].trim() : 'id';
            const baseSql = convertedSql.replace(/\s+RETURNING\s+.+$/i, '').trim();

            if (trimmed.startsWith('INSERT')) {
                const stmt = sqlite.prepare(baseSql);
                const result = stmt.run(...(params || []));
                const lastId = result.lastInsertRowid;

                // Determine table name from INSERT INTO <table>
                const tableMatch = baseSql.match(/INSERT\s+INTO\s+(\w+)/i);
                const table = tableMatch ? tableMatch[1] : '';

                const row = sqlite.prepare(`SELECT ${returningCols} FROM ${table} WHERE rowid = ?`).get(lastId);
                return { rows: row ? [row] : [] };
            } else if (trimmed.startsWith('UPDATE')) {
                // For UPDATE...RETURNING, capture affected rows via changes()
                const tableMatch = baseSql.match(/UPDATE\s+(\w+)/i);
                const table = tableMatch ? tableMatch[1] : '';
                const whereMatch = baseSql.match(/WHERE\s+(.+)$/i);

                sqlite.prepare(baseSql).run(...(params || []));

                if (whereMatch) {
                    const whereClause = whereMatch[1];
                    // Re-use same params that come after SET clause params for WHERE
                    const selectSql = `SELECT ${returningCols} FROM ${table} WHERE ${whereClause}`;
                    // Estimate which params belong to WHERE — this is tricky;
                    // for our simple UPDATE...WHERE id=$N case, take the last param
                    const row = sqlite.prepare(selectSql).get(params?.[params.length - 1]);
                    return { rows: row ? [row] : [] };
                }
                return { rows: [] };
            }
        }

        // Plain INSERT / UPDATE / DELETE without RETURNING
        sqlite.prepare(convertedSql).run(...(params || []));
        return { rows: [] };
    },
};

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { resolveWatchConfig } from "./watch-config.mjs";
import {
  applyPostgresMigrations,
  applySqliteMigrations,
  getLatestSchemaVersion,
} from "./watch-migrations.mjs";

async function run() {
  const watchConfig = resolveWatchConfig({ cwd: process.cwd() });

  if (watchConfig.persistenceMode === "postgres") {
    console.log("Applying PostgreSQL database migrations ...");
    const result = await applyPostgresMigrations({
      connectionString: watchConfig.databaseUrl,
      logger: console,
    });
    console.log(
      `PostgreSQL schema is ready at version ${result.latestVersion}/${getLatestSchemaVersion()}.`,
    );

    return;
  }

  console.log(`Applying SQLite database migrations at ${watchConfig.sqliteDbPath} ...`);

  fs.mkdirSync(path.dirname(watchConfig.sqliteDbPath), { recursive: true });
  const db = new Database(watchConfig.sqliteDbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.function("gen_random_uuid", () => randomUUID());
  const result = applySqliteMigrations({ db, logger: console });

  console.log(`SQLite schema is ready at version ${result.latestVersion}/${getLatestSchemaVersion()}.`);
  db.close();
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "Database migration failed.");
  process.exit(1);
});

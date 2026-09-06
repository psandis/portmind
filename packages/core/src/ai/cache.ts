import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Expands a leading ~ to the user's home directory, same convention as the rest of the config. */
function expandHome(filePath: string): string {
  return filePath.startsWith("~") ? path.join(os.homedir(), filePath.slice(1)) : filePath;
}

/**
 * Caches AI explanations keyed by (process_name, port), per the spec, so
 * repeat `explain` calls for the same shape of thing don't re-call a paid
 * API. Lazily creates the db file and table on first use.
 */
export class AiExplanationCache {
  private db: Database.Database;

  constructor(dbPath: string) {
    const resolved = expandHome(dbPath);
    mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new Database(resolved);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_explanations (
        process_name TEXT NOT NULL,
        port INTEGER NOT NULL,
        explanation TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (process_name, port)
      )
    `);
  }

  get(processName: string, port: number): string | null {
    const row = this.db
      .prepare("SELECT explanation FROM ai_explanations WHERE process_name = ? AND port = ?")
      .get(processName, port) as { explanation: string } | undefined;
    return row?.explanation ?? null;
  }

  set(processName: string, port: number, explanation: string): void {
    this.db
      .prepare(
        `INSERT INTO ai_explanations (process_name, port, explanation, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (process_name, port) DO UPDATE SET explanation = excluded.explanation, created_at = excluded.created_at`,
      )
      .run(processName, port, explanation, new Date().toISOString());
  }

  close(): void {
    this.db.close();
  }
}

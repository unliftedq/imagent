import type { DatabaseType } from "../db.js";

/**
 * Tiny JSON-encoded key/value store backed by the `kv` table. Used for
 * workspace state (architecture.md §7) — recent boards, prompt drafts,
 * sidebar collapsed, last-used assets, window bounds. Renderer-driven and
 * write-frequent, deliberately separate from config.json.
 */
export class KvRepository {
  constructor(private readonly db: DatabaseType) {}

  get<T = unknown>(key: string): T | null {
    const row = this.db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as T;
  }

  set(key: string, value: unknown): void {
    const serialized = JSON.stringify(value);
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO kv(key, value, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(key, serialized, now);
  }

  delete(key: string): void {
    this.db.prepare("DELETE FROM kv WHERE key = ?").run(key);
  }

  keys(prefix?: string): string[] {
    if (prefix) {
      const rows = this.db
        .prepare("SELECT key FROM kv WHERE key LIKE ? ORDER BY key")
        .all(`${prefix}%`) as { key: string }[];
      return rows.map((r) => r.key);
    }
    const rows = this.db.prepare("SELECT key FROM kv ORDER BY key").all() as { key: string }[];
    return rows.map((r) => r.key);
  }
}

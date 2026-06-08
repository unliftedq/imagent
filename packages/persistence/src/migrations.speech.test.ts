import type { Database as DatabaseType } from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { BUILTIN_MIGRATIONS, currentVersion, migrate, openDatabase } from "./db.js";

function insertGalleryItem(db: DatabaseType, id: string, kind: string): void {
  db.prepare(
    `INSERT INTO gallery_items (id, kind, prompt, provider_id, model, params_json, rel_path, bytes, created_at)
     VALUES (?, ?, ?, 'p', 'm', '{}', 'g/x', 1, 1000)`,
  ).run(id, kind, `${kind} prompt`);
}

describe("005 speech migration", () => {
  it("applies all migrations from scratch", () => {
    const db = openDatabase(":memory:");
    try {
      expect(currentVersion(db)).toBe(5);
    } finally {
      db.close();
    }
  });

  it("allows kind='speech' on gallery_items and jobs", () => {
    const db = openDatabase(":memory:");
    try {
      expect(() => insertGalleryItem(db, "a1", "speech")).not.toThrow();
      expect(() =>
        db
          .prepare(
            `INSERT INTO jobs (id, kind, state, provider_id, request_json, created_at, updated_at)
             VALUES ('j1','speech','running','p','{}',1,1)`,
          )
          .run(),
      ).not.toThrow();
    } finally {
      db.close();
    }
  });

  it("still rejects unknown kinds (constraint intact)", () => {
    const db = openDatabase(":memory:");
    try {
      expect(() => insertGalleryItem(db, "x1", "text")).toThrow();
    } finally {
      db.close();
    }
  });

  it("migrates existing audio rows to speech and rejects new audio rows", () => {
    const db = openDatabase(":memory:", { migrations: BUILTIN_MIGRATIONS.slice(0, 4) });
    try {
      insertGalleryItem(db, "a2", "audio");
      db
        .prepare(
          `INSERT INTO jobs (id, kind, state, provider_id, request_json, created_at, updated_at)
           VALUES ('j2','audio','running','p','{}',1,1)`,
        )
        .run();

      migrate(db, BUILTIN_MIGRATIONS);

      expect(currentVersion(db)).toBe(5);
      expect(db.prepare(`SELECT kind FROM gallery_items WHERE id = 'a2'`).get()).toEqual({
        kind: "speech",
      });
      expect(db.prepare(`SELECT kind FROM jobs WHERE id = 'j2'`).get()).toEqual({
        kind: "speech",
      });
      expect(() => insertGalleryItem(db, "a3", "audio")).toThrow();
    } finally {
      db.close();
    }
  });

  it("keeps FTS search working for speech rows", () => {
    const db = openDatabase(":memory:");
    try {
      insertGalleryItem(db, "a4", "speech");
      const rows = db
        .prepare(
          `SELECT g.id FROM gallery_items g
           JOIN gallery_items_fts f ON f.rowid = g.rowid
           WHERE f.gallery_items_fts MATCH 'speech'`,
        )
        .all() as { id: string }[];
      expect(rows.some((r) => r.id === "a4")).toBe(true);
    } finally {
      db.close();
    }
  });
});

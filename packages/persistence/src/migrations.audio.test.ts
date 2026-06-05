import { describe, expect, it } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { currentVersion, openDatabase } from "./db.js";

function insertGalleryItem(db: DatabaseType, id: string, kind: string): void {
  db.prepare(
    `INSERT INTO gallery_items (id, kind, prompt, provider_id, model, params_json, rel_path, bytes, created_at)
     VALUES (?, ?, ?, 'p', 'm', '{}', 'g/x', 1, 1000)`,
  ).run(id, kind, `${kind} prompt`);
}

describe("004 audio migration", () => {
  it("applies all migrations from scratch", () => {
    const db = openDatabase(":memory:");
    try {
      expect(currentVersion(db)).toBe(4);
    } finally {
      db.close();
    }
  });

  it("allows kind='audio' on gallery_items and jobs", () => {
    const db = openDatabase(":memory:");
    try {
      expect(() => insertGalleryItem(db, "a1", "audio")).not.toThrow();
      expect(() =>
        db
          .prepare(
            `INSERT INTO jobs (id, kind, state, provider_id, request_json, created_at, updated_at)
             VALUES ('j1','audio','running','p','{}',1,1)`,
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

  it("keeps FTS search working for audio rows", () => {
    const db = openDatabase(":memory:");
    try {
      insertGalleryItem(db, "a2", "audio");
      const rows = db
        .prepare(
          `SELECT g.id FROM gallery_items g
           JOIN gallery_items_fts f ON f.rowid = g.rowid
           WHERE f.gallery_items_fts MATCH 'audio'`,
        )
        .all() as { id: string }[];
      expect(rows.some((r) => r.id === "a2")).toBe(true);
    } finally {
      db.close();
    }
  });
});

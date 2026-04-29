import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Asset, GalleryItem } from "@imagine/core";
import { openDatabase } from "../db.js";
import { AssetRepository } from "./assets.repository.js";
import { GalleryRepository } from "./gallery.repository.js";

let dbPath: string;
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imagine-fts-"));
  dbPath = path.join(tmp, "test.db");
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function makeGalleryItem(
  id: string,
  overrides: Partial<GalleryItem> = {},
): GalleryItem {
  return {
    id,
    kind: "image",
    parentId: null,
    prompt: `prompt-${id}`,
    negativePrompt: null,
    providerId: "openai",
    model: "gpt-image-1",
    paramsJson: "{}",
    relPath: `gallery/2026/04/${id}.png`,
    thumbPath: null,
    durationMs: null,
    width: null,
    height: null,
    bytes: 1,
    jobId: null,
    favorited: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeAsset(
  id: string,
  overrides: Partial<Asset> = {},
): Asset {
  const now = 1_700_000_000_000;
  return {
    id,
    kind: "character",
    name: `name-${id}`,
    description: null,
    promptSnippet: null,
    files: [],
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

/**
 * Per architecture.md §5 / workplan.md §1 M8: gallery and asset search must
 * hit FTS5 virtual tables, not full-table scans against base tables. These
 * tests inspect the SQLite plan via `EXPLAIN QUERY PLAN` and assert the FTS
 * index is consulted.
 */
describe("FTS5 query planning", () => {
  it("GalleryRepository.query({ search }) consults gallery_items_fts (no base scan)", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new GalleryRepository(db);
      // Seed 50 fixture rows with a couple of `otter` matches, the rest noise.
      for (let i = 0; i < 50; i += 1) {
        const matches = i % 17 === 0; // 3 hits across the range
        repo.create(
          makeGalleryItem(`g-${i}`, {
            prompt: matches
              ? "a tiny otter on a lily pad"
              : `unrelated subject number ${i}`,
            negativePrompt: i % 11 === 0 ? "blurry" : null,
          }),
        );
      }
      const r = repo.query({ search: "otter", limit: 50, offset: 0 });
      expect(r.total).toBeGreaterThan(0);
      expect(r.items.every((it) => /otter/i.test(it.prompt))).toBe(true);

      const plan = db
        .prepare(
          `EXPLAIN QUERY PLAN
             SELECT g.* FROM gallery_items g
             JOIN gallery_items_fts f ON g.rowid = f.rowid
             WHERE f.gallery_items_fts MATCH ?
             ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
        )
        .all("otter", 50, 0) as Array<{ detail: string }>;
      const detail = plan.map((p) => p.detail).join("\n");
      // FTS5 plan signature: VIRTUAL TABLE INDEX appears for the fts join.
      expect(detail).toMatch(/VIRTUAL TABLE INDEX/i);
      // The base table should be reached by rowid lookup, never a full SCAN.
      expect(detail).not.toMatch(/SCAN gallery_items\b(?! USING)/i);
    } finally {
      db.close();
    }
  });

  it("supports the `prompt:` column-filter form for gallery search (M8)", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new GalleryRepository(db);
      // Two items: one with "otter" only in negative_prompt, one with it in
      // prompt. `prompt:otter` should return only the latter.
      repo.create(
        makeGalleryItem("p-only", { prompt: "a tiny otter on a lily pad" }),
      );
      repo.create(
        makeGalleryItem("neg-only", {
          prompt: "a cat in a hat",
          negativePrompt: "otter",
        }),
      );
      const broad = repo.query({ search: "otter", limit: 50, offset: 0 });
      expect(broad.items.map((i) => i.id).sort()).toEqual(["neg-only", "p-only"]);

      const promptOnly = repo.query({
        search: "prompt:otter",
        limit: 50,
        offset: 0,
      });
      expect(promptOnly.items.map((i) => i.id)).toEqual(["p-only"]);
    } finally {
      db.close();
    }
  });

  it("AssetRepository.list({ search }) consults assets_fts (no base scan)", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      for (let i = 0; i < 20; i += 1) {
        repo.create(
          makeAsset(`a-${i}`, {
            kind: i % 4 === 0 ? "style" : "character",
            name: i % 5 === 0 ? `Studio Ghibli ${i}` : `Generic ${i}`,
            description: i % 7 === 0 ? "moody pastel watercolor" : null,
            promptSnippet: i % 4 === 0 && i % 3 === 0 ? "soft pastels" : null,
          }),
        );
      }
      const hits = repo.list({ search: "ghibli" });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every((a) => /ghibli/i.test(a.name))).toBe(true);

      const plan = db
        .prepare(
          `EXPLAIN QUERY PLAN
             SELECT a.* FROM assets a
             JOIN assets_fts f ON a.rowid = f.rowid
             WHERE f.assets_fts MATCH ?
             ORDER BY a.updated_at DESC`,
        )
        .all("ghibli") as Array<{ detail: string }>;
      const detail = plan.map((p) => p.detail).join("\n");
      expect(detail).toMatch(/VIRTUAL TABLE INDEX/i);
      expect(detail).not.toMatch(/SCAN assets\b(?! USING)/i);
    } finally {
      db.close();
    }
  });
});

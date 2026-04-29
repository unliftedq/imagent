import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GalleryItem } from "@imagine-studio/core";
import { openDatabase } from "../db.js";
import { BoardRepository } from "./boards.repository.js";
import { GalleryRepository } from "./gallery.repository.js";

let dbPath: string;
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imagine-gallery-query-"));
  dbPath = path.join(tmp, "test.db");
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function makeItem(
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

describe("GalleryRepository.query", () => {
  it("filters by kind", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new GalleryRepository(db);
      for (let i = 0; i < 6; i += 1) {
        repo.create(makeItem(`img-${i}`, { kind: "image" }));
      }
      for (let i = 0; i < 4; i += 1) {
        repo.create(
          makeItem(`vid-${i}`, {
            kind: "video",
            relPath: `gallery/2026/04/vid-${i}.mp4`,
          }),
        );
      }
      const imgs = repo.query({ kind: "image", limit: 50, offset: 0 });
      expect(imgs.total).toBe(6);
      expect(imgs.items.every((it) => it.kind === "image")).toBe(true);
      const vids = repo.query({ kind: "video", limit: 50, offset: 0 });
      expect(vids.total).toBe(4);
    } finally {
      db.close();
    }
  });

  it("filters by providerId", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new GalleryRepository(db);
      repo.create(makeItem("a", { providerId: "openai" }));
      repo.create(makeItem("b", { providerId: "openai" }));
      repo.create(makeItem("c", { providerId: "google" }));
      const oai = repo.query({ providerId: "openai", limit: 50, offset: 0 });
      expect(oai.total).toBe(2);
      const goog = repo.query({ providerId: "google", limit: 50, offset: 0 });
      expect(goog.total).toBe(1);
    } finally {
      db.close();
    }
  });

  it("filters by favoritedOnly", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new GalleryRepository(db);
      repo.create(makeItem("a", { favorited: true }));
      repo.create(makeItem("b", { favorited: false }));
      repo.create(makeItem("c", { favorited: true }));
      const favs = repo.query({ favoritedOnly: true, limit: 50, offset: 0 });
      expect(favs.total).toBe(2);
      expect(favs.items.every((it) => it.favorited)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("filters by boardId via JOIN", () => {
    const db = openDatabase(dbPath);
    try {
      const galleryRepo = new GalleryRepository(db);
      const boardRepo = new BoardRepository(db);
      const now = Date.now();
      boardRepo.create({
        id: "b1",
        name: "Inspo",
        description: null,
        coverItemId: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
      for (let i = 0; i < 5; i += 1) {
        galleryRepo.create(makeItem(`g-${i}`));
      }
      boardRepo.appendItem("b1", "g-0");
      boardRepo.appendItem("b1", "g-2");
      const onBoard = galleryRepo.query({ boardId: "b1", limit: 50, offset: 0 });
      expect(onBoard.total).toBe(2);
      expect(onBoard.items.map((it) => it.id).sort()).toEqual(["g-0", "g-2"]);
    } finally {
      db.close();
    }
  });

  it("paginates with limit + offset", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new GalleryRepository(db);
      for (let i = 0; i < 10; i += 1) {
        repo.create(makeItem(`g-${i}`, { createdAt: 1_700_000_000_000 + i * 1000 }));
      }
      const page1 = repo.query({ limit: 4, offset: 0 });
      const page2 = repo.query({ limit: 4, offset: 4 });
      expect(page1.total).toBe(10);
      expect(page2.total).toBe(10);
      expect(page1.items).toHaveLength(4);
      expect(page2.items).toHaveLength(4);
      // ORDER BY created_at DESC — newest first.
      expect(page1.items[0]?.id).toBe("g-9");
      expect(page2.items[0]?.id).toBe("g-5");
    } finally {
      db.close();
    }
  });

  it("FTS search matches the prompt fragment", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new GalleryRepository(db);
      repo.create(makeItem("o1", { prompt: "a tiny otter on a lily pad" }));
      repo.create(makeItem("c1", { prompt: "a cat in a hat" }));
      repo.create(makeItem("o2", { prompt: "another otter swimming" }));
      // FTS triggers in 002_fts.sql mirror gallery_items into gallery_items_fts.
      const r = repo.query({ search: "otter", limit: 50, offset: 0 });
      expect(r.total).toBe(2);
      expect(r.items.map((it) => it.id).sort()).toEqual(["o1", "o2"]);
    } finally {
      db.close();
    }
  });

  it("filters by parentId for lineage queries", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new GalleryRepository(db);
      repo.create(makeItem("p"));
      repo.create(makeItem("c1", { parentId: "p" }));
      repo.create(makeItem("c2", { parentId: "p" }));
      repo.create(makeItem("u"));
      const r = repo.query({ parentId: "p", limit: 50, offset: 0 });
      expect(r.total).toBe(2);
      expect(r.items.map((it) => it.id).sort()).toEqual(["c1", "c2"]);
    } finally {
      db.close();
    }
  });
});


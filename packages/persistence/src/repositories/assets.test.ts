import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { AssetRepository } from "./assets.repository.js";

let dbPath: string;
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imagine-asset-repo-"));
  dbPath = path.join(tmp, "test.db");
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("AssetRepository", () => {
  it("create + get round-trips an asset and its reference files", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      const now = Date.now();
      const created = repo.create({
        id: "asset-1",
        kind: "character",
        name: "Alice",
        description: null,
        promptSnippet: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      expect(created.id).toBe("asset-1");
      expect(created.name).toBe("Alice");

      repo.addFile({
        id: "f-1",
        assetId: "asset-1",
        role: "reference",
        relPath: "assets/asset-1/ref-001.png",
        mimeType: "image/png",
        width: 1024,
        height: 768,
        bytes: 12345,
        sha256: "abc123",
        position: 0,
        createdAt: now,
      });
      repo.addFile({
        id: "f-2",
        assetId: "asset-1",
        role: "thumbnail",
        relPath: "assets/asset-1/thumb.webp",
        mimeType: "image/webp",
        width: 256,
        height: 192,
        bytes: 1024,
        sha256: "def456",
        position: 0,
        createdAt: now,
      });

      const got = repo.get("asset-1");
      expect(got).not.toBeNull();
      expect(got?.files).toHaveLength(2);
      expect(got?.files.find((f) => f.role === "reference")?.relPath).toContain("ref-001.png");
      expect(got?.files.find((f) => f.role === "thumbnail")?.relPath).toContain("thumb.webp");
    } finally {
      db.close();
    }
  });

  it("list filters by kind and excludes archived by default", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      const now = Date.now();
      repo.create({
        id: "char",
        kind: "character",
        name: "Char",
        description: null,
        promptSnippet: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      repo.create({
        id: "style",
        kind: "style",
        name: "St",
        description: null,
        promptSnippet: "moody",
        files: [],
        createdAt: now,
        updatedAt: now + 1,
        archivedAt: null,
      });
      repo.create({
        id: "archived",
        kind: "character",
        name: "Old",
        description: null,
        promptSnippet: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: now,
      });

      const chars = repo.list({ kind: "character" });
      expect(chars).toHaveLength(1);
      expect(chars[0]?.id).toBe("char");

      const all = repo.list({});
      expect(all.map((a) => a.id).sort()).toEqual(["char", "style"]);

      const incl = repo.list({ includeArchived: true });
      expect(incl).toHaveLength(3);
    } finally {
      db.close();
    }
  });

  it("delete cascades to asset_files", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      const now = Date.now();
      repo.create({
        id: "a",
        kind: "object",
        name: "Mug",
        description: null,
        promptSnippet: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      repo.addFile({
        id: "f",
        assetId: "a",
        role: "reference",
        relPath: "assets/a/ref-001.png",
        mimeType: "image/png",
        width: null,
        height: null,
        bytes: 1,
        sha256: "x",
        position: 0,
        createdAt: now,
      });
      expect(repo.listFiles("a")).toHaveLength(1);
      repo.delete("a");
      expect(repo.get("a")).toBeNull();
      expect(repo.listFiles("a")).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("listWithFiles paginates and joins file rows", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      const now = Date.now();
      // Two assets, two files each (one ref + one thumb).
      for (const id of ["a1", "a2"]) {
        repo.create({
          id,
          kind: "character",
          name: `Char ${id}`,
          description: null,
          promptSnippet: null,
          files: [],
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        });
        repo.addFile({
          id: `${id}-ref`,
          assetId: id,
          role: "reference",
          relPath: `assets/${id}/ref-001.png`,
          mimeType: "image/png",
          width: 1024,
          height: 768,
          bytes: 100,
          sha256: `sha-${id}`,
          position: 0,
          createdAt: now,
        });
        repo.addFile({
          id: `${id}-thumb`,
          assetId: id,
          role: "thumbnail",
          relPath: `assets/${id}/thumb.webp`,
          mimeType: "image/webp",
          width: 256,
          height: 192,
          bytes: 50,
          sha256: `thumb-${id}`,
          position: 0,
          createdAt: now,
        });
      }

      const page = repo.listWithFiles({ kind: "character" });
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(2);
      for (const a of page.items) {
        expect(a.files).toHaveLength(2);
        expect(a.files.find((f) => f.role === "reference")).toBeTruthy();
        expect(a.files.find((f) => f.role === "thumbnail")).toBeTruthy();
      }

      const limited = repo.listWithFiles({ kind: "character", limit: 1 });
      expect(limited.total).toBe(2);
      expect(limited.items).toHaveLength(1);

      const offset = repo.listWithFiles({ kind: "character", limit: 1, offset: 1 });
      expect(offset.items).toHaveLength(1);
      expect(offset.items[0]?.id).not.toBe(limited.items[0]?.id);
    } finally {
      db.close();
    }
  });

  it("usageCount counts gallery_item_assets links", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      const now = Date.now();
      repo.create({
        id: "u1",
        kind: "character",
        name: "U",
        description: null,
        promptSnippet: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      // No links → 0.
      expect(repo.usageCount("u1")).toBe(0);
      // Insert two gallery_items + link them.
      db.prepare(
        `INSERT INTO gallery_items (id, kind, prompt, provider_id, model, params_json, rel_path, bytes, favorited, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("g1", "image", "p", "openai", "x", "{}", "g1.png", 1, 0, now);
      db.prepare(
        `INSERT INTO gallery_items (id, kind, prompt, provider_id, model, params_json, rel_path, bytes, favorited, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("g2", "image", "p", "openai", "x", "{}", "g2.png", 1, 0, now);
      db.prepare(
        "INSERT INTO gallery_item_assets (item_id, asset_id, role) VALUES (?, ?, ?)",
      ).run("g1", "u1", "character");
      db.prepare(
        "INSERT INTO gallery_item_assets (item_id, asset_id, role) VALUES (?, ?, ?)",
      ).run("g2", "u1", "character");
      expect(repo.usageCount("u1")).toBe(2);
    } finally {
      db.close();
    }
  });

  it("archive then restore round-trips through list defaults (M8)", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      const now = Date.now();
      repo.create({
        id: "a-arch",
        kind: "character",
        name: "Bob",
        description: null,
        promptSnippet: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      // Live by default.
      expect(repo.list({ kind: "character" })).toHaveLength(1);

      repo.archive("a-arch");

      // Default list excludes the archived asset.
      expect(repo.list({ kind: "character" })).toHaveLength(0);
      // includeArchived: true brings it back into the same list.
      expect(repo.list({ kind: "character", includeArchived: true })).toHaveLength(1);
      // archivedOnly returns just the archived row regardless of kind.
      const trash = repo.list({ archivedOnly: true });
      expect(trash).toHaveLength(1);
      expect(trash[0]?.id).toBe("a-arch");
      expect(trash[0]?.archivedAt).not.toBeNull();

      repo.restore("a-arch");
      expect(repo.list({ kind: "character" })).toHaveLength(1);
      expect(repo.list({ archivedOnly: true })).toHaveLength(0);
      // restore() is idempotent on a live asset.
      repo.restore("a-arch");
      expect(repo.list({ kind: "character" })).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("permanentlyDelete cascades like delete (M8)", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      const now = Date.now();
      repo.create({
        id: "a-perm",
        kind: "object",
        name: "Mug",
        description: null,
        promptSnippet: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      repo.addFile({
        id: "f-perm",
        assetId: "a-perm",
        role: "reference",
        relPath: "assets/a-perm/ref-001.png",
        mimeType: "image/png",
        width: null,
        height: null,
        bytes: 1,
        sha256: "x",
        position: 0,
        createdAt: now,
      });
      repo.permanentlyDelete("a-perm");
      expect(repo.get("a-perm")).toBeNull();
      expect(repo.listFiles("a-perm")).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("findFilesBySha256 returns matching rows for dedup hint", () => {
    const db = openDatabase(dbPath);
    try {
      const repo = new AssetRepository(db);
      const now = Date.now();
      repo.create({
        id: "a",
        kind: "character",
        name: "X",
        description: null,
        promptSnippet: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      repo.addFile({
        id: "f1",
        assetId: "a",
        role: "reference",
        relPath: "assets/a/ref-001.png",
        mimeType: "image/png",
        width: null,
        height: null,
        bytes: 1,
        sha256: "shared-sha",
        position: 0,
        createdAt: now,
      });
      const found = repo.findFilesBySha256("shared-sha");
      expect(found).toHaveLength(1);
      expect(found[0]?.assetId).toBe("a");
    } finally {
      db.close();
    }
  });
});

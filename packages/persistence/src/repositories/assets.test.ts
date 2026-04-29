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

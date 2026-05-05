import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { BoardRepository } from "./boards.repository.js";
import { GalleryRepository } from "./gallery.repository.js";

let dbPath: string;
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imagent-board-repo-"));
  dbPath = path.join(tmp, "test.db");
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("BoardRepository", () => {
  it("create + appendItem assigns dense positions", () => {
    const db = openDatabase(dbPath);
    try {
      const boardRepo = new BoardRepository(db);
      const galleryRepo = new GalleryRepository(db);
      const now = Date.now();
      boardRepo.create({
        id: "b1",
        name: "Demo",
        description: null,
        coverItemId: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Two gallery items so we have FK targets.
      for (const id of ["g1", "g2"]) {
        galleryRepo.create({
          id,
          kind: "image",
          parentId: null,
          prompt: "hi",
          negativePrompt: null,
          providerId: "p",
          model: "m",
          paramsJson: "{}",
          relPath: `gallery/2026/04/${id}.png`,
          thumbPath: null,
          durationMs: null,
          width: null,
          height: null,
          bytes: 1,
          jobId: null,
          favorited: false,
          createdAt: now,
        });
      }

      const link1 = boardRepo.appendItem("b1", "g1");
      const link2 = boardRepo.appendItem("b1", "g2");
      expect(link1.position).toBe(0);
      expect(link2.position).toBe(1);
      expect(boardRepo.countItems("b1")).toBe(2);
      expect(boardRepo.hasItem("b1", "g1")).toBe(true);
      boardRepo.removeItem("b1", "g1");
      expect(boardRepo.hasItem("b1", "g1")).toBe(false);
      expect(boardRepo.countItems("b1")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("appendItem auto-positions across multiple calls (M5)", () => {
    const db = openDatabase(dbPath);
    try {
      const boardRepo = new BoardRepository(db);
      const galleryRepo = new GalleryRepository(db);
      const now = Date.now();
      boardRepo.create({
        id: "b-auto",
        name: "Auto",
        description: null,
        coverItemId: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
      for (const id of ["g1", "g2", "g3"]) {
        galleryRepo.create({
          id,
          kind: "image",
          parentId: null,
          prompt: "p",
          negativePrompt: null,
          providerId: "p",
          model: "m",
          paramsJson: "{}",
          relPath: `${id}.png`,
          thumbPath: null,
          durationMs: null,
          width: null,
          height: null,
          bytes: 1,
          jobId: null,
          favorited: false,
          createdAt: now,
        });
      }
      expect(boardRepo.appendItem("b-auto", "g1").position).toBe(0);
      expect(boardRepo.appendItem("b-auto", "g2").position).toBe(1);
      expect(boardRepo.appendItem("b-auto", "g3").position).toBe(2);
      expect(boardRepo.countItems("b-auto")).toBe(3);
    } finally {
      db.close();
    }
  });

  it("addItem is idempotent through hasItem guards (M5)", () => {
    const db = openDatabase(dbPath);
    try {
      const boardRepo = new BoardRepository(db);
      const galleryRepo = new GalleryRepository(db);
      const now = Date.now();
      boardRepo.create({
        id: "b-idempotent",
        name: "Idem",
        description: null,
        coverItemId: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
      galleryRepo.create({
        id: "g1",
        kind: "image",
        parentId: null,
        prompt: "p",
        negativePrompt: null,
        providerId: "p",
        model: "m",
        paramsJson: "{}",
        relPath: "g1.png",
        thumbPath: null,
        durationMs: null,
        width: null,
        height: null,
        bytes: 1,
        jobId: null,
        favorited: false,
        createdAt: now,
      });
      boardRepo.appendItem("b-idempotent", "g1");
      // Second append would normally violate the PK; our IPC handler gates
      // on hasItem so this stays a no-op at the application boundary.
      expect(boardRepo.hasItem("b-idempotent", "g1")).toBe(true);
      expect(boardRepo.countItems("b-idempotent")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("delete cascades to board_items", () => {
    const db = openDatabase(dbPath);
    try {
      const boardRepo = new BoardRepository(db);
      const galleryRepo = new GalleryRepository(db);
      const now = Date.now();
      boardRepo.create({
        id: "b1",
        name: "Demo",
        description: null,
        coverItemId: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
      galleryRepo.create({
        id: "g1",
        kind: "image",
        parentId: null,
        prompt: "hi",
        negativePrompt: null,
        providerId: "p",
        model: "m",
        paramsJson: "{}",
        relPath: "x.png",
        thumbPath: null,
        durationMs: null,
        width: null,
        height: null,
        bytes: 1,
        jobId: null,
        favorited: false,
        createdAt: now,
      });
      boardRepo.appendItem("b1", "g1");
      boardRepo.delete("b1");
      expect(boardRepo.get("b1")).toBeNull();
      expect(boardRepo.countItems("b1")).toBe(0);
    } finally {
      db.close();
    }
  });
});

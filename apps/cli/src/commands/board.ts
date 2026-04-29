import { randomUUID } from "node:crypto";

import {
  BoardRepository,
  GalleryRepository,
  createPathResolver,
  ensureDataDir,
  openDatabase,
} from "@imagine/persistence";
import chalk from "chalk";
import type { Command } from "commander";

import { excerpt, formatRelativeTime, truncate } from "./util.js";

export function registerBoardCommands(program: Command): void {
  const board = program.command("board").description("Manage boards / collections");

  board
    .command("create <name>")
    .description("Create a new board")
    .option("--description <text>", "Optional description")
    .action(async (name: string, options: { description?: string }) => {
      try {
        await runBoardCreate(name, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("board create failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  board
    .command("ls")
    .description("List boards with item counts")
    .option("--limit <n>", "Maximum rows to print")
    .action(async (options: { limit?: string }) => {
      try {
        await runBoardLs(options);
      } catch (err) {
        process.stderr.write(`${chalk.red("board ls failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  board
    .command("add <boardId> <itemId>")
    .description("Add a gallery item to a board")
    .action(async (boardId: string, itemId: string) => {
      try {
        await runBoardAdd(boardId, itemId);
      } catch (err) {
        process.stderr.write(`${chalk.red("board add failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  board
    .command("rm <boardId>")
    .description("Delete a board (gallery items are NOT deleted)")
    .option("--force", "Skip confirmation prompt")
    .action(async (boardId: string, options: { force?: boolean }) => {
      try {
        await runBoardRm(boardId, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("board rm failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  board
    .command("show <boardId>")
    .description("Show a board's details + first 10 items")
    .action(async (boardId: string) => {
      try {
        await runBoardShow(boardId);
      } catch (err) {
        process.stderr.write(`${chalk.red("board show failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runBoardCreate(name: string, options: { description?: string }): Promise<void> {
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new BoardRepository(db);
    const id = randomUUID();
    const now = Date.now();
    repo.create({
      id,
      name,
      description: options.description ?? null,
      coverItemId: null,
      position: 0,
      createdAt: now,
      updatedAt: now,
    });
    process.stdout.write(`${chalk.green("ok:")} ${id}\n`);
  } finally {
    db.close();
  }
}

async function runBoardLs(options: { limit?: string }): Promise<void> {
  const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined;
  if (limit !== undefined && (Number.isNaN(limit) || limit <= 0)) {
    throw new Error(`--limit must be a positive integer (got '${options.limit}')`);
  }
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new BoardRepository(db);
    const boards = repo.list();
    const truncated = limit !== undefined ? boards.slice(0, limit) : boards;
    if (truncated.length === 0) {
      process.stdout.write(`${chalk.dim("(no boards)")}\n`);
      return;
    }
    for (const b of truncated) {
      const idShort = truncate(b.id, 8);
      const count = repo.countItems(b.id);
      const updated = formatRelativeTime(b.updatedAt);
      process.stdout.write(
        `${chalk.dim(idShort)}  ${chalk.bold(b.name)}  ${chalk.dim(`items=${count}`)}  ${chalk.dim(updated)}\n`,
      );
    }
  } finally {
    db.close();
  }
}

async function runBoardAdd(boardId: string, itemId: string): Promise<void> {
  const resolver = createPathResolver();
  const db = openDatabase(resolver.dbFile());
  try {
    const boardRepo = new BoardRepository(db);
    const galleryRepo = new GalleryRepository(db);
    const board = boardRepo.get(boardId);
    if (!board) throw new Error(`no board with id '${boardId}'`);
    const item = galleryRepo.get(itemId);
    if (!item) throw new Error(`no gallery item with id '${itemId}'`);
    if (boardRepo.hasItem(boardId, itemId)) {
      throw new Error(`item ${itemId} is already on board ${boardId}`);
    }
    const link = boardRepo.appendItem(boardId, itemId);
    process.stdout.write(`${chalk.green("ok:")} added at position ${link.position}\n`);
  } finally {
    db.close();
  }
}

async function runBoardRm(boardId: string, options: { force?: boolean }): Promise<void> {
  const resolver = createPathResolver();
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new BoardRepository(db);
    const board = repo.get(boardId);
    if (!board) throw new Error(`no board with id '${boardId}'`);
    if (!options.force) {
      const ok = await confirm(`Delete board '${board.name}'? Items remain in gallery. [y/N] `);
      if (!ok) {
        process.stdout.write(`${chalk.dim("(cancelled)")}\n`);
        return;
      }
    }
    repo.delete(boardId);
    process.stdout.write(`${chalk.green("ok:")} deleted ${boardId}\n`);
  } finally {
    db.close();
  }
}

async function runBoardShow(boardId: string): Promise<void> {
  const resolver = createPathResolver();
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new BoardRepository(db);
    const galleryRepo = new GalleryRepository(db);
    const board = repo.get(boardId);
    if (!board) throw new Error(`no board with id '${boardId}'`);
    const count = repo.countItems(boardId);

    process.stdout.write(`${chalk.dim("id:        ")}${board.id}\n`);
    process.stdout.write(`${chalk.dim("name:      ")}${board.name}\n`);
    if (board.description) {
      process.stdout.write(`${chalk.dim("desc:      ")}${board.description}\n`);
    }
    process.stdout.write(`${chalk.dim("items:     ")}${count}\n`);
    process.stdout.write(`${chalk.dim("updated:   ")}${new Date(board.updatedAt).toISOString()}\n`);

    if (count === 0) return;
    const links = repo.listItems(boardId).slice(0, 10);
    process.stdout.write(`${chalk.dim("first 10:")}\n`);
    for (const link of links) {
      const item = galleryRepo.get(link.itemId);
      if (!item) {
        process.stdout.write(`  ${chalk.dim("•")} ${truncate(link.itemId, 8)}  ${chalk.red("(missing)")}\n`);
        continue;
      }
      process.stdout.write(
        `  ${chalk.dim("•")} ${truncate(item.id, 8)}  [${item.kind}]  ${excerpt(item.prompt, 30)}\n`,
      );
    }
  } finally {
    db.close();
  }
}

async function confirm(prompt: string): Promise<boolean> {
  process.stdout.write(prompt);
  return new Promise<boolean>((resolve) => {
    const onData = (chunk: Buffer): void => {
      process.stdin.off("data", onData);
      process.stdin.pause();
      const text = chunk.toString().trim().toLowerCase();
      resolve(text === "y" || text === "yes");
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

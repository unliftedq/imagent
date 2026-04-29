import type { Board, BoardItem } from "@imagine-studio/core";
import type { DatabaseType } from "../db.js";

interface BoardRow {
  id: string;
  name: string;
  description: string | null;
  cover_item_id: string | null;
  position: number;
  created_at: number;
  updated_at: number;
}

interface BoardItemRow {
  board_id: string;
  item_id: string;
  position: number;
  added_at: number;
}

function rowToBoard(r: BoardRow): Board {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    coverItemId: r.cover_item_id,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToBoardItem(r: BoardItemRow): BoardItem {
  return {
    boardId: r.board_id,
    itemId: r.item_id,
    position: r.position,
    addedAt: r.added_at,
  };
}

export class BoardRepository {
  constructor(private readonly db: DatabaseType) {}

  list(): Board[] {
    const rows = this.db
      .prepare("SELECT * FROM boards ORDER BY position, updated_at DESC")
      .all() as BoardRow[];
    return rows.map(rowToBoard);
  }

  get(id: string): Board | null {
    const row = this.db.prepare("SELECT * FROM boards WHERE id = ?").get(id) as
      | BoardRow
      | undefined;
    return row ? rowToBoard(row) : null;
  }

  create(board: Board): Board {
    this.db
      .prepare(
        `INSERT INTO boards (id, name, description, cover_item_id, position,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        board.id,
        board.name,
        board.description ?? null,
        board.coverItemId ?? null,
        board.position,
        board.createdAt,
        board.updatedAt,
      );
    return this.get(board.id) ?? board;
  }

  update(id: string, patch: Partial<Board>): Board {
    const existing = this.get(id);
    if (!existing) throw new Error(`board ${id} not found`);
    const next: Board = { ...existing, ...patch, id, updatedAt: Date.now() };
    this.db
      .prepare(
        `UPDATE boards SET name = ?, description = ?, cover_item_id = ?,
            position = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        next.name,
        next.description ?? null,
        next.coverItemId ?? null,
        next.position,
        next.updatedAt,
        id,
      );
    return next;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM boards WHERE id = ?").run(id);
  }

  setCover(boardId: string, itemId: string | null): void {
    this.db
      .prepare("UPDATE boards SET cover_item_id = ?, updated_at = ? WHERE id = ?")
      .run(itemId, Date.now(), boardId);
  }

  countItems(boardId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM board_items WHERE board_id = ?")
      .get(boardId) as { n: number };
    return row.n;
  }

  listItems(boardId: string): BoardItem[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM board_items WHERE board_id = ? ORDER BY position ASC, added_at ASC",
      )
      .all(boardId) as BoardItemRow[];
    return rows.map(rowToBoardItem);
  }

  hasItem(boardId: string, itemId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 AS x FROM board_items WHERE board_id = ? AND item_id = ?")
      .get(boardId, itemId);
    return row !== undefined;
  }

  addItem(link: BoardItem): void {
    this.db
      .prepare(
        `INSERT INTO board_items (board_id, item_id, position, added_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(link.boardId, link.itemId, link.position, link.addedAt);
  }

  /** Convenience: append `itemId` to `boardId` at position max+1. */
  appendItem(boardId: string, itemId: string): BoardItem {
    const maxRow = this.db
      .prepare("SELECT MAX(position) AS p FROM board_items WHERE board_id = ?")
      .get(boardId) as { p: number | null };
    const position = (maxRow.p ?? -1) + 1;
    const link: BoardItem = {
      boardId,
      itemId,
      position,
      addedAt: Date.now(),
    };
    this.addItem(link);
    return link;
  }

  removeItem(boardId: string, itemId: string): void {
    this.db
      .prepare("DELETE FROM board_items WHERE board_id = ? AND item_id = ?")
      .run(boardId, itemId);
  }

  reorderItems(boardId: string, itemIdsInOrder: readonly string[]): void {
    const stmt = this.db.prepare(
      "UPDATE board_items SET position = ? WHERE board_id = ? AND item_id = ?",
    );
    const tx = this.db.transaction(() => {
      itemIdsInOrder.forEach((itemId, idx) => {
        stmt.run(idx, boardId, itemId);
      });
    });
    tx();
  }
}

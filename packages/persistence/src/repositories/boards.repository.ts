import type { Board, BoardItem } from "@imagine-studio/core";
import type { DatabaseType } from "../db.js";

export class BoardRepository {
  constructor(private readonly db: DatabaseType) {}

  list(): Board[] {
    return [];
  }

  get(_id: string): Board | null {
    return null;
  }

  create(_board: Board): Board {
    throw new Error("not implemented (M3)");
  }

  update(_id: string, _patch: Partial<Board>): Board {
    throw new Error("not implemented (M3)");
  }

  delete(_id: string): void {
    throw new Error("not implemented (M3)");
  }

  setCover(_boardId: string, _itemId: string | null): void {
    throw new Error("not implemented (M3)");
  }

  // board_items rows. Position is dense int; rebuilds on insert/delete are
  // cheap at this app's scale (boards rarely exceed a few hundred items).
  listItems(_boardId: string): BoardItem[] {
    return [];
  }

  addItem(_link: BoardItem): void {
    throw new Error("not implemented (M3)");
  }

  removeItem(_boardId: string, _itemId: string): void {
    throw new Error("not implemented (M3)");
  }

  reorderItems(_boardId: string, _itemIdsInOrder: readonly string[]): void {
    throw new Error("not implemented (M3)");
  }
}

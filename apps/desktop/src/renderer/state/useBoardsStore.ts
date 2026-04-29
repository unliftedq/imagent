import { create } from "zustand";
import type { Board } from "@imagine/core";
import { api } from "../lib/api.js";

interface BoardsState {
  boards: Board[];
  /** null means "All" — the unfiltered virtual row. "favorites" is its own sentinel. */
  activeBoardId: string | null;
  /** Per-board item counts, kept in lock-step with `boards`. */
  counts: Record<string, number>;
  refresh: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  create: (input: { name: string; description?: string }) => Promise<Board>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  addItem: (boardId: string, itemId: string) => Promise<void>;
  removeItem: (boardId: string, itemId: string) => Promise<void>;
}

export const useBoardsStore = create<BoardsState>((set, get) => ({
  boards: [],
  activeBoardId: null,
  counts: {},

  refresh: async () => {
    const list = await api["boards.list"]();
    set({ boards: list });
    await get().refreshCounts();
  },

  refreshCounts: async () => {
    // The IPC contract has gallery.query{boardId} returning total. Each board
    // gets a tiny query with limit=1 to read `total`.
    const counts: Record<string, number> = {};
    for (const b of get().boards) {
      try {
        const r = await api["gallery.query"]({
          kind: "image",
          boardId: b.id,
          limit: 1,
          offset: 0,
        });
        counts[b.id] = r.total;
      } catch {
        counts[b.id] = 0;
      }
    }
    set({ counts });
  },

  create: async ({ name, description }) => {
    const now = Date.now();
    const created = await api["boards.create"]({
      // Server overrides id+timestamps; we still send a placeholder so the
      // schema parses.
      id: `placeholder-${now}`,
      name,
      description: description ?? null,
      coverItemId: null,
      position: get().boards.length,
      createdAt: now,
      updatedAt: now,
    });
    set((s) => ({ boards: [...s.boards, created] }));
    return created;
  },

  rename: async (id, name) => {
    const updated = await api["boards.update"]({ id, patch: { name } });
    set((s) => ({
      boards: s.boards.map((b) => (b.id === id ? updated : b)),
    }));
  },

  remove: async (id) => {
    await api["boards.delete"]({ id });
    set((s) => ({
      boards: s.boards.filter((b) => b.id !== id),
      activeBoardId: s.activeBoardId === id ? null : s.activeBoardId,
    }));
  },

  setActive: (id) => set({ activeBoardId: id }),

  addItem: async (boardId, itemId) => {
    await api["boards.addItem"]({ boardId, itemId });
    set((s) => ({
      counts: { ...s.counts, [boardId]: (s.counts[boardId] ?? 0) + 1 },
    }));
  },

  removeItem: async (boardId, itemId) => {
    await api["boards.removeItem"]({ boardId, itemId });
    set((s) => ({
      counts: {
        ...s.counts,
        [boardId]: Math.max(0, (s.counts[boardId] ?? 0) - 1),
      },
    }));
  },
}));

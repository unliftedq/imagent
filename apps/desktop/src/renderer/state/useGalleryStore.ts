import { create } from "zustand";
import type { GalleryItem, GalleryQuery } from "@imagine-studio/core";
import { api } from "../lib/api.js";

interface GalleryState {
  items: GalleryItem[];
  total: number;
  query: GalleryQuery;
  bound: boolean;
  setQuery: (patch: Partial<GalleryQuery>) => void;
  refresh: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Insert/replace an item — used after `image.generate` completes. */
  upsertOne: (item: GalleryItem) => void;
  /** Wire the `gallery.changed` push-event listener. Idempotent. */
  bindEvents: () => () => void;
}

const defaultQuery: GalleryQuery = {
  kind: "image",
  limit: 60,
  offset: 0,
};

export const useGalleryStore = create<GalleryState>((set, get) => ({
  items: [],
  total: 0,
  query: defaultQuery,
  bound: false,

  setQuery: (patch) => {
    const next = { ...get().query, ...patch };
    set({ query: next });
    void get().refresh();
  },

  refresh: async () => {
    const result = await api["gallery.query"](get().query);
    set({ items: result.items, total: result.total });
  },

  toggleFavorite: async (id) => {
    await api["gallery.toggleFavorite"]({ id });
    // Optimistic flip — refresh would be expensive on big galleries.
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, favorited: !it.favorited } : it,
      ),
    }));
  },

  remove: async (id) => {
    await api["gallery.delete"]({ id });
    set((s) => ({
      items: s.items.filter((it) => it.id !== id),
      total: Math.max(0, s.total - 1),
    }));
  },

  upsertOne: (item) => {
    set((s) => {
      const exists = s.items.some((it) => it.id === item.id);
      const items = exists
        ? s.items.map((it) => (it.id === item.id ? item : it))
        : [item, ...s.items];
      return {
        items,
        total: exists ? s.total : s.total + 1,
      };
    });
  },

  bindEvents: () => {
    if (get().bound) return () => {};
    set({ bound: true });
    const offChanged = api.on("gallery.changed", (payload) => {
      // CLI-side writes (or another window) flip created/updated/deleted —
      // refresh proactively. For our single-window M5 desktop, only `created`
      // matters since the originating window already has the item via
      // upsertOne(). Cheap blanket refresh keeps things consistent.
      void get().refresh();
      void payload;
    });
    return () => {
      offChanged();
      set({ bound: false });
    };
  },
}));

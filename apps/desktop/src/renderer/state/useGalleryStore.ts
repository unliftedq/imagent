import type { GalleryItem, GalleryQuery } from "@imagine/core";
import { create } from "zustand";
import { api } from "../lib/api.js";

interface GalleryState {
  items: GalleryItem[];
  total: number;
  allTotal: number;
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
  // M7: gallery query no longer filters by kind — image + video items mix
  // in the masonry. Pages opt back into a kind filter by calling setQuery.
  limit: 60,
  offset: 0,
};

const allItemsQuery: GalleryQuery = {
  limit: 1,
  offset: 0,
};

function isUnfilteredQuery(query: GalleryQuery): boolean {
  return (
    !query.kind &&
    !query.boardId &&
    !query.parentId &&
    !query.favoritedOnly &&
    (!query.search || query.search.trim().length === 0)
  );
}

export const useGalleryStore = create<GalleryState>((set, get) => ({
  items: [],
  total: 0,
  allTotal: 0,
  query: defaultQuery,
  bound: false,

  setQuery: (patch) => {
    const next = { ...get().query, ...patch };
    set({ query: next });
    void get().refresh();
  },

  refresh: async () => {
    const query = get().query;
    const result = await api["gallery.query"](query);
    const allTotal = isUnfilteredQuery(query)
      ? result.total
      : (await api["gallery.query"](allItemsQuery)).total;
    set({ items: result.items, total: result.total, allTotal });
  },

  toggleFavorite: async (id) => {
    await api["gallery.toggleFavorite"]({ id });
    set((s) => {
      const toggledItem = s.items.find((it) => it.id === id);
      const removeFromFavorites = Boolean(s.query.favoritedOnly && toggledItem?.favorited);
      return {
        items: removeFromFavorites
          ? s.items.filter((it) => it.id !== id)
          : s.items.map((it) => (it.id === id ? { ...it, favorited: !it.favorited } : it)),
        total: removeFromFavorites ? Math.max(0, s.total - 1) : s.total,
      };
    });
  },

  remove: async (id) => {
    await api["gallery.delete"]({ id });
    set((s) => ({
      items: s.items.filter((it) => it.id !== id),
      total: Math.max(0, s.total - 1),
      allTotal: Math.max(0, s.allTotal - 1),
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
        allTotal: exists ? s.allTotal : s.allTotal + 1,
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

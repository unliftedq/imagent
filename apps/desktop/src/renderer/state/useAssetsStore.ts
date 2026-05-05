import { create } from "zustand";
import type { Asset, AssetKind } from "@imagent/core";
import { api } from "../lib/api.js";

const KINDS: AssetKind[] = ["character", "object", "background", "style"];

export interface AssetCreateInput {
  kind: AssetKind;
  name: string;
  description?: string | null;
  promptSnippet?: string | null;
  fileUploads: { bytes: Uint8Array; originalName: string; mimeType: string }[];
}

export interface AssetCreateFromGalleryItemInput {
  itemId: string;
  kind: AssetKind;
  name: string;
  description?: string | null;
  promptSnippet?: string | null;
}

export interface AssetUpdateInput {
  id: string;
  name?: string;
  description?: string | null;
  promptSnippet?: string | null;
}

interface AssetsState {
  byKind: Record<AssetKind, Asset[]>;
  /** Archived asset cache for the Trash tab (M8). Cross-kind. */
  archived: Asset[];
  query: { search?: string; kind?: AssetKind; limit?: number };
  bound: boolean;
  /** Refresh one kind, or all four if `kind` is omitted. */
  refresh: (kind?: AssetKind) => Promise<void>;
  /** Refresh the archived cache used by the Trash tab. */
  refreshArchived: () => Promise<void>;
  setSearch: (search: string | undefined) => void;
  create: (input: AssetCreateInput) => Promise<Asset>;
  createFromGalleryItem: (input: AssetCreateFromGalleryItemInput) => Promise<Asset>;
  update: (input: AssetUpdateInput) => Promise<Asset>;
  /**
   * Soft-delete (M8): moves the asset to the Trash tab. AssetPicker filters
   * archived assets, so the asset disappears from kind tabs + ref-pickers but
   * its files stay on disk.
   */
  archive: (id: string) => Promise<void>;
  /** Reverse of `archive` (M8). Idempotent on a live asset. */
  restore: (id: string) => Promise<void>;
  /**
   * Hard-delete: removes the row + cascade files + rm-rf the asset dir.
   * Replaces the older `remove` callsite — kept under that name as an alias
   * for callers that haven't migrated yet.
   */
  permanentlyDelete: (id: string) => Promise<void>;
  /** @deprecated Use `permanentlyDelete` for clarity (M8). */
  remove: (id: string) => Promise<void>;
  /** Subscribes to `assets.changed` push events. Idempotent. */
  bindEvents: () => () => void;
}

const EMPTY_BY_KIND: Record<AssetKind, Asset[]> = {
  character: [],
  object: [],
  background: [],
  style: [],
};

export const useAssetsStore = create<AssetsState>((set, get) => ({
  byKind: { ...EMPTY_BY_KIND },
  archived: [],
  query: {},
  bound: false,

  refresh: async (kind) => {
    const search = get().query.search;
    if (kind) {
      const result = await api["assets.list"]({
        kind,
        ...(search ? { search } : {}),
      });
      set((s) => ({
        byKind: { ...s.byKind, [kind]: result.items },
      }));
      return;
    }
    // Refresh all four kinds in parallel.
    const results = await Promise.all(
      KINDS.map((k) =>
        api["assets.list"]({ kind: k, ...(search ? { search } : {}) }).then(
          (r) => [k, r.items] as const,
        ),
      ),
    );
    const next = { ...EMPTY_BY_KIND };
    for (const [k, items] of results) next[k] = items;
    set({ byKind: next });
  },

  refreshArchived: async () => {
    const search = get().query.search;
    const result = await api["assets.list"]({
      archivedOnly: true,
      ...(search ? { search } : {}),
    });
    set({ archived: result.items });
  },

  setSearch: (search) => {
    set((s) => ({ query: { ...s.query, search: search || undefined } }));
    void get().refresh();
    void get().refreshArchived();
  },

  create: async (input) => {
    const created = await api["assets.create"]({
      kind: input.kind,
      name: input.name,
      description: input.description ?? null,
      promptSnippet: input.promptSnippet ?? null,
      // Re-wrap each Uint8Array so it carries a concrete ArrayBuffer marker,
      // satisfying the contract's `Uint8Array<ArrayBuffer>` element type.
      fileUploads: input.fileUploads.map((u) => ({
        bytes: new Uint8Array(u.bytes),
        originalName: u.originalName,
        mimeType: u.mimeType,
      })),
    });
    // Insert into the matching kind bucket at the front (most recent).
    set((s) => ({
      byKind: {
        ...s.byKind,
        [created.kind]: [created, ...s.byKind[created.kind]],
      },
    }));
    return created;
  },

  createFromGalleryItem: async (input) => {
    const created = await api["assets.createFromGalleryItem"]({
      itemId: input.itemId,
      kind: input.kind,
      name: input.name,
      description: input.description ?? null,
      promptSnippet: input.promptSnippet ?? null,
    });
    set((s) => ({
      byKind: {
        ...s.byKind,
        [created.kind]: [created, ...s.byKind[created.kind]],
      },
    }));
    return created;
  },

  update: async (input) => {
    const next = await api["assets.update"]({
      id: input.id,
      patch: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.promptSnippet !== undefined
          ? { promptSnippet: input.promptSnippet }
          : {}),
      },
    });
    set((s) => ({
      byKind: {
        ...s.byKind,
        [next.kind]: s.byKind[next.kind].map((a) =>
          a.id === next.id ? next : a,
        ),
      },
    }));
    return next;
  },

  archive: async (id) => {
    await api["assets.archive"]({ id });
    // Optimistically pull from the live tabs; reconciles on next refresh.
    set((s) => {
      const nextByKind = { ...s.byKind } as Record<AssetKind, Asset[]>;
      let archivedAsset: Asset | null = null;
      for (const k of KINDS) {
        const hit = nextByKind[k].find((a) => a.id === id);
        if (hit) archivedAsset = hit;
        nextByKind[k] = nextByKind[k].filter((a) => a.id !== id);
      }
      const archived = archivedAsset
        ? [
            { ...archivedAsset, archivedAt: Date.now() },
            ...s.archived.filter((a) => a.id !== id),
          ]
        : s.archived;
      return { byKind: nextByKind, archived };
    });
  },

  restore: async (id) => {
    await api["assets.restore"]({ id });
    // Pull from archived; let the next refresh re-seat into the right kind tab.
    set((s) => ({ archived: s.archived.filter((a) => a.id !== id) }));
    await get().refresh();
  },

  permanentlyDelete: async (id) => {
    await api["assets.delete"]({ id });
    set((s) => {
      const nextByKind = { ...s.byKind } as Record<AssetKind, Asset[]>;
      for (const k of KINDS) {
        nextByKind[k] = nextByKind[k].filter((a) => a.id !== id);
      }
      return {
        byKind: nextByKind,
        archived: s.archived.filter((a) => a.id !== id),
      };
    });
  },

  remove: async (id) => {
    await get().permanentlyDelete(id);
  },

  bindEvents: () => {
    if (get().bound) return () => {};
    set({ bound: true });
    const off = api.on("assets.changed", () => {
      void get().refresh();
      void get().refreshArchived();
    });
    return () => {
      off();
      set({ bound: false });
    };
  },
}));

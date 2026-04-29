import { create } from "zustand";
import type { Asset, AssetKind } from "@imagine-studio/core";
import { api } from "../lib/api.js";

const KINDS: AssetKind[] = ["character", "object", "background", "style"];

export interface AssetCreateInput {
  kind: AssetKind;
  name: string;
  description?: string | null;
  promptSnippet?: string | null;
  fileUploads: { bytes: Uint8Array; originalName: string; mimeType: string }[];
}

export interface AssetUpdateInput {
  id: string;
  name?: string;
  description?: string | null;
  promptSnippet?: string | null;
}

interface AssetsState {
  byKind: Record<AssetKind, Asset[]>;
  query: { search?: string; kind?: AssetKind; limit?: number };
  bound: boolean;
  /** Refresh one kind, or all four if `kind` is omitted. */
  refresh: (kind?: AssetKind) => Promise<void>;
  setSearch: (search: string | undefined) => void;
  create: (input: AssetCreateInput) => Promise<Asset>;
  update: (input: AssetUpdateInput) => Promise<Asset>;
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

  setSearch: (search) => {
    set((s) => ({ query: { ...s.query, search: search || undefined } }));
    void get().refresh();
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

  remove: async (id) => {
    await api["assets.delete"]({ id });
    set((s) => {
      const nextByKind = { ...s.byKind } as Record<AssetKind, Asset[]>;
      for (const k of KINDS) {
        nextByKind[k] = nextByKind[k].filter((a) => a.id !== id);
      }
      return { byKind: nextByKind };
    });
  },

  bindEvents: () => {
    if (get().bound) return () => {};
    set({ bound: true });
    const off = api.on("assets.changed", () => {
      void get().refresh();
    });
    return () => {
      off();
      set({ bound: false });
    };
  },
}));

import { create } from "zustand";
import type { ThemePref } from "@imagine-studio/ui";

export type Route =
  | "providers"
  | "settings"
  | "studio"
  | "gallery"
  | "assets"
  | "video";

export interface ToastEntry {
  id: string;
  title: string;
  description?: string;
  variant: "info" | "success" | "warning" | "error";
}

/**
 * Studio draft — kept in `useUIStore` so re-mounts (route switches) preserve
 * the half-typed prompt. Persists to localStorage with a debounced flush
 * (architecture.md §7 — workspace state would normally live in `kv`, but the
 * draft churns at typing speed so localStorage gives instant rehydrate without
 * an IPC round-trip).
 */
export interface StudioDraftAssetIds {
  character: string[];
  object: string[];
  background: string[];
  style: string[];
}

export interface StudioDraft {
  prompt: string;
  providerId: string;
  modelId: string;
  count: number;
  size?: string;
  aspectRatio?: string;
  references: string[];
  parentId?: string;
  assetIds: StudioDraftAssetIds;
}

export const STUDIO_DRAFT_LS_KEY = "imagine-studio.studioDraft.v1";

const DEFAULT_DRAFT: StudioDraft = {
  prompt: "",
  providerId: "",
  modelId: "",
  count: 1,
  references: [],
  assetIds: { character: [], object: [], background: [], style: [] },
};

function normalizeAssetIds(input: unknown): StudioDraftAssetIds {
  const empty: StudioDraftAssetIds = {
    character: [],
    object: [],
    background: [],
    style: [],
  };
  if (!input || typeof input !== "object") return empty;
  const r = input as Record<string, unknown>;
  const pick = (k: keyof StudioDraftAssetIds): string[] => {
    const v = r[k];
    return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
  };
  return {
    character: pick("character"),
    object: pick("object"),
    background: pick("background"),
    style: pick("style"),
  };
}

function loadDraftFromStorage(): StudioDraft {
  if (typeof window === "undefined") return DEFAULT_DRAFT;
  try {
    const raw = window.localStorage.getItem(STUDIO_DRAFT_LS_KEY);
    if (!raw) return DEFAULT_DRAFT;
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    return {
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      providerId:
        typeof parsed.providerId === "string" ? parsed.providerId : "",
      modelId: typeof parsed.modelId === "string" ? parsed.modelId : "",
      count: typeof parsed.count === "number" && parsed.count >= 1 ? parsed.count : 1,
      ...(typeof parsed.size === "string" ? { size: parsed.size } : {}),
      ...(typeof parsed.aspectRatio === "string"
        ? { aspectRatio: parsed.aspectRatio }
        : {}),
      references: Array.isArray(parsed.references)
        ? (parsed.references as string[])
        : [],
      ...(typeof parsed.parentId === "string"
        ? { parentId: parsed.parentId }
        : {}),
      assetIds: normalizeAssetIds(parsed.assetIds),
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

let draftFlushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDraftFlush(draft: StudioDraft): void {
  if (typeof window === "undefined") return;
  if (draftFlushTimer) clearTimeout(draftFlushTimer);
  draftFlushTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STUDIO_DRAFT_LS_KEY, JSON.stringify(draft));
    } catch {
      // localStorage may be full or unavailable (private mode); silently drop.
    }
  }, 400);
}

interface UIState {
  route: Route;
  theme: ThemePref;
  toasts: ToastEntry[];
  studioDraft: StudioDraft;
  /** When true, the renderer should land on /studio at boot (or /providers). */
  preferredInitialRoute: Route | null;
  navigate: (route: Route) => void;
  setTheme: (theme: ThemePref) => void;
  pushToast: (toast: Omit<ToastEntry, "id">) => string;
  dismissToast: (id: string) => void;
  setStudioDraft: (patch: Partial<StudioDraft>) => void;
  resetStudioDraft: () => void;
  setPreferredInitialRoute: (r: Route | null) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  route: "providers",
  theme: "system",
  toasts: [],
  studioDraft: loadDraftFromStorage(),
  preferredInitialRoute: null,
  navigate: (route) => set({ route }),
  setTheme: (theme) => set({ theme }),
  pushToast: (toast) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    return id;
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setStudioDraft: (patch) => {
    const next = { ...get().studioDraft, ...patch };
    set({ studioDraft: next });
    scheduleDraftFlush(next);
  },
  resetStudioDraft: () => {
    set({ studioDraft: { ...DEFAULT_DRAFT } });
    scheduleDraftFlush({ ...DEFAULT_DRAFT });
  },
  setPreferredInitialRoute: (r) => set({ preferredInitialRoute: r }),
}));

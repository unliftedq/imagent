import type { ImageReference } from "@imagine/core";
import type { ThemePref } from "@imagine/ui";
import { create } from "zustand";

/**
 * Five top-level routes (DESIGN.md §10.1 / §11). The pre-Quiet-Density
 * `video` route was merged into Studio's `studioMode` tab; old persisted
 * values are migrated transparently in the store initializer below.
 */
export type Route = "providers" | "settings" | "studio" | "gallery" | "assets" | "models";

export type StudioMode = "image" | "video";

export interface ToastEntry {
  id: string;
  title: string;
  description?: string;
  variant: "info" | "success" | "warning" | "error";
}

/**
 * Studio drafts — kept in `useUIStore` so re-mounts (route switches, tab
 * switches) preserve the half-typed prompt. Persists to localStorage with
 * a debounced flush (architecture.md §7).
 *
 * Quiet-Density rewrite: instead of two top-level drafts (studioDraft,
 * videoDraft), we nest both under `studioDraft` keyed by mode so the
 * unified Studio page can read/write either path through a single
 * setter.
 */
export interface StudioDraftAssetIds {
  character: string[];
  object: string[];
  background: string[];
  style: string[];
}

export type StudioReferenceRole = ImageReference["role"];
export type StudioReferenceRoles = Record<string, StudioReferenceRole>;

export interface ImageDraft {
  prompt: string;
  providerId: string;
  modelId: string;
  count: number;
  size?: string;
  aspectRatio?: string;
  /** Quality tier (e.g. OpenAI's `low | medium | high | auto`). Surfaced
   * when the resolved model's `capabilities.qualities` is non-empty;
   * dropped on switch to a model without qualities. */
  quality?: string;
  /** Output image format (e.g. `png | jpeg | webp`). Surfaced when the
   * resolved model's `capabilities.outputFormats` is non-empty. */
  outputFormat?: string;
  references: string[];
  referenceRoles: StudioReferenceRoles;
  parentId?: string;
  assetIds: StudioDraftAssetIds;
}

export interface VideoDraft {
  prompt: string;
  providerId: string;
  modelId: string;
  durationSec?: number;
  fps?: number;
  resolution?: string;
  aspectRatio?: string;
  references: string[];
  referenceRoles: StudioReferenceRoles;
  /** Optional first-frame image path (drag-drop or picked from gallery). */
  firstFrame?: string;
  parentId?: string;
  assetIds: StudioDraftAssetIds;
}

export interface StudioDraft {
  image: ImageDraft;
  video: VideoDraft;
}

export const STUDIO_MODE_LS_KEY = "imagine.studioMode.v1";
export const STUDIO_DRAFT_LS_KEY = "imagine.studioDraft.v1";
export const VIDEO_DRAFT_LS_KEY = "imagine.videoDraft.v1";
export const ROUTE_LS_KEY = "imagine.route.v1";

const DEFAULT_IMAGE_DRAFT: ImageDraft = {
  prompt: "",
  providerId: "",
  modelId: "",
  count: 1,
  references: [],
  referenceRoles: {},
  assetIds: { character: [], object: [], background: [], style: [] },
};

const DEFAULT_VIDEO_DRAFT: VideoDraft = {
  prompt: "",
  providerId: "",
  modelId: "",
  references: [],
  referenceRoles: {},
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

function normalizeReferenceRoles(input: unknown): StudioReferenceRoles {
  if (!input || typeof input !== "object") return {};
  const roles = input as Record<string, unknown>;
  const next: StudioReferenceRoles = {};
  for (const [path, role] of Object.entries(roles)) {
    if (
      role === "character" ||
      role === "object" ||
      role === "background" ||
      role === "style" ||
      role === "freeform"
    ) {
      next[path] = role;
    }
  }
  return next;
}

function loadImageDraftFromStorage(): ImageDraft {
  if (typeof window === "undefined") return DEFAULT_IMAGE_DRAFT;
  try {
    const raw = window.localStorage.getItem(STUDIO_DRAFT_LS_KEY);
    if (!raw) return DEFAULT_IMAGE_DRAFT;
    const parsed = JSON.parse(raw) as Partial<ImageDraft>;
    return {
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      providerId: typeof parsed.providerId === "string" ? parsed.providerId : "",
      modelId: typeof parsed.modelId === "string" ? parsed.modelId : "",
      count: typeof parsed.count === "number" && parsed.count >= 1 ? parsed.count : 1,
      ...(typeof parsed.size === "string" ? { size: parsed.size } : {}),
      ...(typeof parsed.aspectRatio === "string" ? { aspectRatio: parsed.aspectRatio } : {}),
      ...(typeof parsed.quality === "string" ? { quality: parsed.quality } : {}),
      ...(typeof parsed.outputFormat === "string" ? { outputFormat: parsed.outputFormat } : {}),
      references: Array.isArray(parsed.references) ? (parsed.references as string[]) : [],
      referenceRoles: normalizeReferenceRoles(parsed.referenceRoles),
      ...(typeof parsed.parentId === "string" ? { parentId: parsed.parentId } : {}),
      assetIds: normalizeAssetIds(parsed.assetIds),
    };
  } catch {
    return DEFAULT_IMAGE_DRAFT;
  }
}

function loadVideoDraftFromStorage(): VideoDraft {
  if (typeof window === "undefined") return DEFAULT_VIDEO_DRAFT;
  try {
    const raw = window.localStorage.getItem(VIDEO_DRAFT_LS_KEY);
    if (!raw) return DEFAULT_VIDEO_DRAFT;
    const parsed = JSON.parse(raw) as Partial<VideoDraft>;
    return {
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      providerId: typeof parsed.providerId === "string" ? parsed.providerId : "",
      modelId: typeof parsed.modelId === "string" ? parsed.modelId : "",
      ...(typeof parsed.durationSec === "number" ? { durationSec: parsed.durationSec } : {}),
      ...(typeof parsed.fps === "number" ? { fps: parsed.fps } : {}),
      ...(typeof parsed.resolution === "string" ? { resolution: parsed.resolution } : {}),
      ...(typeof parsed.aspectRatio === "string" ? { aspectRatio: parsed.aspectRatio } : {}),
      references: Array.isArray(parsed.references) ? (parsed.references as string[]) : [],
      referenceRoles: normalizeReferenceRoles(parsed.referenceRoles),
      ...(typeof parsed.firstFrame === "string" ? { firstFrame: parsed.firstFrame } : {}),
      ...(typeof parsed.parentId === "string" ? { parentId: parsed.parentId } : {}),
      assetIds: normalizeAssetIds(parsed.assetIds),
    };
  } catch {
    return DEFAULT_VIDEO_DRAFT;
  }
}

let imageDraftFlushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleImageDraftFlush(draft: ImageDraft): void {
  if (typeof window === "undefined") return;
  if (imageDraftFlushTimer) clearTimeout(imageDraftFlushTimer);
  imageDraftFlushTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STUDIO_DRAFT_LS_KEY, JSON.stringify(draft));
    } catch {
      // localStorage may be full or unavailable (private mode); silently drop.
    }
  }, 400);
}

let videoDraftFlushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleVideoDraftFlush(draft: VideoDraft): void {
  if (typeof window === "undefined") return;
  if (videoDraftFlushTimer) clearTimeout(videoDraftFlushTimer);
  videoDraftFlushTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(VIDEO_DRAFT_LS_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, 400);
}

function persistMode(mode: StudioMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STUDIO_MODE_LS_KEY, mode);
  } catch {
    // ignore
  }
}

/**
 * One-time migration: a stored `activeRoute='video'` (or our older
 * `imagine.route.v1='video'`) maps to `{ route: 'studio', studioMode: 'video' }`.
 * Read both possible keys; if either points at the dropped 'video' route,
 * normalise on first boot.
 */
function loadInitialModeAndRoute(): { route: Route; studioMode: StudioMode } {
  if (typeof window === "undefined") {
    return { route: "providers", studioMode: "image" };
  }
  let storedMode: StudioMode = "image";
  try {
    const m = window.localStorage.getItem(STUDIO_MODE_LS_KEY);
    if (m === "image" || m === "video") storedMode = m;
  } catch {
    // ignore
  }
  let storedRoute: Route = "providers";
  try {
    const r = window.localStorage.getItem(ROUTE_LS_KEY);
    if (
      r === "studio" ||
      r === "gallery" ||
      r === "assets" ||
      r === "providers" ||
      r === "settings"
    ) {
      storedRoute = r;
    } else if (r === "video") {
      // Migrate old 'video' route → studio + studioMode='video'.
      storedRoute = "studio";
      storedMode = "video";
      try {
        window.localStorage.setItem(ROUTE_LS_KEY, "studio");
        window.localStorage.setItem(STUDIO_MODE_LS_KEY, "video");
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return { route: storedRoute, studioMode: storedMode };
}

function persistRoute(route: Route): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROUTE_LS_KEY, route);
  } catch {
    // ignore
  }
}

export interface RemixPayloadImage {
  kind: "image";
  request: {
    prompt: string;
    providerId: string;
    model: string;
    count: number;
    size?: string;
    aspectRatio?: string;
    references: { path: string; role?: StudioReferenceRole }[];
  };
  parentId: string;
}

export interface RemixPayloadVideo {
  kind: "video";
  request: {
    prompt: string;
    providerId: string;
    model: string;
    durationSec?: number;
    fps?: number;
    resolution?: string;
    aspectRatio?: string;
    firstFrame?: string;
    references: { path: string; role?: StudioReferenceRole }[];
  };
  parentId: string;
}

export type RemixPayload = RemixPayloadImage | RemixPayloadVideo;

interface UIState {
  route: Route;
  studioMode: StudioMode;
  theme: ThemePref;
  toasts: ToastEntry[];
  studioDraft: StudioDraft;
  /** When true, the renderer should land on /studio at boot (or /providers). */
  preferredInitialRoute: Route | null;
  navigate: (route: Route) => void;
  setStudioMode: (mode: StudioMode) => void;
  setTheme: (theme: ThemePref) => void;
  pushToast: (toast: Omit<ToastEntry, "id">) => string;
  dismissToast: (id: string) => void;
  setImageDraft: (patch: Partial<ImageDraft>) => void;
  setVideoDraft: (patch: Partial<VideoDraft>) => void;
  /** Convenience used from M5/M6 callsites — proxies to setImageDraft. */
  setStudioDraft: (patch: Partial<ImageDraft>) => void;
  resetDraft: (mode: StudioMode) => void;
  resetStudioDraft: () => void;
  resetVideoDraft: () => void;
  /** Apply a remix payload (from the gallery → "Remix" action) to the right
   * draft and switch to the matching mode. Both kinds land on /studio. */
  applyRemix: (payload: RemixPayload) => void;
  setPreferredInitialRoute: (r: Route | null) => void;
}

const { route: INITIAL_ROUTE, studioMode: INITIAL_MODE } = loadInitialModeAndRoute();

export const useUIStore = create<UIState>((set, get) => ({
  route: INITIAL_ROUTE,
  studioMode: INITIAL_MODE,
  theme: "system",
  toasts: [],
  studioDraft: {
    image: loadImageDraftFromStorage(),
    video: loadVideoDraftFromStorage(),
  },
  preferredInitialRoute: null,
  navigate: (route) => {
    set({ route });
    persistRoute(route);
  },
  setStudioMode: (mode) => {
    set({ studioMode: mode });
    persistMode(mode);
  },
  setTheme: (theme) => set({ theme }),
  pushToast: (toast) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setImageDraft: (patch) => {
    const next: ImageDraft = { ...get().studioDraft.image, ...patch };
    set((s) => ({ studioDraft: { ...s.studioDraft, image: next } }));
    scheduleImageDraftFlush(next);
  },
  setVideoDraft: (patch) => {
    const next: VideoDraft = { ...get().studioDraft.video, ...patch };
    set((s) => ({ studioDraft: { ...s.studioDraft, video: next } }));
    scheduleVideoDraftFlush(next);
  },
  setStudioDraft: (patch) => {
    // Back-compat alias used by M5/M6 callsites that still expect the
    // single-draft API. Always targets the image draft.
    const next: ImageDraft = { ...get().studioDraft.image, ...patch };
    set((s) => ({ studioDraft: { ...s.studioDraft, image: next } }));
    scheduleImageDraftFlush(next);
  },
  resetDraft: (mode) => {
    if (mode === "image") {
      set((s) => ({
        studioDraft: { ...s.studioDraft, image: { ...DEFAULT_IMAGE_DRAFT } },
      }));
      scheduleImageDraftFlush({ ...DEFAULT_IMAGE_DRAFT });
    } else {
      set((s) => ({
        studioDraft: { ...s.studioDraft, video: { ...DEFAULT_VIDEO_DRAFT } },
      }));
      scheduleVideoDraftFlush({ ...DEFAULT_VIDEO_DRAFT });
    }
  },
  resetStudioDraft: () => {
    set((s) => ({
      studioDraft: { ...s.studioDraft, image: { ...DEFAULT_IMAGE_DRAFT } },
    }));
    scheduleImageDraftFlush({ ...DEFAULT_IMAGE_DRAFT });
  },
  resetVideoDraft: () => {
    set((s) => ({
      studioDraft: { ...s.studioDraft, video: { ...DEFAULT_VIDEO_DRAFT } },
    }));
    scheduleVideoDraftFlush({ ...DEFAULT_VIDEO_DRAFT });
  },
  applyRemix: (payload) => {
    if (payload.kind === "video") {
      const r = payload.request;
      const next: VideoDraft = {
        ...get().studioDraft.video,
        prompt: r.prompt,
        providerId: r.providerId,
        modelId: r.model,
        ...(typeof r.durationSec === "number" ? { durationSec: r.durationSec } : {}),
        ...(typeof r.fps === "number" ? { fps: r.fps } : {}),
        ...(typeof r.resolution === "string" ? { resolution: r.resolution } : {}),
        ...(typeof r.aspectRatio === "string" ? { aspectRatio: r.aspectRatio } : {}),
        ...(typeof r.firstFrame === "string" ? { firstFrame: r.firstFrame } : {}),
        references: r.references.map((ref) => ref.path),
        referenceRoles: Object.fromEntries(
          r.references.map((ref) => [ref.path, ref.role ?? "freeform"]),
        ),
        parentId: payload.parentId,
      };
      set((s) => ({
        studioDraft: { ...s.studioDraft, video: next },
        studioMode: "video",
        route: "studio",
      }));
      scheduleVideoDraftFlush(next);
      persistMode("video");
      persistRoute("studio");
    } else {
      const r = payload.request;
      const next: ImageDraft = {
        ...get().studioDraft.image,
        prompt: r.prompt,
        providerId: r.providerId,
        modelId: r.model,
        count: r.count,
        ...(typeof r.size === "string" ? { size: r.size } : {}),
        ...(typeof r.aspectRatio === "string" ? { aspectRatio: r.aspectRatio } : {}),
        references: r.references.map((ref) => ref.path),
        referenceRoles: Object.fromEntries(
          r.references.map((ref) => [ref.path, ref.role ?? "freeform"]),
        ),
        parentId: payload.parentId,
      };
      set((s) => ({
        studioDraft: { ...s.studioDraft, image: next },
        studioMode: "image",
        route: "studio",
      }));
      scheduleImageDraftFlush(next);
      persistMode("image");
      persistRoute("studio");
    }
  },
  setPreferredInitialRoute: (r) => set({ preferredInitialRoute: r }),
}));

import type { ImageReference } from "@imagent/core";
import type { ThemePref } from "@imagent/ui";
import { create } from "zustand";

/**
 * Top-level page routes. Settings, Providers, and Models are no longer
 * pages — they live inside the Settings dialog (see `settingsOpen` /
 * `settingsSection` below). The pre-Quiet-Density `video` route was
 * merged into Studio's `studioMode` tab; old persisted values for any
 * of the removed routes are migrated transparently in the store
 * initializer below.
 */
export type Route = "studio" | "gallery" | "assets";

/**
 * Settings dialog sections. The dialog uses a two-column layout: section
 * list on the left, content on the right. Order:
 *  - `general` — personal preferences (language, theme, defaults). First
 *    because it's what most users touch repeatedly.
 *  - `providers` — provider access. Setup-critical: a fresh install
 *    auto-opens here.
 *  - `models` — model catalogue, depends on providers.
 *  - `about` — app version + update check.
 */
export type SettingsSection = "general" | "providers" | "models" | "about";

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  "general",
  "providers",
  "models",
  "about",
] as const;

export type StudioMode = "image" | "video" | "audio";

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
  /** Optional first-frame image path (picked from local file or gallery). */
  firstFrame?: string;
  /** Optional last-frame image path (picked from local file or gallery). */
  lastFrame?: string;
  parentId?: string;
  assetIds: StudioDraftAssetIds;
}

export interface AudioDraft {
  providerId: string | null;
  model: string | null;
  text: string;
  voice: string | null;
  speed: number | null;
  codec: string | null;
  formatQuality: string | null;
  /** Per-model extra knob values (stability, emotion, vol, pitch, ...). */
  extras: Record<string, string | number>;
  parentId?: string;
}

export interface StudioDraft {
  image: ImageDraft;
  video: VideoDraft;
  audio: AudioDraft;
}

export const STUDIO_MODE_LS_KEY = "imagent.studioMode.v1";
export const STUDIO_DRAFT_LS_KEY = "imagent.studioDraft.v1";
export const VIDEO_DRAFT_LS_KEY = "imagent.videoDraft.v1";
export const AUDIO_DRAFT_LS_KEY = "imagent.audioDraft.v1";
export const ROUTE_LS_KEY = "imagent.route.v1";

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

const DEFAULT_AUDIO_DRAFT: AudioDraft = {
  providerId: null,
  model: null,
  text: "",
  voice: null,
  speed: null,
  codec: null,
  formatQuality: null,
  extras: {},
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

function normalizeAudioExtras(input: unknown): Record<string, string | number> {
  if (!input || typeof input !== "object") return {};
  const extras: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number") {
      extras[key] = value;
    }
  }
  return extras;
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
      ...(typeof parsed.lastFrame === "string" ? { lastFrame: parsed.lastFrame } : {}),
      ...(typeof parsed.parentId === "string" ? { parentId: parsed.parentId } : {}),
      assetIds: normalizeAssetIds(parsed.assetIds),
    };
  } catch {
    return DEFAULT_VIDEO_DRAFT;
  }
}

function loadAudioDraftFromStorage(): AudioDraft {
  if (typeof window === "undefined") return DEFAULT_AUDIO_DRAFT;
  try {
    const raw = window.localStorage.getItem(AUDIO_DRAFT_LS_KEY);
    if (!raw) return DEFAULT_AUDIO_DRAFT;
    const parsed = JSON.parse(raw) as Partial<AudioDraft>;
    return {
      providerId: typeof parsed.providerId === "string" ? parsed.providerId : null,
      model: typeof parsed.model === "string" ? parsed.model : null,
      text: typeof parsed.text === "string" ? parsed.text : "",
      voice: typeof parsed.voice === "string" ? parsed.voice : null,
      speed: typeof parsed.speed === "number" ? parsed.speed : null,
      codec: typeof parsed.codec === "string" ? parsed.codec : null,
      formatQuality: typeof parsed.formatQuality === "string" ? parsed.formatQuality : null,
      extras: normalizeAudioExtras(parsed.extras),
      ...(typeof parsed.parentId === "string" ? { parentId: parsed.parentId } : {}),
    };
  } catch {
    return DEFAULT_AUDIO_DRAFT;
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

let audioDraftFlushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAudioDraftFlush(draft: AudioDraft): void {
  if (typeof window === "undefined") return;
  if (audioDraftFlushTimer) clearTimeout(audioDraftFlushTimer);
  audioDraftFlushTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(AUDIO_DRAFT_LS_KEY, JSON.stringify(draft));
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
 * One-time migration:
 *  - Old `imagent.route.v1='video'` → `{ route: 'studio', studioMode: 'video' }`.
 *  - Old `providers`/`models`/`settings` routes → `studio` (they are now
 *    surfaced through the Settings dialog rather than being pages).
 */
function loadInitialModeAndRoute(): { route: Route; studioMode: StudioMode } {
  if (typeof window === "undefined") {
    return { route: "studio", studioMode: "image" };
  }
  let storedMode: StudioMode = "image";
  try {
    const m = window.localStorage.getItem(STUDIO_MODE_LS_KEY);
    if (m === "image" || m === "video" || m === "audio") storedMode = m;
  } catch {
    // ignore
  }
  let storedRoute: Route = "studio";
  try {
    const r = window.localStorage.getItem(ROUTE_LS_KEY);
    if (r === "studio" || r === "gallery" || r === "assets") {
      storedRoute = r;
    } else if (r === "video") {
      storedRoute = "studio";
      storedMode = "video";
      try {
        window.localStorage.setItem(ROUTE_LS_KEY, "studio");
        window.localStorage.setItem(STUDIO_MODE_LS_KEY, "video");
      } catch {
        // ignore
      }
    } else if (r === "providers" || r === "models" || r === "settings") {
      // Removed routes — fall back to studio. Settings dialog handles
      // the old destinations now.
      storedRoute = "studio";
      try {
        window.localStorage.setItem(ROUTE_LS_KEY, "studio");
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
    lastFrame?: string;
    references: { path: string; role?: StudioReferenceRole }[];
  };
  parentId: string;
}

export interface RemixPayloadAudio {
  kind: "audio";
  request: {
    prompt: string;
    providerId: string;
    model: string;
    voice?: string;
    speed?: number;
    outputFormat?: string;
    raw?: Record<string, unknown>;
  };
  parentId: string;
}

export type RemixPayload = RemixPayloadImage | RemixPayloadVideo | RemixPayloadAudio;

interface UIState {
  route: Route;
  studioMode: StudioMode;
  theme: ThemePref;
  toasts: ToastEntry[];
  studioDraft: StudioDraft;
  /** When true, the renderer should land on /studio at boot (or auto-open Settings). */
  preferredInitialRoute: Route | null;
  /** Whether the Settings dialog is currently open. */
  settingsOpen: boolean;
  /** Active section within the Settings dialog. */
  settingsSection: SettingsSection;
  navigate: (route: Route) => void;
  setStudioMode: (mode: StudioMode) => void;
  setTheme: (theme: ThemePref) => void;
  pushToast: (toast: Omit<ToastEntry, "id">) => string;
  dismissToast: (id: string) => void;
  setImageDraft: (patch: Partial<ImageDraft>) => void;
  setVideoDraft: (patch: Partial<VideoDraft>) => void;
  setAudioDraft: (patch: Partial<AudioDraft>) => void;
  /** Convenience used from M5/M6 callsites — proxies to setImageDraft. */
  setStudioDraft: (patch: Partial<ImageDraft>) => void;
  resetDraft: (mode: StudioMode) => void;
  resetStudioDraft: () => void;
  resetVideoDraft: () => void;
  resetAudioDraft: () => void;
  /** Apply a remix payload (from the gallery → "Remix" action) to the right
   * draft and switch to the matching mode. Both kinds land on /studio. */
  applyRemix: (payload: RemixPayload) => void;
  setPreferredInitialRoute: (r: Route | null) => void;
  /** Open the Settings dialog, optionally jumping to a specific section. */
  openSettings: (section?: SettingsSection) => void;
  /** Close the Settings dialog. The active section is preserved for next time. */
  closeSettings: () => void;
  setSettingsSection: (section: SettingsSection) => void;
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
    audio: loadAudioDraftFromStorage(),
  },
  preferredInitialRoute: null,
  settingsOpen: false,
  settingsSection: "general",
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
  setAudioDraft: (patch) => {
    const next: AudioDraft = { ...get().studioDraft.audio, ...patch };
    set((s) => ({ studioDraft: { ...s.studioDraft, audio: next } }));
    scheduleAudioDraftFlush(next);
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
    } else if (mode === "video") {
      set((s) => ({
        studioDraft: { ...s.studioDraft, video: { ...DEFAULT_VIDEO_DRAFT } },
      }));
      scheduleVideoDraftFlush({ ...DEFAULT_VIDEO_DRAFT });
    } else {
      set((s) => ({
        studioDraft: { ...s.studioDraft, audio: { ...DEFAULT_AUDIO_DRAFT } },
      }));
      scheduleAudioDraftFlush({ ...DEFAULT_AUDIO_DRAFT });
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
  resetAudioDraft: () => {
    set((s) => ({
      studioDraft: { ...s.studioDraft, audio: { ...DEFAULT_AUDIO_DRAFT } },
    }));
    scheduleAudioDraftFlush({ ...DEFAULT_AUDIO_DRAFT });
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
        ...(typeof r.lastFrame === "string" ? { lastFrame: r.lastFrame } : {}),
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
    } else if (payload.kind === "audio") {
      const r = payload.request;
      const next: AudioDraft = {
        ...get().studioDraft.audio,
        text: r.prompt,
        providerId: r.providerId,
        model: r.model,
        voice: r.voice ?? null,
        speed: r.speed ?? null,
        outputFormat: r.outputFormat ?? null,
        extras: normalizeAudioExtras(r.raw),
        parentId: payload.parentId,
      };
      set((s) => ({
        studioDraft: { ...s.studioDraft, audio: next },
        studioMode: "audio",
        route: "studio",
      }));
      scheduleAudioDraftFlush(next);
      persistMode("audio");
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
  openSettings: (section) =>
    set((s) => ({
      settingsOpen: true,
      settingsSection: section ?? s.settingsSection,
    })),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsSection: (section) => set({ settingsSection: section }),
}));

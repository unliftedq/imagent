import { app, dialog, shell, type BrowserWindow, type IpcMain } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  type ConfigStore,
  type ProviderPreferences,
  type ProviderSecrets,
  type SecretsStore,
  DEFAULT_CONFIG,
} from "@imagine-studio/config";
import {
  configuredProviderCount as _unused,
  type ImageRegistry,
  type VideoRegistry,
} from "@imagine-studio/providers";
import {
  BoardRepository,
  GalleryRepository,
  JobRepository,
  KvRepository,
  type DatabaseType,
  type PathResolver,
} from "@imagine-studio/persistence";
import {
  IpcHandlerError,
  notImplemented,
  registerIpcHandlers,
  type ContractHandlers,
  type IpcServer,
} from "@imagine-studio/ipc";
import type {
  Board,
  GalleryItem,
  ImageRequest,
  Job,
  Logger,
} from "@imagine-studio/core";
import type { RuntimeServices } from "./job-runner-bootstrap.js";

void _unused;

export interface IpcDeps {
  ipcMain: IpcMain;
  db: DatabaseType;
  configStore: ConfigStore;
  secretsStore: SecretsStore;
  paths: PathResolver;
  logger: Logger;
  runtime: RuntimeServices;
  /** All currently-open windows. Used to address `system.chooseDirectory` to the right one. */
  getMainWindow: () => BrowserWindow | null;
}

/**
 * Wires every IPC route described in the contract. M4 routes are real;
 * M5/M6/M7 routes return `not_implemented` envelopes. Push events are not
 * forwarded here — the main process attaches `webContents` targets via
 * `IpcServer.addEventTarget`.
 */
export function setupIpc(deps: IpcDeps): IpcServer {
  const { ipcMain, configStore, secretsStore, paths, logger, runtime, getMainWindow } = deps;
  const kv = new KvRepository(deps.db);
  const galleryRepo = new GalleryRepository(deps.db);
  const boardRepo = new BoardRepository(deps.db);
  const jobsRepo = new JobRepository(deps.db);

  /** Resolve a relative gallery path against `dataDir`. */
  const absGalleryPath = (rel: string): string => {
    return path.isAbsolute(rel) ? rel : path.join(paths.dataDir, rel);
  };

  /** Best-effort filesystem unlink — never throws. */
  const safeUnlink = async (abs: string): Promise<void> => {
    try {
      await fs.unlink(abs);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") {
        logger.warn("unlink failed", { path: abs, err: String(err) });
      }
    }
  };

  /** Generate a fresh id; mirrors JobRunner's defaultIdFactory. */
  const newId = (): string => {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
    return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  };

  const handlers: Partial<ContractHandlers> = {
    "providers.list": async () => {
      const config = await configStore.loadConfig();
      const secrets = await secretsStore.loadSecrets();
      return providerSummaryList(config.providers, secrets);
    },

    "providers.config.get": async () => {
      const config = await configStore.loadConfig();
      return prefsPayloadFromConfig(config.providers);
    },

    "providers.config.set": async (input) => {
      const next = await configStore.saveConfig({ providers: prefsConfigFromPayload(input) });
      return prefsPayloadFromConfig(next.providers);
    },

    "providers.secrets.get": async () => {
      const secrets = await secretsStore.loadSecrets();
      return maskSecrets(secrets);
    },

    "providers.secrets.set": async (input) => {
      // Map the renderer's plaintext payload into the internal patch shape.
      const patch: Partial<ProviderSecrets> = {};
      if (input.openai?.apiKey) patch.openai = { apiKey: input.openai.apiKey };
      if (input["azure-openai"]) {
        const cur = (await secretsStore.loadSecrets())["azure-openai"];
        const merged = {
          endpoint: input["azure-openai"].endpoint ?? cur?.endpoint ?? "",
          apiKey: input["azure-openai"].apiKey ?? cur?.apiKey ?? "",
          apiVersion: input["azure-openai"].apiVersion ?? cur?.apiVersion ?? "2024-10-21",
        };
        if (merged.endpoint && merged.apiKey) patch["azure-openai"] = merged;
      }
      if (input.google?.apiKey) patch.google = { apiKey: input.google.apiKey };
      if (input["flux-bfl"]?.apiKey) patch["flux-bfl"] = { apiKey: input["flux-bfl"].apiKey };
      if (input.volcengine) {
        const cur = (await secretsStore.loadSecrets()).volcengine;
        if (input.volcengine.apiKey || input.volcengine.region) {
          patch.volcengine = {
            apiKey: input.volcengine.apiKey ?? cur?.apiKey ?? "",
            region: input.volcengine.region ?? cur?.region ?? "cn-beijing",
          };
        }
      }
      if (input.xai?.apiKey) patch.xai = { apiKey: input.xai.apiKey };
      await secretsStore.saveSecrets(patch);
      // Rebuild registries so subsequent providers.test() picks up the new keys.
      await runtime.refresh();
      return maskSecrets(await secretsStore.loadSecrets());
    },

    "providers.test": async ({ id }) => {
      const provider =
        runtime.imageRegistry.get(id) ?? runtime.videoRegistry.get(id);
      if (!provider) {
        return { ok: false, reason: `provider '${id}' is not configured` };
      }
      if (!provider.test) {
        return { ok: false, reason: `provider '${id}' does not implement test()` };
      }
      try {
        return await provider.test();
      } catch (err) {
        // Defense in depth — the contract says test() never throws, but if a
        // future implementation slips, surface the failure cleanly.
        return { ok: false, reason: (err as Error)?.message ?? String(err) };
      }
    },

    "app.preferences.get": async () => {
      const config = await configStore.loadConfig();
      return config.app;
    },

    "app.preferences.set": async (input) => {
      const next = await configStore.saveConfig({ app: input });
      return next.app;
    },

    "app.version": async () => ({
      app: app.getVersion(),
      electron: process.versions.electron ?? "unknown",
      node: process.versions.node,
      chrome: process.versions.chrome ?? "unknown",
      platform: process.platform,
      arch: process.arch,
      dataDir: paths.dataDir,
    }),

    "app.storagePaths": async () => ({
      dataDir: paths.dataDir,
      configFile: paths.configFile(),
      secretsBin: paths.secretsBin(),
      secretsJson: paths.secretsFile(),
      dbFile: paths.dbFile(),
      galleryDir: path.join(paths.dataDir, "gallery"),
      assetsDir: paths.assetsDir(),
      logsDir: paths.logsDir(),
    }),

    "system.openExternal": async ({ url }) => {
      // Only allow http/https/mailto — refuse `file://` and shell handlers.
      if (!/^(https?|mailto):/i.test(url)) {
        throw new IpcHandlerError("validation_failed", `Refusing to open URL '${url}'`);
      }
      await shell.openExternal(url);
    },

    "system.openPath": async ({ path: target }) => {
      // Only allow paths inside dataDir to avoid arbitrary fs poking from the renderer.
      const abs = path.resolve(target);
      if (!abs.startsWith(path.resolve(paths.dataDir))) {
        throw new IpcHandlerError("validation_failed", `Refusing to open path outside dataDir`);
      }
      try {
        await fs.mkdir(abs, { recursive: true });
      } catch {
        // path may be a file — that's fine; openPath handles both.
      }
      const reason = await shell.openPath(abs);
      if (reason) throw new IpcHandlerError("internal", `openPath failed: ${reason}`);
    },

    "system.chooseDirectory": async (input) => {
      const win = getMainWindow();
      const opts: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
      };
      if (input?.defaultPath) opts.defaultPath = input.defaultPath;
      const res = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (res.canceled || res.filePaths.length === 0) return { path: null };
      return { path: res.filePaths[0] ?? null };
    },

    "system.resetConfig": async () => {
      await configStore.saveConfig(DEFAULT_CONFIG);
      await runtime.refresh();
    },

    "workspace.kv.get": async ({ key }) => kv.get(key),
    "workspace.kv.set": async ({ key, value }) => {
      kv.set(key, value);
    },
    "workspace.kv.delete": async ({ key }) => {
      kv.delete(key);
    },

    // M5 — Studio + Gallery
    "image.generate": async (request) => {
      const r = request as ImageRequest;
      const intent = {
        kind: "image" as const,
        request: r,
        ...(r.parentId ? { parentId: r.parentId } : {}),
        ...(r.boardId ? { boardId: r.boardId } : {}),
      };
      // Subscribe to a single job's terminal events, then start. Listeners are
      // wired with a sentinel jobId we capture from start()'s return value.
      let resolveJob!: (job: Job) => void;
      let rejectJob!: (err: Error) => void;
      const completed = new Promise<Job>((resolve, reject) => {
        resolveJob = resolve;
        rejectJob = reject;
      });
      let targetId: string | null = null;
      const onCompleted = (j: Job): void => {
        if (targetId && j.id !== targetId) return;
        cleanup();
        resolveJob(j);
      };
      const onFailed = (j: Job): void => {
        if (targetId && j.id !== targetId) return;
        cleanup();
        rejectJob(new Error(j.errorMessage ?? `job ended in state '${j.state}'`));
      };
      const cleanup = (): void => {
        runtime.jobRunner.off("job.completed", onCompleted);
        runtime.jobRunner.off("job.failed", onFailed);
      };
      runtime.jobRunner.on("job.completed", onCompleted);
      runtime.jobRunner.on("job.failed", onFailed);
      try {
        targetId = await runtime.jobRunner.start(intent);
      } catch (err) {
        cleanup();
        throw err;
      }
      const job = await completed;
      if (!job.resultItemId) {
        throw new IpcHandlerError(
          "internal",
          "image.generate: job completed without resultItemId",
        );
      }
      const item = galleryRepo.get(job.resultItemId);
      if (!item) {
        throw new IpcHandlerError(
          "internal",
          `image.generate: gallery item ${job.resultItemId} missing`,
        );
      }
      // Notify any other windows via gallery.changed.
      try {
        server.emit("gallery.changed", { id: item.id, op: "created", item });
      } catch (err) {
        logger.warn("gallery.changed emit failed", { err: String(err) });
      }
      return item;
    },

    "gallery.query": async (query) => {
      return galleryRepo.query(query);
    },

    "gallery.show": async ({ id }) => {
      const item = galleryRepo.get(id);
      if (!item) {
        throw new IpcHandlerError("not_found", `gallery item '${id}' not found`);
      }
      const parent = item.parentId ? galleryRepo.get(item.parentId) : null;
      const children = galleryRepo.listChildren(id).slice(0, 3);
      const siblings = item.parentId
        ? galleryRepo
            .listChildren(item.parentId)
            .filter((s) => s.id !== id)
            .slice(0, 3)
        : [];
      return { item, parent, children, siblings };
    },

    "gallery.remix": async ({ itemId }) => {
      const parent = galleryRepo.get(itemId);
      if (!parent) {
        throw new IpcHandlerError("not_found", `gallery item '${itemId}' not found`);
      }
      const params = parseJsonObject(parent.paramsJson);
      const req: ImageRequest = {
        prompt: parent.prompt,
        ...(parent.negativePrompt ? { negativePrompt: parent.negativePrompt } : {}),
        providerId: parent.providerId,
        model: parent.model,
        ...(typeof params.size === "string" ? { size: params.size } : {}),
        ...(typeof params.aspectRatio === "string"
          ? { aspectRatio: params.aspectRatio }
          : {}),
        count: typeof params.count === "number" ? params.count : 1,
        ...(typeof params.seed === "number" ? { seed: params.seed } : {}),
        references: [],
        assetIds: [],
        parentId: parent.id,
      };
      return req;
    },

    "gallery.toggleFavorite": async ({ id, favorited }) => {
      const item = galleryRepo.get(id);
      if (!item) {
        throw new IpcHandlerError("not_found", `gallery item '${id}' not found`);
      }
      const next = typeof favorited === "boolean" ? favorited : !item.favorited;
      galleryRepo.toggleFavorite(id, next);
      try {
        server.emit("gallery.changed", { id, op: "updated" });
      } catch (err) {
        logger.warn("gallery.changed emit failed", { err: String(err) });
      }
    },

    "gallery.delete": async ({ id }) => {
      const item = galleryRepo.get(id);
      if (!item) {
        // Already gone — no-op.
        return;
      }
      const abs = absGalleryPath(item.relPath);
      galleryRepo.delete(id);
      await safeUnlink(abs);
      if (item.thumbPath) {
        await safeUnlink(absGalleryPath(item.thumbPath));
      }
      try {
        server.emit("gallery.changed", { id, op: "deleted" });
      } catch (err) {
        logger.warn("gallery.changed emit failed", { err: String(err) });
      }
    },

    "boards.list": async () => {
      return boardRepo.list();
    },

    "boards.create": async (input) => {
      const now = Date.now();
      const board: Board = {
        // Server-side overrides — we don't trust renderer-supplied id/timestamps.
        id: newId(),
        name: input.name,
        description: input.description ?? null,
        coverItemId: input.coverItemId ?? null,
        position: input.position ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      return boardRepo.create(board);
    },

    "boards.update": async ({ id, patch }) => {
      const existing = boardRepo.get(id);
      if (!existing) {
        throw new IpcHandlerError("not_found", `board '${id}' not found`);
      }
      const merged: Partial<Board> = {};
      if (patch.name !== undefined) merged.name = patch.name;
      if (patch.description !== undefined)
        merged.description = patch.description ?? null;
      if (patch.coverItemId !== undefined)
        merged.coverItemId = patch.coverItemId ?? null;
      if (patch.position !== undefined) merged.position = patch.position;
      return boardRepo.update(id, merged);
    },

    "boards.delete": async ({ id }) => {
      boardRepo.delete(id);
    },

    "boards.addItem": async ({ boardId, itemId, position }) => {
      const board = boardRepo.get(boardId);
      if (!board) {
        throw new IpcHandlerError("not_found", `board '${boardId}' not found`);
      }
      const item = galleryRepo.get(itemId);
      if (!item) {
        throw new IpcHandlerError("not_found", `gallery item '${itemId}' not found`);
      }
      if (boardRepo.hasItem(boardId, itemId)) return; // idempotent
      if (typeof position === "number") {
        boardRepo.addItem({
          boardId,
          itemId,
          position,
          addedAt: Date.now(),
        });
      } else {
        boardRepo.appendItem(boardId, itemId);
      }
    },

    "boards.removeItem": async ({ boardId, itemId }) => {
      boardRepo.removeItem(boardId, itemId);
    },

    "boards.setCover": async ({ boardId, itemId }) => {
      const board = boardRepo.get(boardId);
      if (!board) {
        throw new IpcHandlerError("not_found", `board '${boardId}' not found`);
      }
      boardRepo.setCover(boardId, itemId);
    },

    "jobs.list": async (query) => {
      return jobsRepo.query(query);
    },

    "jobs.cancel": async ({ id }) => {
      await runtime.jobRunner.cancel(id);
    },

    "image.models": async ({ providerId }) => {
      const config = await configStore.loadConfig();
      const provider = runtime.imageRegistry.get(providerId);
      const models = provider ? [...provider.models.values()] : [];
      const defaultModel = readDefaultModel(config.providers, providerId);
      return { providerId, defaultModel, models };
    },

    // M6 — Assets
    "assets.list": notImplemented("M6", "assets.list"),
    "assets.create": notImplemented("M6", "assets.create"),
    "assets.update": notImplemented("M6", "assets.update"),
    "assets.delete": notImplemented("M6", "assets.delete"),
    "assets.uploadFile": notImplemented("M6", "assets.uploadFile"),

    // M7 — Video Studio
    "video.submit": notImplemented("M7", "video.submit"),
  };

  const server = registerIpcHandlers(ipcMain, handlers);
  logger.info("[ipc] handlers registered");
  return server;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonObject(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readDefaultModel(
  prefs: ProviderPreferences,
  providerId: string,
): string | null {
  switch (providerId) {
    case "openai":
      return prefs.openai.defaultModel ?? null;
    case "azure-openai":
      return prefs["azure-openai"].deployments.image || null;
    case "google":
      return prefs.google.defaultModel ?? null;
    case "flux-bfl":
      return prefs["flux-bfl"].defaultModel ?? null;
    case "volcengine":
      // For image surface; video default is `defaultVideoModel` and is not
      // exposed by `image.models`.
      return prefs.volcengine.defaultImageModel ?? null;
    case "xai":
      return prefs.xai.defaultModel ?? null;
    default:
      return null;
  }
}

function providerSummaryList(
  prefs: ProviderPreferences,
  secrets: ProviderSecrets,
): Array<{
  id: "openai" | "azure-openai" | "google" | "flux-bfl" | "volcengine" | "xai";
  displayName: string;
  configured: boolean;
  kinds: ("image" | "video")[];
  defaultModel: string | null;
  modelIds: string[];
}> {
  const idsOf = (entries: ReadonlyArray<string | { id: string }>): string[] =>
    entries.map((m) => (typeof m === "string" ? m : m.id));
  return [
    {
      id: "openai",
      displayName: "OpenAI",
      configured: !!secrets.openai,
      kinds: ["image"],
      defaultModel: prefs.openai.defaultModel ?? null,
      modelIds: idsOf(prefs.openai.models),
    },
    {
      id: "azure-openai",
      displayName: "Azure OpenAI",
      configured: !!secrets["azure-openai"],
      kinds: ["image"],
      defaultModel: prefs["azure-openai"].deployments.image || null,
      modelIds: [prefs["azure-openai"].deployments.image].filter(Boolean) as string[],
    },
    {
      id: "google",
      displayName: "Google (Imagen / Gemini)",
      configured: !!secrets.google,
      kinds: ["image"],
      defaultModel: prefs.google.defaultModel ?? null,
      modelIds: idsOf(prefs.google.models),
    },
    {
      id: "flux-bfl",
      displayName: "Flux (BFL)",
      configured: !!secrets["flux-bfl"],
      kinds: ["image"],
      defaultModel: prefs["flux-bfl"].defaultModel ?? null,
      modelIds: idsOf(prefs["flux-bfl"].models),
    },
    {
      id: "volcengine",
      displayName: "Volcengine",
      configured: !!secrets.volcengine,
      // Volcengine spans both kinds: Seedream image + Seedance video.
      kinds: ["image", "video"],
      defaultModel: prefs.volcengine.defaultImageModel ?? null,
      modelIds: [
        ...idsOf(prefs.volcengine.imageModels),
        ...idsOf(prefs.volcengine.videoModels),
      ],
    },
    {
      id: "xai",
      displayName: "xAI",
      configured: !!secrets.xai,
      kinds: ["image"],
      defaultModel: prefs.xai.defaultModel ?? null,
      modelIds: idsOf(prefs.xai.models),
    },
  ];
}

/** Mask a secret value: keep first 4 + last 4 characters, ellide the middle. */
export function maskValue(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 9) return "*".repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function maskSecrets(s: ProviderSecrets): {
  openai?: { apiKey: string | null };
  "azure-openai"?: { endpoint: string | null; apiKey: string | null; apiVersion: string | null };
  google?: { apiKey: string | null };
  "flux-bfl"?: { apiKey: string | null };
  volcengine?: { apiKey: string | null; region: string | null };
  xai?: { apiKey: string | null };
} {
  const out: Record<string, unknown> = {};
  if (s.openai) out.openai = { apiKey: maskValue(s.openai.apiKey) };
  if (s["azure-openai"]) {
    out["azure-openai"] = {
      // Endpoint and apiVersion aren't really secret — surface them unmasked.
      endpoint: s["azure-openai"].endpoint || null,
      apiKey: maskValue(s["azure-openai"].apiKey),
      apiVersion: s["azure-openai"].apiVersion || null,
    };
  }
  if (s.google) out.google = { apiKey: maskValue(s.google.apiKey) };
  if (s["flux-bfl"]) out["flux-bfl"] = { apiKey: maskValue(s["flux-bfl"].apiKey) };
  if (s.volcengine) {
    out.volcengine = {
      apiKey: maskValue(s.volcengine.apiKey),
      region: s.volcengine.region || null,
    };
  }
  if (s.xai) out.xai = { apiKey: maskValue(s.xai.apiKey) };
  return out as ReturnType<typeof maskSecrets>;
}

function prefsPayloadFromConfig(p: ProviderPreferences): {
  openai: { baseUrl: string | null; models: string[]; defaultModel: string };
  "azure-openai": {
    deployments: { image: string; video: string | null };
    defaultDeployment: "image" | "video";
  };
  google: { models: string[]; defaultModel: string };
  "flux-bfl": { baseUrl: string; models: string[]; defaultModel: string };
  volcengine: {
    baseUrl: string;
    imageModels: string[];
    videoModels: string[];
    defaultImageModel: string;
    defaultVideoModel: string;
  };
  xai: { baseUrl: string; models: string[]; defaultModel: string };
} {
  const ids = (entries: ReadonlyArray<string | { id: string }>): string[] =>
    entries.map((e) => (typeof e === "string" ? e : e.id));
  return {
    openai: {
      baseUrl: p.openai.baseUrl,
      models: ids(p.openai.models),
      defaultModel: p.openai.defaultModel,
    },
    "azure-openai": {
      deployments: p["azure-openai"].deployments,
      defaultDeployment: p["azure-openai"].defaultDeployment,
    },
    google: { models: ids(p.google.models), defaultModel: p.google.defaultModel },
    "flux-bfl": {
      baseUrl: p["flux-bfl"].baseUrl,
      models: ids(p["flux-bfl"].models),
      defaultModel: p["flux-bfl"].defaultModel,
    },
    volcengine: {
      baseUrl: p.volcengine.baseUrl,
      imageModels: ids(p.volcengine.imageModels),
      videoModels: ids(p.volcengine.videoModels),
      defaultImageModel: p.volcengine.defaultImageModel,
      defaultVideoModel: p.volcengine.defaultVideoModel,
    },
    xai: {
      baseUrl: p.xai.baseUrl,
      models: ids(p.xai.models),
      defaultModel: p.xai.defaultModel,
    },
  };
}

function prefsConfigFromPayload(
  payload: ReturnType<typeof prefsPayloadFromConfig>,
): ProviderPreferences {
  // Models come back as bare strings; the catalog merge happens at registry
  // construction so storing strings is exactly what config.json expects.
  return {
    openai: payload.openai,
    "azure-openai": payload["azure-openai"],
    google: payload.google,
    "flux-bfl": payload["flux-bfl"],
    volcengine: payload.volcengine,
    xai: payload.xai,
  };
}


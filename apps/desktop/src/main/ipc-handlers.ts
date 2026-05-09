import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type ConfigStore,
  DEFAULT_CONFIG,
  type ProviderPreferences,
  type ProviderSecrets,
  type SecretsStore,
} from "@imagent/config";
import type {
  Asset,
  AssetFile,
  AssetKind,
  Board,
  GalleryItem,
  ImageRequest,
  Job,
  Logger,
  VideoRequest,
} from "@imagent/core";
import {
  type AssetSlotResolution,
  appendStylePromptSnippets,
  capImageReferences,
  capReferencePaths,
  resolveAssetSlots,
} from "@imagent/core";
import type { ProviderPreferencesPayload } from "@imagent/ipc";
import {
  type ContractHandlers,
  IpcHandlerError,
  type IpcServer,
  notImplemented,
  registerIpcHandlers,
} from "@imagent/ipc";
import {
  AssetRepository,
  BoardRepository,
  type DatabaseType,
  GalleryRepository,
  generateImageThumbnailFromBuffer,
  JobRepository,
  KvRepository,
  type PathResolver,
} from "@imagent/persistence";
import {
  configuredProviderCount as _unused,
  effectiveImageOfferings,
  effectiveProviderDisplayName,
  effectiveVideoOfferings,
  type ImageRegistry,
  type ModelCatalog,
  saveCatalog,
  type VideoRegistry,
} from "@imagent/providers";
import { app, type BrowserWindow, dialog, type IpcMain, shell } from "electron";
import sharp from "sharp";
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
 * Wires every IPC route described in the contract. All routes through M7
 * are real handlers; future-milestone routes use `notImplemented()` stubs.
 * Push events are not forwarded here — the main process attaches
 * `webContents` targets via `IpcServer.addEventTarget`.
 */
export function setupIpc(deps: IpcDeps): IpcServer {
  const { ipcMain, configStore, secretsStore, paths, logger, runtime, getMainWindow } = deps;
  const kv = new KvRepository(deps.db);
  const galleryRepo = new GalleryRepository(deps.db);
  const boardRepo = new BoardRepository(deps.db);
  const jobsRepo = new JobRepository(deps.db);
  const assetRepo = new AssetRepository(deps.db);

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

  type ImageSubmitRequest = ImageRequest & {
    assetSlots?: {
      character?: string[];
      object?: string[];
      background?: string[];
      style?: string[];
    };
  };

  const startImageJob = async (
    request: ImageSubmitRequest,
  ): Promise<{ jobId: string; completed: Promise<GalleryItem> }> => {
    // Resolve asset slots → reference paths + style snippet appendix +
    // attachments to write after the gallery item lands.
    const slots = request.assetSlots ?? {};
    const { assetSlots: _assetSlots, ...requestForRunner } = request;
    const slotInputs = {
      ...(slots.character ? { character: slots.character } : {}),
      ...(slots.object ? { object: slots.object } : {}),
      ...(slots.background ? { background: slots.background } : {}),
      ...(slots.style ? { style: slots.style } : {}),
    };

    // Look up the model's caps to know maxReferences + supportsRef.
    const provider = runtime.imageRegistry.get(request.providerId);
    const resolvedModel = provider?.models?.get?.(request.model);
    const maxRefs = resolvedModel?.capabilities?.maxReferences;
    const supportsRefs = (maxRefs ?? Infinity) > 0;

    let resolution: AssetSlotResolution;
    try {
      resolution = resolveAssetSlots(
        slotInputs,
        (id) => assetRepo.get(id),
        (rel) => (path.isAbsolute(rel) ? rel : path.join(paths.dataDir, rel)),
        { supportsReferences: supportsRefs },
      );
    } catch (err) {
      throw new IpcHandlerError("validation_failed", (err as Error)?.message ?? String(err));
    }

    // Combine freeform refs with slot-derived refs (slot order: char→obj→bg→style).
    const allRefs = [
      ...(request.references ?? []).map((ref) => ({
        path: path.isAbsolute(ref.path) ? ref.path : path.join(paths.dataDir, ref.path),
        role: ref.role ?? ("freeform" as const),
      })),
      ...resolution.references,
    ];
    const { references: cappedRefs, capped } = capImageReferences(allRefs, maxRefs);
    if (capped !== undefined) {
      logger.warn("image job: cap-at-max references", {
        providerId: request.providerId,
        model: request.model,
        capped,
        original: allRefs.length,
      });
    }

    // Build the augmented prompt + final ImageRequest the JobRunner sees.
    const augmentedPrompt = appendStylePromptSnippets(
      request.prompt,
      resolution.stylePromptSnippets,
    );
    const finalReq: ImageRequest = {
      ...requestForRunner,
      prompt: augmentedPrompt,
      references: cappedRefs,
      assetIds: [
        ...(requestForRunner.assetIds ?? []),
        ...resolution.assetIds.filter((id) => !(requestForRunner.assetIds ?? []).includes(id)),
      ],
    };
    const intent = {
      kind: "image" as const,
      request: finalReq,
      ...(finalReq.parentId ? { parentId: finalReq.parentId } : {}),
      ...(finalReq.boardId ? { boardId: finalReq.boardId } : {}),
    };

    let jobId: string;
    try {
      jobId = await runtime.jobRunner.start(intent);
    } catch (err) {
      logger.error("image job: start() threw", {
        providerId: request.providerId,
        model: request.model,
        err,
      });
      throw err;
    }

    const completed = new Promise<GalleryItem>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        runtime.jobRunner.off("job.completed", onCompleted);
        runtime.jobRunner.off("job.failed", onFailed);
      };

      const settleCompleted = (j: Job): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!j.resultItemId) {
          reject(new IpcHandlerError("internal", "image job completed without resultItemId"));
          return;
        }
        const item = galleryRepo.get(j.resultItemId);
        if (!item) {
          reject(
            new IpcHandlerError("internal", `image job: gallery item ${j.resultItemId} missing`),
          );
          return;
        }

        // M6: write gallery_item_assets rows for every contributing slot asset.
        for (const att of resolution.attachments) {
          try {
            galleryRepo.addAssetLink({
              itemId: item.id,
              assetId: att.assetId,
              role: att.role,
            });
          } catch (err) {
            logger.warn("addAssetLink failed", {
              itemId: item.id,
              assetId: att.assetId,
              err: String(err),
            });
          }
        }

        // Notify any other windows via gallery.changed.
        try {
          server.emit("gallery.changed", { id: item.id, op: "created", item });
        } catch (err) {
          logger.warn("gallery.changed emit failed", { err: String(err) });
        }
        resolve(item);
      };

      const settleFailed = (j: Job): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(j.errorMessage ?? `job ended in state '${j.state}'`));
      };

      const onCompleted = (j: Job): void => {
        if (j.id === jobId) settleCompleted(j);
      };
      const onFailed = (j: Job): void => {
        if (j.id === jobId) settleFailed(j);
      };
      runtime.jobRunner.on("job.completed", onCompleted);
      runtime.jobRunner.on("job.failed", onFailed);

      const current = jobsRepo.get(jobId);
      if (current?.state === "succeeded") {
        settleCompleted(current);
      } else if (current?.state === "failed" || current?.state === "cancelled") {
        settleFailed(current);
      }
    });

    return { jobId, completed };
  };

  const createAssetWithReferenceUploads = async ({
    kind,
    name,
    description,
    promptSnippet,
    uploads,
  }: {
    kind: AssetKind;
    name: string;
    description?: string | null;
    promptSnippet?: string | null;
    uploads: { bytes: Uint8Array; originalName: string; mimeType: string }[];
  }): Promise<Asset> => {
    if (uploads.length > 1) {
      throw new IpcHandlerError("validation_failed", "assets accept only one reference upload");
    }
    if (kind === "style") {
      if (uploads.length === 0 && !(promptSnippet && promptSnippet.trim().length > 0)) {
        throw new IpcHandlerError(
          "validation_failed",
          "style assets require one reference upload OR a prompt snippet",
        );
      }
    } else if (uploads.length === 0) {
      throw new IpcHandlerError("validation_failed", `${kind} assets require one reference upload`);
    }

    const assetId = randomUUID();
    const assetDir = paths.assetsDir(assetId);
    await fs.mkdir(assetDir, { recursive: true });

    const now = Date.now();
    const fileRows: AssetFile[] = [];

    for (const [i, u] of uploads.entries()) {
      const buf = Buffer.from(u.bytes);
      const ext = pickExt(u.originalName, u.mimeType);
      const padded = String(i + 1).padStart(3, "0");
      const destRel = path.join("assets", assetId, `ref-${padded}${ext}`).replace(/\\/g, "/");
      const destAbs = path.join(paths.dataDir, destRel);
      await fs.writeFile(destAbs, buf);

      let width: number | null = null;
      let height: number | null = null;
      let mimeType = u.mimeType || guessMimeFromExt(ext);
      try {
        const meta = await sharp(buf).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
        if (meta.format) mimeType = `image/${meta.format}`;
      } catch {
        // Non-image upload — leave dimensions null and trust the supplied mime.
      }

      const sha256 = createHash("sha256").update(buf).digest("hex");
      fileRows.push({
        id: randomUUID(),
        assetId,
        role: "reference",
        relPath: destRel,
        mimeType,
        width,
        height,
        bytes: buf.byteLength,
        sha256,
        position: i,
        createdAt: now,
      });
    }

    const first = uploads[0];
    if (first) {
      const thumbRel = path.join("assets", assetId, "thumb.webp").replace(/\\/g, "/");
      const thumbAbs = path.join(paths.dataDir, thumbRel);
      try {
        const t = await generateImageThumbnailFromBuffer(Buffer.from(first.bytes), thumbAbs, {
          maxSide: 256,
        });
        const thumbBuf = await fs.readFile(thumbAbs);
        fileRows.push({
          id: randomUUID(),
          assetId,
          role: "thumbnail",
          relPath: thumbRel,
          mimeType: "image/webp",
          width: t.width,
          height: t.height,
          bytes: t.bytes,
          sha256: createHash("sha256").update(thumbBuf).digest("hex"),
          position: 0,
          createdAt: now,
        });
      } catch (err) {
        logger.warn("thumbnail generation failed", {
          assetId,
          err: String(err),
        });
      }
    }

    const asset: Asset = {
      id: assetId,
      kind,
      name,
      description: description ?? null,
      promptSnippet: promptSnippet ?? null,
      files: fileRows,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    assetRepo.create(asset);
    for (const f of fileRows) {
      assetRepo.addFile(f);
    }

    try {
      server.emit("assets.changed", { id: assetId, op: "created" });
    } catch (err) {
      logger.warn("assets.changed emit failed", { err: String(err) });
    }
    return assetRepo.get(assetId) ?? asset;
  };

  const handlers: Partial<ContractHandlers> = {
    "providers.list": async () => {
      const config = await configStore.loadConfig();
      const secrets = await secretsStore.loadSecrets();
      return providerSummaryList(
        config.providers,
        secrets,
        runtime.imageRegistry,
        runtime.videoRegistry,
        runtime.catalog,
      );
    },

    "providers.config.get": async () => {
      const config = await configStore.loadConfig();
      return prefsPayloadFromConfig(config.providers);
    },

    "providers.config.set": async (input) => {
      const next = await configStore.saveConfig({ providers: prefsConfigFromPayload(input) });
      // Routing lives here now (Azure deployments, custom OpenAI models),
      // so a config write must rebuild the registries the same way a
      // secrets write does.
      await runtime.refresh();
      return prefsPayloadFromConfig(next.providers);
    },

    "providers.secrets.get": async () => {
      const secrets = await secretsStore.loadSecrets();
      return maskSecrets(secrets);
    },

    "providers.secrets.set": async (input) => {
      // Secrets are apiKey-only after the routing split. Endpoint, baseUrl,
      // and customOpenAI base URLs go through `providers.config.set` instead.
      const patch: Partial<ProviderSecrets> = {};
      if (input.openai?.apiKey) patch.openai = { apiKey: input.openai.apiKey };
      if (input["azure"]?.apiKey) {
        patch["azure"] = { apiKey: input["azure"].apiKey };
      }
      if (input.google?.apiKey) patch.google = { apiKey: input.google.apiKey };
      if (input["flux-bfl"]?.apiKey) patch["flux-bfl"] = { apiKey: input["flux-bfl"].apiKey };
      if (input.bytedance?.apiKey) patch.bytedance = { apiKey: input.bytedance.apiKey };
      if (input.xai?.apiKey) patch.xai = { apiKey: input.xai.apiKey };
      if (input.customOpenAI) {
        const currentSecrets = await secretsStore.loadSecrets();
        const nextCustom = { ...(currentSecrets.customOpenAI ?? {}) };
        for (const [providerId, block] of Object.entries(input.customOpenAI)) {
          if (!block.apiKey) continue;
          nextCustom[providerId] = { apiKey: block.apiKey };
        }
        patch.customOpenAI = nextCustom;
      }
      await secretsStore.saveSecrets(patch);
      // Rebuild registries so subsequent providers.test() picks up the new keys.
      await runtime.refresh();
      return maskSecrets(await secretsStore.loadSecrets());
    },

    "providers.test": async ({ id }) => {
      const provider = runtime.imageRegistry.get(id) ?? runtime.videoRegistry.get(id);
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
      catalogFile: paths.catalogFile(),
      secretsJson: paths.secretsFile(),
      dbFile: paths.dbFile(),
      galleryDir: path.join(paths.dataDir, "gallery"),
      assetsDir: paths.assetsDir(),
      logsDir: paths.logsDir(),
    }),

    "catalog.get": async () => runtime.catalog,
    "catalog.set": async (input) => {
      await saveCatalog(input, { path: runtime.catalogPath });
      await runtime.refresh();
      return runtime.catalog;
    },
    "catalog.path": async () => ({ path: runtime.catalogPath }),

    "system.openExternal": async ({ url }) => {
      // Only allow http/https/mailto — refuse `file://` and shell handlers.
      if (!/^(https?|mailto):/i.test(url)) {
        throw new IpcHandlerError("validation_failed", `Refusing to open URL '${url}'`);
      }
      await shell.openExternal(url);
    },

    "system.openPath": async ({ path: target }) => {
      // Renderers pass dataDir-relative paths (e.g. `images/2025/04/foo.png`
      // or `assets/<id>`). Resolve against `dataDir` first so the validation
      // gate is meaningful; absolute paths fall through unchanged.
      const abs = path.isAbsolute(target)
        ? path.resolve(target)
        : path.resolve(paths.dataDir, target);
      // Only allow paths inside dataDir to avoid arbitrary fs poking from the renderer.
      if (!abs.startsWith(path.resolve(paths.dataDir))) {
        throw new IpcHandlerError("validation_failed", `Refusing to open path outside dataDir`);
      }
      // If the path points to an existing file, reveal it in Finder/Explorer
      // (highlighted in the parent dir). For directories — or paths that
      // don't exist yet (e.g. first reveal of `assets/<id>`) — fall back to
      // creating the dir and opening it.
      let isFile = false;
      try {
        const stat = await fs.stat(abs);
        isFile = stat.isFile();
      } catch {
        // path doesn't exist yet
      }
      if (isFile) {
        shell.showItemInFolder(abs);
        return;
      }
      try {
        await fs.mkdir(abs, { recursive: true });
      } catch {
        // path may already exist; openPath handles that.
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
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      if (res.canceled || res.filePaths.length === 0) return { path: null };
      return { path: res.filePaths[0] ?? null };
    },

    "system.chooseFiles": async (input) => {
      const win = getMainWindow();
      const opts: Electron.OpenDialogOptions = {
        properties: input?.multiple ? ["openFile", "multiSelections"] : ["openFile"],
        filters: input?.filters ?? [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
        ],
      };
      if (input?.defaultPath) opts.defaultPath = input.defaultPath;
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      if (res.canceled) return { paths: [] };
      return { paths: res.filePaths };
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

    // M5 / M6 — Studio + Gallery
    "image.generate": async (request) => {
      const { jobId, completed } = await startImageJob(request);
      try {
        return await completed;
      } catch (err) {
        logger.error("image.generate failed", {
          jobId,
          providerId: request.providerId,
          model: request.model,
          err,
        });
        throw err;
      }
    },

    "image.submit": async (request) => {
      const { jobId, completed } = await startImageJob(request);
      completed.catch((err) => {
        logger.error("image.submit failed", {
          jobId,
          providerId: request.providerId,
          model: request.model,
          err,
        });
      });
      return { jobId };
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
      const links = galleryRepo.listAssetLinks(id);
      const assets = links.map((l) => {
        const a = assetRepo.get(l.assetId);
        return {
          assetId: l.assetId,
          role: l.role,
          name: a?.name ?? null,
          kind: (a?.kind ?? null) as "character" | "object" | "background" | "style" | null,
        };
      });
      return { item, parent, children, siblings, assets };
    },

    "gallery.remix": async ({ itemId }) => {
      const parent = galleryRepo.get(itemId);
      if (!parent) {
        throw new IpcHandlerError("not_found", `gallery item '${itemId}' not found`);
      }
      const params = parseJsonObject(parent.paramsJson);
      if (parent.kind === "video") {
        const req: VideoRequest = {
          prompt: parent.prompt,
          providerId: parent.providerId,
          model: parent.model,
          ...(typeof params.durationSec === "number" ? { durationSec: params.durationSec } : {}),
          ...(typeof params.fps === "number" ? { fps: params.fps } : {}),
          ...(typeof params.resolution === "string" ? { resolution: params.resolution } : {}),
          ...(typeof params.aspectRatio === "string" ? { aspectRatio: params.aspectRatio } : {}),
          references: [],
          assetIds: [],
        };
        return { kind: "video" as const, request: req };
      }
      const req: ImageRequest = {
        prompt: parent.prompt,
        providerId: parent.providerId,
        model: parent.model,
        ...(typeof params.size === "string" ? { size: params.size } : {}),
        ...(typeof params.aspectRatio === "string" ? { aspectRatio: params.aspectRatio } : {}),
        count: typeof params.count === "number" ? params.count : 1,
        references: [],
        assetIds: [],
        parentId: parent.id,
      };
      return { kind: "image" as const, request: req };
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
      if (patch.description !== undefined) merged.description = patch.description ?? null;
      if (patch.coverItemId !== undefined) merged.coverItemId = patch.coverItemId ?? null;
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
      const defaultModel = readDefaultModel(config.providers, providerId, runtime.imageRegistry);
      return { providerId, defaultModel, models };
    },

    "video.models": async ({ providerId }) => {
      const config = await configStore.loadConfig();
      const provider = runtime.videoRegistry.get(providerId);
      const models = provider ? [...provider.models.values()] : [];
      const defaultModel = readDefaultVideoModel(
        config.providers,
        providerId,
        runtime.videoRegistry,
      );
      return { providerId, defaultModel, models };
    },

    "models.list": async () => {
      const config = await configStore.loadConfig();
      const secrets = await secretsStore.loadSecrets();
      return buildUnifiedModelList(runtime.catalog, config.providers, secrets);
    },

    // M6 — Assets (M8: + archive/restore + archivedOnly)
    "assets.list": async (input) => {
      const opts = input ?? {};
      const page = assetRepo.listWithFiles({
        ...(opts.kind !== undefined ? { kind: opts.kind } : {}),
        ...(opts.includeArchived !== undefined ? { includeArchived: opts.includeArchived } : {}),
        ...(opts.archivedOnly !== undefined ? { archivedOnly: opts.archivedOnly } : {}),
        ...(opts.search !== undefined ? { search: opts.search } : {}),
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts.offset !== undefined ? { offset: opts.offset } : {}),
      });
      return page;
    },

    "assets.archive": async ({ id }) => {
      const existing = assetRepo.get(id);
      if (!existing) {
        throw new IpcHandlerError("not_found", `asset '${id}' not found`);
      }
      assetRepo.archive(id);
      try {
        server.emit("assets.changed", { id, op: "updated" });
      } catch (err) {
        logger.warn("assets.changed emit failed", { err: String(err) });
      }
    },

    "assets.restore": async ({ id }) => {
      const existing = assetRepo.get(id);
      if (!existing) {
        throw new IpcHandlerError("not_found", `asset '${id}' not found`);
      }
      assetRepo.restore(id);
      try {
        server.emit("assets.changed", { id, op: "updated" });
      } catch (err) {
        logger.warn("assets.changed emit failed", { err: String(err) });
      }
    },

    "assets.show": async ({ id }) => {
      const asset = assetRepo.get(id);
      if (!asset) {
        throw new IpcHandlerError("not_found", `asset '${id}' not found`);
      }
      return asset;
    },

    "assets.create": async ({ kind, name, description, promptSnippet, fileUploads }) => {
      return createAssetWithReferenceUploads({
        kind,
        name,
        description,
        promptSnippet,
        uploads: fileUploads ?? [],
      });
    },

    "assets.createFromGalleryItem": async ({ itemId, kind, name, description, promptSnippet }) => {
      const item = galleryRepo.get(itemId);
      if (!item) {
        throw new IpcHandlerError("not_found", `gallery item '${itemId}' not found`);
      }
      const sourceRel = item.kind === "video" ? item.thumbPath : item.relPath;
      if (!sourceRel) {
        throw new IpcHandlerError(
          "validation_failed",
          "video gallery items need a thumbnail before they can be saved as assets",
        );
      }

      let bytes: Buffer;
      try {
        bytes = await fs.readFile(absGalleryPath(sourceRel));
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") {
          throw new IpcHandlerError("not_found", `gallery file '${sourceRel}' not found`);
        }
        throw err;
      }

      const ext = path.extname(sourceRel);
      return createAssetWithReferenceUploads({
        kind,
        name,
        description,
        promptSnippet,
        uploads: [
          {
            bytes: new Uint8Array(bytes),
            originalName: path.basename(sourceRel),
            mimeType: guessMimeFromExt(ext),
          },
        ],
      });
    },

    "assets.update": async ({ id, patch }) => {
      const existing = assetRepo.get(id);
      if (!existing) {
        throw new IpcHandlerError("not_found", `asset '${id}' not found`);
      }
      const merged: Partial<Asset> = {};
      if (patch.name !== undefined) merged.name = patch.name;
      if (patch.description !== undefined) merged.description = patch.description ?? null;
      if (patch.promptSnippet !== undefined) merged.promptSnippet = patch.promptSnippet ?? null;
      const next = assetRepo.update(id, merged);
      try {
        server.emit("assets.changed", { id, op: "updated" });
      } catch (err) {
        logger.warn("assets.changed emit failed", { err: String(err) });
      }
      return next;
    },

    /**
     * Permanent delete — removes the `assets` row, cascades `asset_files`,
     * and rm-rf's `~/.imagent/assets/<id>/`. Irreversible. The Assets
     * page surfaces archive-first; this fires from "Delete permanently" only.
     */
    "assets.delete": async ({ id }) => {
      const existing = assetRepo.get(id);
      if (!existing) return; // idempotent
      assetRepo.permanentlyDelete(id);
      const dir = paths.assetsDir(id);
      try {
        const stat = await fs.lstat(dir);
        if (stat.isSymbolicLink()) {
          await fs.unlink(dir);
        } else {
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") {
          logger.warn("assets.delete: rm dir failed", {
            id,
            dir,
            err: String(err),
          });
        }
      }
      try {
        server.emit("assets.changed", { id, op: "deleted" });
      } catch (err) {
        logger.warn("assets.changed emit failed", { err: String(err) });
      }
    },

    "assets.uploadFile": async ({ assetId, role, bytes, originalName, mimeType }) => {
      const asset = assetRepo.get(assetId);
      if (!asset) {
        throw new IpcHandlerError("not_found", `asset '${assetId}' not found`);
      }
      const buf = Buffer.from(bytes);
      const ext = pickExt(originalName, mimeType);
      const existingRefs = asset.files.filter((f) => f.role === "reference").length;
      const padded = String(existingRefs + 1).padStart(3, "0");
      const destRel =
        role === "thumbnail"
          ? path.join("assets", assetId, "thumb.webp").replace(/\\/g, "/")
          : path.join("assets", assetId, `ref-${padded}${ext}`).replace(/\\/g, "/");
      const destAbs = path.join(paths.dataDir, destRel);
      await fs.mkdir(path.dirname(destAbs), { recursive: true });
      await fs.writeFile(destAbs, buf);
      let width: number | null = null;
      let height: number | null = null;
      let mt = mimeType || guessMimeFromExt(ext);
      try {
        const meta = await sharp(buf).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
        if (meta.format) mt = `image/${meta.format}`;
      } catch {
        // non-image
      }
      const sha256 = createHash("sha256").update(buf).digest("hex");
      const fileId = randomUUID();
      const file: AssetFile = {
        id: fileId,
        assetId,
        role,
        relPath: destRel,
        mimeType: mt,
        width,
        height,
        bytes: buf.byteLength,
        sha256,
        position: existingRefs,
        createdAt: Date.now(),
      };
      assetRepo.addFile(file);
      try {
        server.emit("assets.changed", { id: assetId, op: "updated" });
      } catch (err) {
        logger.warn("assets.changed emit failed", { err: String(err) });
      }
      return { fileId, relPath: destRel };
    },

    "assets.removeFile": async ({ fileId }) => {
      // Look up the asset by walking files (we don't have findFileById; the
      // repo exposes listFiles per asset). The cheaper path: iterate the
      // current asset list once and find the matching row.
      const all = assetRepo.list({ includeArchived: true });
      let owner: { assetId: string; relPath: string } | null = null;
      for (const a of all) {
        const hit = a.files.find((f) => f.id === fileId);
        if (hit) {
          owner = { assetId: a.id, relPath: hit.relPath };
          break;
        }
      }
      assetRepo.removeFile(fileId);
      if (owner) {
        const abs = path.join(paths.dataDir, owner.relPath);
        await safeUnlink(abs);
        try {
          server.emit("assets.changed", { id: owner.assetId, op: "updated" });
        } catch (err) {
          logger.warn("assets.changed emit failed", { err: String(err) });
        }
      }
    },

    // M7 — Video Studio. Returns `{ jobId }` immediately; the renderer
    // subscribes to `job.progress`/`job.completed` for the eventual MP4.
    "video.submit": async (request) => {
      const r = request as VideoRequest & {
        assetSlots?: {
          character?: string[];
          object?: string[];
          background?: string[];
          style?: string[];
        };
        parentId?: string;
      };

      const slots = r.assetSlots ?? {};
      const slotInputs = {
        ...(slots.character ? { character: slots.character } : {}),
        ...(slots.object ? { object: slots.object } : {}),
        ...(slots.background ? { background: slots.background } : {}),
        ...(slots.style ? { style: slots.style } : {}),
      };

      const provider = runtime.videoRegistry.get(r.providerId);
      const resolvedModel = provider?.models?.get?.(r.model);
      const supportsRefs = resolvedModel?.capabilities?.supportsRefImages ?? true;
      const maxRefs = resolvedModel?.capabilities?.maxReferences;

      let resolution: AssetSlotResolution;
      try {
        resolution = resolveAssetSlots(
          slotInputs,
          (id) => assetRepo.get(id),
          (rel) => (path.isAbsolute(rel) ? rel : path.join(paths.dataDir, rel)),
          { supportsReferences: supportsRefs },
        );
      } catch (err) {
        throw new IpcHandlerError("validation_failed", (err as Error)?.message ?? String(err));
      }

      const allRefPaths = [
        ...(r.references ?? []).map((ref) => ref.path),
        ...resolution.referencePaths,
      ];
      const { references: cappedRefs, capped } = capReferencePaths(allRefPaths, maxRefs);
      if (capped !== undefined) {
        logger.warn("video.submit: cap-at-max references", {
          providerId: r.providerId,
          model: r.model,
          capped,
          original: allRefPaths.length,
        });
      }

      const augmentedPrompt = appendStylePromptSnippets(r.prompt, resolution.stylePromptSnippets);
      const finalReq: VideoRequest = {
        ...r,
        prompt: augmentedPrompt,
        references: cappedRefs.map((p) => ({ path: p, role: "freeform" as const })),
        assetIds: [
          ...(r.assetIds ?? []),
          ...resolution.assetIds.filter((id) => !(r.assetIds ?? []).includes(id)),
        ],
      };

      const intent = {
        kind: "video" as const,
        request: finalReq,
        ...(r.parentId ? { parentId: r.parentId } : {}),
        ...(finalReq.boardId ? { boardId: finalReq.boardId } : {}),
      };

      let jobId: string;
      try {
        jobId = await runtime.jobRunner.start(intent);
      } catch (err) {
        throw new IpcHandlerError("provider_error", (err as Error)?.message ?? String(err));
      }

      // Best-effort: write gallery_item_assets rows when the job completes.
      // We listen one-shot for the terminal events on this job id.
      if (resolution.attachments.length > 0) {
        const attach = (j: Job): void => {
          if (j.id !== jobId) return;
          if (j.state !== "succeeded") {
            cleanup();
            return;
          }
          if (!j.resultItemId) {
            cleanup();
            return;
          }
          for (const att of resolution.attachments) {
            try {
              galleryRepo.addAssetLink({
                itemId: j.resultItemId,
                assetId: att.assetId,
                role: att.role,
              });
            } catch (err) {
              logger.warn("video.submit addAssetLink failed", {
                itemId: j.resultItemId,
                assetId: att.assetId,
                err: String(err),
              });
            }
          }
          // Also notify other windows.
          try {
            const item = galleryRepo.get(j.resultItemId);
            if (item) {
              server.emit("gallery.changed", { id: item.id, op: "created", item });
            }
          } catch (err) {
            logger.warn("gallery.changed (video) emit failed", { err: String(err) });
          }
          cleanup();
        };
        const onFailed = (j: Job): void => {
          if (j.id === jobId) cleanup();
        };
        const cleanup = (): void => {
          runtime.jobRunner.off("job.completed", attach);
          runtime.jobRunner.off("job.failed", onFailed);
        };
        runtime.jobRunner.on("job.completed", attach);
        runtime.jobRunner.on("job.failed", onFailed);
      } else {
        // Even with no asset slots, the renderer benefits from a
        // gallery.changed broadcast on success.
        const onCompleted = (j: Job): void => {
          if (j.id !== jobId) return;
          cleanup();
          if (j.state === "succeeded" && j.resultItemId) {
            try {
              const item = galleryRepo.get(j.resultItemId);
              if (item) {
                server.emit("gallery.changed", { id: item.id, op: "created", item });
              }
            } catch (err) {
              logger.warn("gallery.changed (video) emit failed", { err: String(err) });
            }
          }
        };
        const onFailed = (j: Job): void => {
          if (j.id === jobId) cleanup();
        };
        const cleanup = (): void => {
          runtime.jobRunner.off("job.completed", onCompleted);
          runtime.jobRunner.off("job.failed", onFailed);
        };
        runtime.jobRunner.on("job.completed", onCompleted);
        runtime.jobRunner.on("job.failed", onFailed);
      }

      return { jobId };
    },
  };

  const server = registerIpcHandlers(ipcMain, handlers);
  logger.info("[ipc] handlers registered");
  return server;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickExt(originalName: string, mimeType: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (ext) return ext;
  // Fall back to mime-derived extension.
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".bin";
  }
}

function guessMimeFromExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  switch (e) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function parseJsonObject(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * For well-known providers, return the registry's first model id (catalog
 * is the source of truth). For Azure, return the user-named image
 * deployment. The result is used by the renderer's ModelSelect to
 * pre-populate a default.
 */
function readDefaultModel(
  _prefs: ProviderPreferences,
  providerId: string,
  imageRegistry: ImageRegistry,
): string | null {
  const provider = imageRegistry.get(providerId);
  if (!provider) return null;
  const first = provider.models.keys().next().value;
  return typeof first === "string" ? first : null;
}

function readDefaultVideoModel(
  _prefs: ProviderPreferences,
  providerId: string,
  videoRegistry: VideoRegistry,
): string | null {
  const provider = videoRegistry.get(providerId);
  if (!provider) return null;
  const first = provider.models.keys().next().value;
  return typeof first === "string" ? first : null;
}

type ProviderId = string;

const WELL_KNOWN_PROVIDER_IDS = [
  "openai",
  "azure",
  "google",
  "flux-bfl",
  "bytedance",
  "xai",
] as const;

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  azure: "Azure",
  google: "Google AI Studio",
  "flux-bfl": "Black Forest Labs",
  bytedance: "ByteDance",
  xai: "xAI",
};

function providerSummaryList(
  prefs: ProviderPreferences,
  secrets: ProviderSecrets,
  imageRegistry: ImageRegistry,
  videoRegistry: VideoRegistry,
  catalog: ModelCatalog,
): Array<{
  id: ProviderId;
  displayName: string;
  configured: boolean;
  kinds: ("image" | "video")[];
  defaultModel: string | null;
  modelIds: string[];
}> {
  // Pull the model id list from the live registry — the catalog is the
  // canonical source of truth. Azure resolves to the user's configured
  // deployment names, also via the registry map.
  const imageIds = (id: string): string[] => {
    const p = imageRegistry.get(id);
    return p ? [...p.models.keys()] : [];
  };
  const videoIds = (id: string): string[] => {
    const p = videoRegistry.get(id);
    return p ? [...p.models.keys()] : [];
  };
  const firstImage = (id: string): string | null => {
    const ids = imageIds(id);
    return ids[0] ?? null;
  };
  const wellKnown: Array<{
    id: ProviderId;
    displayName: string;
    configured: boolean;
    kinds: ("image" | "video")[];
    defaultModel: string | null;
    modelIds: string[];
  }> = [
    {
      id: "openai",
      displayName: "OpenAI",
      configured: !!secrets.openai,
      kinds: ["image"],
      defaultModel: firstImage("openai"),
      modelIds: imageIds("openai"),
    },
    {
      id: "azure",
      displayName: "Azure",
      configured: !!(secrets["azure"]?.apiKey && prefs["azure"]?.endpoint),
      kinds: ["image"],
      defaultModel: firstImage("azure"),
      modelIds: imageIds("azure"),
    },
    {
      id: "google",
      displayName: "Google AI Studio",
      configured: !!secrets.google,
      // Google AI Studio spans both kinds: Imagen / Nano Banana image + Veo video.
      kinds: ["image", "video"],
      defaultModel: firstImage("google"),
      modelIds: [...imageIds("google"), ...videoIds("google")],
    },
    {
      id: "flux-bfl",
      displayName: "Black Forest Labs",
      configured: !!secrets["flux-bfl"],
      kinds: ["image"],
      defaultModel: firstImage("flux-bfl"),
      modelIds: imageIds("flux-bfl"),
    },
    {
      id: "bytedance",
      displayName: "ByteDance",
      configured: !!(secrets.bytedance?.apiKey && prefs.bytedance?.endpoint),
      // ByteDance spans both kinds: Seedream image + Seedance video.
      kinds: ["image", "video"],
      defaultModel: firstImage("bytedance"),
      modelIds: [...imageIds("bytedance"), ...videoIds("bytedance")],
    },
    {
      id: "xai",
      displayName: "xAI",
      configured: !!secrets.xai,
      // xAI spans both kinds: Grok Imagine image + grok-imagine-video video.
      kinds: ["image", "video"],
      defaultModel: firstImage("xai"),
      modelIds: [...imageIds("xai"), ...videoIds("xai")],
    },
  ];
  // Custom OpenAI-compatible providers: routing lives in config; catalog may
  // also hold a stale entry pre-migration. Union of both keeps the renderer
  // working during the transition window.
  const customIds = new Set<string>([
    ...Object.keys(prefs.customOpenAI ?? {}),
    ...Object.keys(catalog.providers),
    ...Object.keys(secrets.customOpenAI ?? {}),
  ]);
  for (const id of WELL_KNOWN_PROVIDER_IDS) customIds.delete(id);
  const custom = [...customIds].sort().map((id) => ({
    id,
    displayName: effectiveProviderDisplayName(catalog, prefs, id),
    configured: !!prefs.customOpenAI?.[id]?.baseUrl,
    kinds: ["image"] as ("image" | "video")[],
    defaultModel: firstImage(id),
    modelIds: imageIds(id),
  }));
  return [...wellKnown, ...custom];
}

/**
 * Group every model by `id` across providers and produce the unified shape
 * the Models page consumes — one row per logical model with a list of
 * provider sources and per-provider `configured` flags. Per-user routing
 * (Azure deployments, custom OpenAI models) from `prefs` is merged on top of
 * the canonical catalog before grouping.
 */
function buildUnifiedModelList(
  catalog: ModelCatalog,
  prefs: ProviderPreferences,
  secrets: ProviderSecrets,
): {
  image: Array<{
    id: string;
    displayName: string | null;
    providers: Array<{
      providerId: ProviderId;
      modelId: string;
      displayName: string;
      configured: boolean;
    }>;
  }>;
  video: Array<{
    id: string;
    displayName: string | null;
    providers: Array<{
      providerId: ProviderId;
      modelId: string;
      displayName: string;
      configured: boolean;
    }>;
  }>;
} {
  const isProviderConfigured = (id: ProviderId): boolean => {
    if (id === "azure") {
      return !!(secrets["azure"]?.apiKey && prefs["azure"]?.endpoint);
    }
    if (id === "bytedance") {
      return !!(secrets.bytedance?.apiKey && prefs.bytedance?.endpoint);
    }
    const custom = prefs.customOpenAI?.[id];
    if (custom) return !!custom.baseUrl;
    const b = (secrets as Record<string, { apiKey?: string } | undefined>)[id];
    return !!b?.apiKey;
  };
  const groupKind = <T extends { id: string; displayName?: string }>(
    kind: "image" | "video",
    canonicalModels: Record<string, T>,
  ): Array<{
    id: string;
    displayName: string | null;
    providers: Array<{
      providerId: ProviderId;
      modelId: string;
      displayName: string;
      configured: boolean;
    }>;
  }> => {
    const grouped = new Map<
      string,
      {
        id: string;
        displayName: string | null;
        providers: Array<{
          providerId: ProviderId;
          modelId: string;
          displayName: string;
          configured: boolean;
        }>;
      }
    >();
    for (const model of Object.values(canonicalModels)) {
      grouped.set(model.id, {
        id: model.id,
        displayName: model.displayName ?? null,
        providers: [],
      });
    }
    // Stable provider iteration: built-ins first in canonical order, then
    // any additional ids that appear in either the catalog or the config
    // routing overlay (sorted for determinism).
    const customIds = new Set<string>([
      ...Object.keys(catalog.providers),
      ...Object.keys(prefs.customOpenAI ?? {}),
    ]);
    for (const id of WELL_KNOWN_PROVIDER_IDS) customIds.delete(id);
    const providerOrder: ProviderId[] = [...WELL_KNOWN_PROVIDER_IDS, ...[...customIds].sort()];
    for (const providerId of providerOrder) {
      const offerings =
        kind === "image"
          ? effectiveImageOfferings(catalog, prefs, providerId)
          : effectiveVideoOfferings(catalog, prefs, providerId);
      for (const offering of offerings) {
        const model = canonicalModels[offering.modelId];
        if (!model) continue;
        const existing = grouped.get(offering.modelId);
        const providerEntry = {
          providerId,
          modelId: offering.id,
          displayName:
            effectiveProviderDisplayName(catalog, prefs, providerId) ??
            PROVIDER_DISPLAY_NAMES[providerId] ??
            providerId,
          configured: isProviderConfigured(providerId),
        };
        if (existing) {
          existing.providers.push(providerEntry);
          // Prefer the first non-null displayName encountered.
          if (!existing.displayName && model.displayName) {
            existing.displayName = model.displayName;
          }
        } else {
          grouped.set(offering.modelId, {
            id: offering.modelId,
            displayName: model.displayName ?? null,
            providers: [providerEntry],
          });
        }
      }
    }
    return [...grouped.values()];
  };
  return {
    image: groupKind("image", catalog.models.image),
    video: groupKind("video", catalog.models.video),
  };
}

/** Mask a secret value: keep first 4 + last 4 characters, ellide the middle. */
export function maskValue(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 9) return "*".repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function maskSecrets(s: ProviderSecrets): {
  openai?: { apiKey: string | null };
  azure?: { apiKey: string | null };
  google?: { apiKey: string | null };
  "flux-bfl"?: { apiKey: string | null };
  bytedance?: { apiKey: string | null };
  xai?: { apiKey: string | null };
  customOpenAI?: Record<string, { apiKey: string | null }>;
} {
  const out: Record<string, unknown> = {};
  if (s.openai) out.openai = { apiKey: maskValue(s.openai.apiKey) };
  if (s["azure"]) out["azure"] = { apiKey: maskValue(s["azure"].apiKey) };
  if (s.google) out.google = { apiKey: maskValue(s.google.apiKey) };
  if (s["flux-bfl"]) out["flux-bfl"] = { apiKey: maskValue(s["flux-bfl"].apiKey) };
  if (s.bytedance) out.bytedance = { apiKey: maskValue(s.bytedance.apiKey) };
  if (s.xai) out.xai = { apiKey: maskValue(s.xai.apiKey) };
  if (s.customOpenAI) {
    out.customOpenAI = Object.fromEntries(
      Object.entries(s.customOpenAI).map(([id, block]) => [
        id,
        { apiKey: maskValue(block.apiKey) },
      ]),
    );
  }
  return out as ReturnType<typeof maskSecrets>;
}

/**
 * Translate the on-disk provider prefs into the renderer-facing payload.
 * Per-user provider routing (Azure deployments, custom OpenAI models) is
 * passed through verbatim; the renderer merges it with the canonical catalog.
 */
function prefsPayloadFromConfig(p: ProviderPreferences): ProviderPreferencesPayload {
  return {
    openai: p.openai ?? {},
    azure: p["azure"] ?? {},
    google: p.google ?? {},
    "flux-bfl": p["flux-bfl"] ?? {},
    bytedance: p.bytedance ?? {},
    xai: p.xai ?? {},
    customOpenAI: p.customOpenAI ?? {},
  };
}

function prefsConfigFromPayload(payload: ProviderPreferencesPayload): ProviderPreferences {
  return {
    openai: payload.openai,
    azure: payload["azure"],
    google: payload.google,
    "flux-bfl": payload["flux-bfl"],
    bytedance: payload.bytedance,
    xai: payload.xai,
    customOpenAI: payload.customOpenAI,
  };
}

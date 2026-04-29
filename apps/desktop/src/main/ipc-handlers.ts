import { app, dialog, shell, type BrowserWindow, type IpcMain } from "electron";
import { createHash, randomUUID } from "node:crypto";
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
  AssetRepository,
  BoardRepository,
  GalleryRepository,
  JobRepository,
  KvRepository,
  generateImageThumbnailFromBuffer,
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
  Asset,
  AssetFile,
  AssetKind,
  Board,
  GalleryItem,
  ImageRequest,
  Job,
  Logger,
  VideoRequest,
} from "@imagine-studio/core";
import {
  appendStylePromptSnippets,
  capReferencePaths,
  resolveAssetSlots,
} from "@imagine-studio/core";
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

    // M5 / M6 — Studio + Gallery
    "image.generate": async (request) => {
      const r = request as ImageRequest & {
        assetSlots?: {
          character?: string[];
          object?: string[];
          background?: string[];
          style?: string[];
        };
      };

      // Resolve asset slots → reference paths + style snippet appendix +
      // attachments to write after the gallery item lands.
      const slots = r.assetSlots ?? {};
      const slotInputs = {
        ...(slots.character ? { character: slots.character } : {}),
        ...(slots.object ? { object: slots.object } : {}),
        ...(slots.background ? { background: slots.background } : {}),
        ...(slots.style ? { style: slots.style } : {}),
      };

      // Look up the model's caps to know maxReferences + supportsRef.
      const provider = runtime.imageRegistry.get(r.providerId);
      const resolvedModel = provider?.models?.get?.(r.model);
      const maxRefs = resolvedModel?.capabilities?.maxReferences;
      const supportsRefs = (maxRefs ?? Infinity) > 0;

      let resolution;
      try {
        resolution = resolveAssetSlots(
          slotInputs,
          (id) => assetRepo.get(id),
          (rel) =>
            path.isAbsolute(rel) ? rel : path.join(paths.dataDir, rel),
          { supportsReferences: supportsRefs },
        );
      } catch (err) {
        throw new IpcHandlerError(
          "validation_failed",
          (err as Error)?.message ?? String(err),
        );
      }

      // Combine freeform refs with slot-derived refs (slot order: char→obj→bg→style).
      const allRefPaths = [
        ...(r.references ?? []).map((ref) => ref.path),
        ...resolution.referencePaths,
      ];
      const { references: cappedRefs, capped } = capReferencePaths(
        allRefPaths,
        maxRefs,
      );
      if (capped !== undefined) {
        logger.warn("image.generate: cap-at-max references", {
          providerId: r.providerId,
          model: r.model,
          capped,
          original: allRefPaths.length,
        });
      }

      // Build the augmented prompt + final ImageRequest the JobRunner sees.
      const augmentedPrompt = appendStylePromptSnippets(
        r.prompt,
        resolution.stylePromptSnippets,
      );
      const finalReq: ImageRequest = {
        ...r,
        prompt: augmentedPrompt,
        references: cappedRefs.map((p) => ({ path: p, role: "freeform" as const })),
        assetIds: [
          ...(r.assetIds ?? []),
          ...resolution.assetIds.filter((id) => !(r.assetIds ?? []).includes(id)),
        ],
      };
      // Strip the IPC-only assetSlots field before passing to the runner.
      // (ImageRequestSchema doesn't carry it.)
      const intent = {
        kind: "image" as const,
        request: finalReq,
        ...(finalReq.parentId ? { parentId: finalReq.parentId } : {}),
        ...(finalReq.boardId ? { boardId: finalReq.boardId } : {}),
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
      const links = galleryRepo.listAssetLinks(id);
      const assets = links.map((l) => {
        const a = assetRepo.get(l.assetId);
        return {
          assetId: l.assetId,
          role: l.role,
          name: a?.name ?? null,
          kind: (a?.kind ?? null) as
            | "character"
            | "object"
            | "background"
            | "style"
            | null,
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
          ...(parent.negativePrompt ? { negativePrompt: parent.negativePrompt } : {}),
          providerId: parent.providerId,
          model: parent.model,
          ...(typeof params.durationSec === "number"
            ? { durationSec: params.durationSec }
            : {}),
          ...(typeof params.fps === "number" ? { fps: params.fps } : {}),
          ...(typeof params.resolution === "string"
            ? { resolution: params.resolution }
            : {}),
          ...(typeof params.aspectRatio === "string"
            ? { aspectRatio: params.aspectRatio }
            : {}),
          references: [],
          assetIds: [],
        };
        return { kind: "video" as const, request: req };
      }
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

    "video.models": async ({ providerId }) => {
      const config = await configStore.loadConfig();
      const provider = runtime.videoRegistry.get(providerId);
      const models = provider ? [...provider.models.values()] : [];
      const defaultModel = readDefaultVideoModel(config.providers, providerId);
      return { providerId, defaultModel, models };
    },

    // M6 — Assets (M8: + archive/restore + archivedOnly)
    "assets.list": async (input) => {
      const opts = input ?? {};
      const page = assetRepo.listWithFiles({
        ...(opts.kind !== undefined ? { kind: opts.kind } : {}),
        ...(opts.includeArchived !== undefined
          ? { includeArchived: opts.includeArchived }
          : {}),
        ...(opts.archivedOnly !== undefined
          ? { archivedOnly: opts.archivedOnly }
          : {}),
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
      // Server-side validation: non-style requires >=1 upload; style requires
      // >=1 upload OR a prompt snippet.
      const uploads = fileUploads ?? [];
      if (kind === "style") {
        if (uploads.length === 0 && !(promptSnippet && promptSnippet.trim().length > 0)) {
          throw new IpcHandlerError(
            "validation_failed",
            "style assets require at least one reference upload OR a prompt snippet",
          );
        }
      } else {
        if (uploads.length === 0) {
          throw new IpcHandlerError(
            "validation_failed",
            `${kind} assets require at least one reference upload`,
          );
        }
      }

      const assetId = randomUUID();
      const assetDir = paths.assetsDir(assetId);
      await fs.mkdir(assetDir, { recursive: true });

      const now = Date.now();
      const fileRows: AssetFile[] = [];

      for (let i = 0; i < uploads.length; i += 1) {
        const u = uploads[i]!;
        const buf = Buffer.from(u.bytes);
        const ext = pickExt(u.originalName, u.mimeType);
        const padded = String(i + 1).padStart(3, "0");
        const destRel = path
          .join("assets", assetId, `ref-${padded}${ext}`)
          .replace(/\\/g, "/");
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

      // Generate a thumbnail from the first upload (best-effort).
      if (uploads.length > 0) {
        const first = uploads[0]!;
        const thumbRel = path
          .join("assets", assetId, "thumb.webp")
          .replace(/\\/g, "/");
        const thumbAbs = path.join(paths.dataDir, thumbRel);
        try {
          const t = await generateImageThumbnailFromBuffer(
            Buffer.from(first.bytes),
            thumbAbs,
            { maxSide: 256 },
          );
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
    },

    "assets.update": async ({ id, patch }) => {
      const existing = assetRepo.get(id);
      if (!existing) {
        throw new IpcHandlerError("not_found", `asset '${id}' not found`);
      }
      const merged: Partial<Asset> = {};
      if (patch.name !== undefined) merged.name = patch.name;
      if (patch.description !== undefined) merged.description = patch.description ?? null;
      if (patch.promptSnippet !== undefined)
        merged.promptSnippet = patch.promptSnippet ?? null;
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
     * and rm-rf's `~/.imagine-studio/assets/<id>/`. Irreversible. The Assets
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
          : path
              .join("assets", assetId, `ref-${padded}${ext}`)
              .replace(/\\/g, "/");
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
      // VideoModelCaps doesn't carry a per-model `maxReferences`; we leave
      // capping to the provider impl + UI-side hints.
      const maxRefs: number | undefined = undefined;

      let resolution;
      try {
        resolution = resolveAssetSlots(
          slotInputs,
          (id) => assetRepo.get(id),
          (rel) =>
            path.isAbsolute(rel) ? rel : path.join(paths.dataDir, rel),
          { supportsReferences: supportsRefs },
        );
      } catch (err) {
        throw new IpcHandlerError(
          "validation_failed",
          (err as Error)?.message ?? String(err),
        );
      }

      const allRefPaths = [
        ...(r.references ?? []).map((ref) => ref.path),
        ...resolution.referencePaths,
      ];
      const { references: cappedRefs, capped } = capReferencePaths(
        allRefPaths,
        maxRefs,
      );
      if (capped !== undefined) {
        logger.warn("video.submit: cap-at-max references", {
          providerId: r.providerId,
          model: r.model,
          capped,
          original: allRefPaths.length,
        });
      }

      const augmentedPrompt = appendStylePromptSnippets(
        r.prompt,
        resolution.stylePromptSnippets,
      );
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
        throw new IpcHandlerError(
          "provider_error",
          (err as Error)?.message ?? String(err),
        );
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

function readDefaultVideoModel(
  prefs: ProviderPreferences,
  providerId: string,
): string | null {
  switch (providerId) {
    case "volcengine":
      return prefs.volcengine.defaultVideoModel ?? null;
    case "azure-openai":
      return prefs["azure-openai"].deployments.video || null;
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


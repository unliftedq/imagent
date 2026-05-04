import { EventEmitter } from "node:events";
import type { GalleryItem } from "../domain/gallery.js";
import { ProviderAbortError, ProviderError, isAbortError } from "../domain/errors.js";
import type { Job, JobId, JobState } from "../domain/job.js";
import type { GenerationIntent, ImageRequest, VideoRequest } from "../domain/request.js";
import type { VideoJobHandle, VideoJobState } from "../domain/result.js";
import type { ImageProvider } from "../ports/image-provider.js";
import type { VideoProvider } from "../ports/video-provider.js";
import { type Logger, NoopLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Repository / files contracts.
//
// JobRunner lives in `core`, which must not import @imagine/persistence
// (better-sqlite3 is a runtime concern). The runner depends on duck-typed
// interfaces; the persistence package's `JobRepository` and
// `GalleryRepository` already satisfy these once the M2 implementations land.
// ---------------------------------------------------------------------------

export interface JobRepositoryPort {
  create(job: Job): Job;
  get(id: string): Job | null;
  updateState(
    id: string,
    patch: Partial<
      Pick<Job, "state" | "progress" | "errorMessage" | "providerJobId" | "resultItemId" | "finishedAt">
    >,
  ): Job;
  listByStates(states: readonly JobState[]): Job[];
}

export interface GalleryRepositoryPort {
  create(item: GalleryItem): GalleryItem;
}

export interface BoardRepositoryPort {
  /** Idempotent. Appends `itemId` to `boardId` at position max+1. */
  appendItem(boardId: string, itemId: string): unknown;
  hasItem(boardId: string, itemId: string): boolean;
}

export interface FilesServicePort {
  galleryItemFile(itemId: string, ext: string, date?: Date): string;
  /** The directory the above file resides in — runner mkdirs it before write. */
  galleryDir(date?: Date): string;
  /** Used by tests / consumers to know where data lives. */
  readonly dataDir: string;
}

/**
 * Best-effort thumbnail generation service. JobRunner calls this after a
 * video MP4 is written to disk; failures log a warning and don't fail the
 * job (the MP4 is the deliverable). Implementations live in `persistence`.
 */
export interface ThumbnailServicePort {
  /**
   * Produce a thumbnail next to `srcPath`. Returns the absolute path to the
   * generated file, or `null` when generation was skipped (e.g. unsupported).
   */
  generateForVideo(srcPath: string, destPath: string): Promise<{ ok: true } | { ok: false; reason: string }>;
}

export type ImageRegistry = ReadonlyMap<string, ImageProvider>;
export type VideoRegistry = ReadonlyMap<string, VideoProvider>;

export interface JobRunnerDeps {
  jobs: JobRepositoryPort;
  gallery: GalleryRepositoryPort;
  /** Optional; only used when an intent supplies `boardId`. */
  boards?: BoardRepositoryPort;
  files: FilesServicePort;
  imageRegistry: ImageRegistry;
  videoRegistry: VideoRegistry;
  /** File writer — defaults to `node:fs/promises` writeFile + mkdir. Tests can inject. */
  writeFile?: (filePath: string, bytes: Uint8Array) => Promise<void>;
  ensureDir?: (dir: string) => Promise<void>;
  /** Inject a logger; defaults to no-op. */
  logger?: Logger;
  /** Generates ids; tests inject deterministic ones. */
  idFactory?: () => string;
  /** Now in epoch ms — injectable for tests. */
  now?: () => number;
  /** scheduling abstraction; tests inject a fake. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /**
   * Optional thumbnail generator. When set, the video success path calls
   * `generateForVideo()` after the MP4 is written; the result path is
   * persisted to `gallery_items.thumb_path`. Failures are best-effort
   * (logged, not surfaced as job failures).
   */
  thumbnailService?: ThumbnailServicePort;
}

export type JobEventName = "job.progress" | "job.completed" | "job.failed";

export interface JobProgressEvent {
  id: JobId;
  progress: number;
  state: JobState;
}

// ---------------------------------------------------------------------------
// JobRunner
// ---------------------------------------------------------------------------

const VIDEO_POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 15_000] as const;

interface RunningEntry {
  abort: AbortController;
  timer?: unknown;
  pollIndex: number;
}

interface IntentOverrides {
  parentId?: string;
  boardId?: string;
}

export class JobRunner extends EventEmitter {
  private readonly deps: Required<
    Omit<
      JobRunnerDeps,
      | "logger"
      | "idFactory"
      | "now"
      | "setTimer"
      | "clearTimer"
      | "writeFile"
      | "ensureDir"
      | "boards"
      | "thumbnailService"
    >
  > & {
    boards: BoardRepositoryPort | null;
    logger: Logger;
    idFactory: () => string;
    now: () => number;
    setTimer: (cb: () => void, ms: number) => unknown;
    clearTimer: (handle: unknown) => void;
    writeFile: (filePath: string, bytes: Uint8Array) => Promise<void>;
    ensureDir: (dir: string) => Promise<void>;
    thumbnailService: ThumbnailServicePort | null;
  };
  private readonly running = new Map<JobId, RunningEntry>();
  /** parentId/boardId overrides stashed at start() time, applied at item create. */
  private readonly intentOverrides = new Map<JobId, IntentOverrides>();

  constructor(deps: JobRunnerDeps) {
    super();
    this.deps = {
      jobs: deps.jobs,
      gallery: deps.gallery,
      boards: deps.boards ?? null,
      files: deps.files,
      imageRegistry: deps.imageRegistry,
      videoRegistry: deps.videoRegistry,
      logger: deps.logger ?? NoopLogger,
      idFactory: deps.idFactory ?? defaultIdFactory,
      now: deps.now ?? Date.now,
      setTimer: deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms)),
      clearTimer: deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
      writeFile: deps.writeFile ?? defaultWriteFile,
      ensureDir: deps.ensureDir ?? defaultEnsureDir,
      thumbnailService: deps.thumbnailService ?? null,
    };
  }

  async start(intent: GenerationIntent): Promise<JobId> {
    const overrides: IntentOverrides = {};
    if (intent.parentId) overrides.parentId = intent.parentId;
    if (intent.boardId) overrides.boardId = intent.boardId;
    if (intent.kind === "image") {
      return this.startImage(intent.request, overrides);
    }
    return this.startVideo(intent.request, overrides);
  }

  async cancel(id: JobId): Promise<void> {
    const entry = this.running.get(id);
    if (!entry) {
      // Already terminal — no-op so callers can fire-and-forget.
      return;
    }
    entry.abort.abort();
    if (entry.timer !== undefined) {
      this.deps.clearTimer(entry.timer);
    }
    this.running.delete(id);
    this.intentOverrides.delete(id);

    // Best-effort: if a provider supports cancel, hit it for video jobs.
    const job = this.deps.jobs.get(id);
    if (job?.kind === "video" && job.providerJobId) {
      const provider = this.deps.videoRegistry.get(job.providerId);
      if (provider?.cancel) {
        try {
          await provider.cancel({ providerId: job.providerId, providerJobId: job.providerJobId });
        } catch (err) {
          this.deps.logger.warn("provider.cancel failed", { id, err: String(err) });
        }
      }
    }

    const now = this.deps.now();
    const updated = this.deps.jobs.updateState(id, {
      state: "cancelled",
      finishedAt: now,
    });
    this.emit("job.failed", updated);
  }

  /**
   * Resume jobs left running when the process last exited. Image jobs cannot
   * resume — there's no provider-side handle to reconnect to — so they're
   * marked failed. Video jobs have a `provider_job_id`; we re-schedule a poll.
   *
   * Wired from the desktop main bootstrap and from the CLI on startup in M7.
   */
  async resumeRunningJobs(): Promise<void> {
    const stale = this.deps.jobs.listByStates(["queued", "running"]);
    for (const job of stale) {
      if (job.kind === "image") {
        const updated = this.deps.jobs.updateState(job.id, {
          state: "failed",
          errorMessage: "process restarted before completion",
          finishedAt: this.deps.now(),
        });
        this.emit("job.failed", updated);
        continue;
      }
      // Video — reschedule polling using the persisted provider_job_id.
      if (!job.providerJobId) {
        const updated = this.deps.jobs.updateState(job.id, {
          state: "failed",
          errorMessage: "no provider_job_id to resume",
          finishedAt: this.deps.now(),
        });
        this.emit("job.failed", updated);
        continue;
      }
      const provider = this.deps.videoRegistry.get(job.providerId);
      if (!provider) {
        const updated = this.deps.jobs.updateState(job.id, {
          state: "failed",
          errorMessage: `provider '${job.providerId}' is no longer configured`,
          finishedAt: this.deps.now(),
        });
        this.emit("job.failed", updated);
        continue;
      }
      const handle: VideoJobHandle = {
        providerId: job.providerId,
        providerJobId: job.providerJobId,
      };
      const abort = new AbortController();
      const entry: RunningEntry = { abort, pollIndex: 0 };
      this.running.set(job.id, entry);
      this.scheduleVideoPoll(job.id, provider, handle, entry, JSON.parse(job.requestJson) as VideoRequest);
    }
  }

  // ----- image path -----------------------------------------------------

  private async startImage(req: ImageRequest, overrides: IntentOverrides = {}): Promise<JobId> {
    const provider = this.deps.imageRegistry.get(req.providerId);
    if (!provider) {
      throw new ProviderError(`image provider '${req.providerId}' is not configured`, {
        vendorId: req.providerId,
      });
    }

    const id = this.deps.idFactory();
    const now = this.deps.now();
    const job = this.deps.jobs.create({
      id,
      kind: "image",
      state: "running",
      providerId: req.providerId,
      providerJobId: null,
      requestJson: JSON.stringify(req),
      progress: 0,
      errorMessage: null,
      resultItemId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });

    const abort = new AbortController();
    this.running.set(id, { abort, pollIndex: 0 });
    if (overrides.parentId || overrides.boardId) {
      this.intentOverrides.set(id, overrides);
    }

    // Surface the running id immediately so subscribers (Studio's cancel
    // affordance) can target jobs.cancel before the provider responds.
    this.emit("job.progress", { id, progress: 0, state: job.state });

    // Run async; surface failures via events, not the start() promise.
    this.imageGenerationLoop(job, req, provider, abort.signal).catch((err) => {
      this.deps.logger.error("image job loop crashed", { id, err: String(err) });
    });

    return id;
  }

  private async imageGenerationLoop(
    job: Job,
    req: ImageRequest,
    provider: ImageProvider,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const result = await provider.generate(req, signal);
      // Take the first output (count > 1 is documented but M2 persists one
      // item per generate call; multi-result fan-out lands in M5).
      const out = result.outputs[0];
      if (!out) {
        throw new ProviderError("provider returned 0 outputs", { vendorId: req.providerId });
      }

      const ext = mimeToExt(out.mimeType);
      const itemId = this.deps.idFactory();
      const now = this.deps.now();
      const date = new Date(now);
      const dir = this.deps.files.galleryDir(date);
      await this.deps.ensureDir(dir);
      const absPath = this.deps.files.galleryItemFile(itemId, ext, date);
      await this.deps.writeFile(absPath, out.bytes);

      const relPath = relativeToData(absPath, this.deps.files.dataDir);

      const overrides = this.intentOverrides.get(job.id) ?? {};
      const item = this.deps.gallery.create({
        id: itemId,
        kind: "image",
        parentId: overrides.parentId ?? null,
        prompt: req.prompt,
        negativePrompt: req.negativePrompt ?? null,
        providerId: req.providerId,
        model: req.model,
        paramsJson: JSON.stringify({
          size: req.size,
          aspectRatio: req.aspectRatio,
          count: req.count,
          seed: req.seed,
          raw: { ...(req.raw ?? {}), ...(out.raw ?? {}) },
        }),
        relPath,
        thumbPath: null,
        durationMs: null,
        width: out.width ?? null,
        height: out.height ?? null,
        bytes: out.bytes.byteLength,
        jobId: job.id,
        favorited: false,
        createdAt: now,
      });

      // Best-effort board attach; persists `board_items` row idempotently.
      if (overrides.boardId && this.deps.boards) {
        try {
          if (!this.deps.boards.hasItem(overrides.boardId, item.id)) {
            this.deps.boards.appendItem(overrides.boardId, item.id);
          }
        } catch (err) {
          this.deps.logger.warn("appendItem failed", {
            id: job.id,
            boardId: overrides.boardId,
            err: String(err),
          });
        }
      }
      this.intentOverrides.delete(job.id);

      const updated = this.deps.jobs.updateState(job.id, {
        state: "succeeded",
        progress: 1,
        resultItemId: item.id,
        finishedAt: now,
      });
      this.running.delete(job.id);
      this.emit("job.completed", updated);
    } catch (err) {
      this.running.delete(job.id);
      this.intentOverrides.delete(job.id);
      const aborted = isAbortError(err) || err instanceof ProviderAbortError;
      if (!aborted) {
        this.deps.logger.error("image generation failed", {
          jobId: job.id,
          providerId: job.providerId,
          model: req.model,
          err,
        });
      }
      const updated = this.deps.jobs.updateState(job.id, {
        state: aborted ? "cancelled" : "failed",
        errorMessage: aborted ? "cancelled" : (err as Error)?.message ?? String(err),
        finishedAt: this.deps.now(),
      });
      this.emit("job.failed", updated);
    }
  }

  // ----- video path -----------------------------------------------------

  private async startVideo(req: VideoRequest, overrides: IntentOverrides = {}): Promise<JobId> {
    const provider = this.deps.videoRegistry.get(req.providerId);
    if (!provider) {
      throw new ProviderError(`video provider '${req.providerId}' is not configured`, {
        vendorId: req.providerId,
      });
    }

    const id = this.deps.idFactory();
    const now = this.deps.now();
    this.deps.jobs.create({
      id,
      kind: "video",
      state: "queued",
      providerId: req.providerId,
      providerJobId: null,
      requestJson: JSON.stringify(req),
      progress: 0,
      errorMessage: null,
      resultItemId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });

    const abort = new AbortController();
    const entry: RunningEntry = { abort, pollIndex: 0 };
    this.running.set(id, entry);
    if (overrides.parentId || overrides.boardId) {
      this.intentOverrides.set(id, overrides);
    }

    // Submit asynchronously; record providerJobId as soon as we have it.
    void (async () => {
      try {
        const handle = await provider.submit(req);
        if (abort.signal.aborted) return; // cancelled before submit returned
        const updated = this.deps.jobs.updateState(id, {
          state: "running",
          providerJobId: handle.providerJobId,
        });
        this.emit("job.progress", { id, progress: 0, state: updated.state });
        this.scheduleVideoPoll(id, provider, handle, entry, req);
      } catch (err) {
        this.running.delete(id);
        const aborted = isAbortError(err);
        if (!aborted) {
          this.deps.logger.error("video submit failed", {
            jobId: id,
            providerId: req.providerId,
            model: req.model,
            err,
          });
        }
        const updated = this.deps.jobs.updateState(id, {
          state: aborted ? "cancelled" : "failed",
          errorMessage: aborted ? "cancelled" : (err as Error)?.message ?? String(err),
          finishedAt: this.deps.now(),
        });
        this.emit("job.failed", updated);
      }
    })();

    return id;
  }

  private scheduleVideoPoll(
    id: JobId,
    provider: VideoProvider,
    handle: VideoJobHandle,
    entry: RunningEntry,
    req: VideoRequest,
  ): void {
    if (entry.abort.signal.aborted) return;
    const idx = Math.min(entry.pollIndex, VIDEO_POLL_BACKOFF_MS.length - 1);
    const delay = VIDEO_POLL_BACKOFF_MS[idx] ?? 15_000;
    entry.timer = this.deps.setTimer(() => {
      void this.tickVideo(id, provider, handle, entry, req);
    }, delay);
  }

  private async tickVideo(
    id: JobId,
    provider: VideoProvider,
    handle: VideoJobHandle,
    entry: RunningEntry,
    req: VideoRequest,
  ): Promise<void> {
    if (entry.abort.signal.aborted) return;
    let status: { state: VideoJobState; progress?: number; errorMessage?: string };
    try {
      status = await provider.poll(handle);
    } catch (err) {
      if (isAbortError(err)) return;
      this.deps.logger.error("video poll failed", {
        jobId: id,
        providerId: provider.id,
        providerJobId: handle.providerJobId,
        err,
      });
      const updated = this.deps.jobs.updateState(id, {
        state: "failed",
        errorMessage: (err as Error)?.message ?? String(err),
        finishedAt: this.deps.now(),
      });
      this.running.delete(id);
      this.emit("job.failed", updated);
      return;
    }

    // DB-poll-cancellation check: another process / `imagine job cancel`
    // may have flipped state=cancelled while we were polling. Bail before
    // we record progress for an already-cancelled job.
    const persisted = this.deps.jobs.get(id);
    if (persisted?.state === "cancelled") {
      this.running.delete(id);
      this.emit("job.failed", persisted);
      return;
    }

    if (status.state === "queued" || status.state === "running") {
      const updated = this.deps.jobs.updateState(id, {
        state: status.state,
        progress: status.progress,
      });
      this.emit("job.progress", {
        id,
        progress: status.progress ?? 0,
        state: updated.state,
      });
      entry.pollIndex += 1;
      this.scheduleVideoPoll(id, provider, handle, entry, req);
      return;
    }

    if (status.state === "succeeded") {
      try {
        const result = await provider.fetch(handle);
        const itemId = this.deps.idFactory();
        const now = this.deps.now();
        const date = new Date(now);
        const out = result.output;
        const ext = mimeToExt(out.mimeType);
        const dir = this.deps.files.galleryDir(date);
        await this.deps.ensureDir(dir);
        const absPath = this.deps.files.galleryItemFile(itemId, ext, date);
        await this.deps.writeFile(absPath, out.bytes);
        const relPath = relativeToData(absPath, this.deps.files.dataDir);

        // Best-effort thumbnail generation. Persist `thumb_path` only when
        // the service confirms a file was written; failures log + drop.
        let thumbRel: string | null = null;
        if (this.deps.thumbnailService) {
          // `<itemId>.thumb.webp` next to `<itemId>.<ext>` — sibling layout
          // matches architecture.md §6.
          const absThumb = this.deps.files.galleryItemFile(
            `${itemId}.thumb`,
            "webp",
            date,
          );
          try {
            const r = await this.deps.thumbnailService.generateForVideo(
              absPath,
              absThumb,
            );
            if (r.ok) {
              thumbRel = relativeToData(absThumb, this.deps.files.dataDir);
            } else {
              this.deps.logger.warn("thumbnail generateForVideo skipped", {
                id,
                reason: r.reason,
              });
            }
          } catch (err) {
            this.deps.logger.warn("thumbnail generateForVideo threw", {
              id,
              err: String(err),
            });
          }
        }

        const overrides = this.intentOverrides.get(id) ?? {};
        const item = this.deps.gallery.create({
          id: itemId,
          kind: "video",
          parentId: overrides.parentId ?? null,
          prompt: req.prompt,
          negativePrompt: req.negativePrompt ?? null,
          providerId: req.providerId,
          model: req.model,
          paramsJson: JSON.stringify({
            durationSec: req.durationSec,
            fps: req.fps,
            resolution: req.resolution,
            aspectRatio: req.aspectRatio,
            raw: { ...(req.raw ?? {}), ...(out.raw ?? {}) },
          }),
          relPath,
          thumbPath: thumbRel,
          durationMs: out.durationMs ?? null,
          width: out.width ?? null,
          height: out.height ?? null,
          bytes: out.bytes.byteLength,
          jobId: id,
          favorited: false,
          createdAt: now,
        });

        if (overrides.boardId && this.deps.boards) {
          try {
            if (!this.deps.boards.hasItem(overrides.boardId, item.id)) {
              this.deps.boards.appendItem(overrides.boardId, item.id);
            }
          } catch (err) {
            this.deps.logger.warn("appendItem failed", {
              id,
              boardId: overrides.boardId,
              err: String(err),
            });
          }
        }
        this.intentOverrides.delete(id);

        const updated = this.deps.jobs.updateState(id, {
          state: "succeeded",
          progress: 1,
          resultItemId: item.id,
          finishedAt: now,
        });
        this.running.delete(id);
        this.emit("job.completed", updated);
      } catch (err) {
        this.intentOverrides.delete(id);
        this.deps.logger.error("video fetch failed", {
          jobId: id,
          providerId: provider.id,
          providerJobId: handle.providerJobId,
          err,
        });
        const updated = this.deps.jobs.updateState(id, {
          state: "failed",
          errorMessage: (err as Error)?.message ?? String(err),
          finishedAt: this.deps.now(),
        });
        this.running.delete(id);
        this.emit("job.failed", updated);
      }
      return;
    }

    // failed / cancelled
    this.intentOverrides.delete(id);
    if (status.state === "failed") {
      this.deps.logger.error("video provider reported failure", {
        jobId: id,
        providerId: provider.id,
        providerJobId: handle.providerJobId,
        errorMessage: status.errorMessage ?? null,
      });
    }
    const updated = this.deps.jobs.updateState(id, {
      state: status.state,
      errorMessage: status.errorMessage ?? null,
      finishedAt: this.deps.now(),
    });
    this.running.delete(id);
    this.emit("job.failed", updated);
  }

  /**
   * Re-attach to a previously-submitted job (e.g. `imagine job watch`).
   * Resolves on terminal completion, rejects on terminal failure.
   *
   * - If the job is already terminal, returns/rejects immediately.
   * - If `kind=image` and queued/running, marks failed with
   *   "process restarted before completion" (image jobs aren't resumable per
   *   M2 design) and rejects.
   * - If `kind=video` and queued/running, re-schedules the polling loop using
   *   the persisted provider_job_id and resolves on success.
   */
  async attach(id: JobId): Promise<Job> {
    const existing = this.deps.jobs.get(id);
    if (!existing) throw new Error(`job ${id} not found`);

    if (existing.state === "succeeded") return existing;
    if (
      existing.state === "failed" ||
      existing.state === "cancelled"
    ) {
      throw new Error(existing.errorMessage ?? `job ended in state '${existing.state}'`);
    }

    if (existing.kind === "image") {
      const updated = this.deps.jobs.updateState(id, {
        state: "failed",
        errorMessage: "process restarted before completion",
        finishedAt: this.deps.now(),
      });
      this.emit("job.failed", updated);
      throw new Error(updated.errorMessage ?? "image jobs cannot be resumed");
    }

    if (!existing.providerJobId) {
      const updated = this.deps.jobs.updateState(id, {
        state: "failed",
        errorMessage: "no provider_job_id to resume",
        finishedAt: this.deps.now(),
      });
      this.emit("job.failed", updated);
      throw new Error(updated.errorMessage ?? "missing provider_job_id");
    }

    const provider = this.deps.videoRegistry.get(existing.providerId);
    if (!provider) {
      const updated = this.deps.jobs.updateState(id, {
        state: "failed",
        errorMessage: `provider '${existing.providerId}' is no longer configured`,
        finishedAt: this.deps.now(),
      });
      this.emit("job.failed", updated);
      throw new Error(updated.errorMessage ?? "provider not configured");
    }

    // If we're already polling this id, don't double-schedule. Just hook into
    // the next terminal event.
    if (!this.running.has(id)) {
      const handle: VideoJobHandle = {
        providerId: existing.providerId,
        providerJobId: existing.providerJobId,
      };
      const abort = new AbortController();
      const entry: RunningEntry = { abort, pollIndex: 0 };
      this.running.set(id, entry);
      this.scheduleVideoPoll(
        id,
        provider,
        handle,
        entry,
        JSON.parse(existing.requestJson) as VideoRequest,
      );
    }

    return new Promise<Job>((resolve, reject) => {
      const onCompleted = (job: Job): void => {
        if (job.id !== id) return;
        cleanup();
        resolve(job);
      };
      const onFailed = (job: Job): void => {
        if (job.id !== id) return;
        cleanup();
        if (job.state === "cancelled") {
          reject(new Error(job.errorMessage ?? "cancelled"));
          return;
        }
        reject(new Error(job.errorMessage ?? `job ended in state '${job.state}'`));
      };
      const cleanup = (): void => {
        this.off("job.completed", onCompleted);
        this.off("job.failed", onFailed);
      };
      this.on("job.completed", onCompleted);
      this.on("job.failed", onFailed);
    });
  }

  /** Test/inspection helper. */
  isRunning(id: JobId): boolean {
    return this.running.has(id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultIdFactory(): string {
  // Use crypto.randomUUID when available (Node 18+), fall back to Math.random.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

async function defaultWriteFile(filePath: string, bytes: Uint8Array): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.writeFile(filePath, bytes);
}

async function defaultEnsureDir(dir: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(dir, { recursive: true });
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    default: {
      const idx = mime.indexOf("/");
      return idx >= 0 ? mime.slice(idx + 1).split(";")[0]!.trim() : "bin";
    }
  }
}

function relativeToData(absPath: string, dataDir: string): string {
  // Persistence stores relative paths so the directory is portable. We don't
  // pull node:path here to keep the helper trivially testable.
  if (absPath.startsWith(dataDir)) {
    const rest = absPath.slice(dataDir.length);
    return rest.startsWith("/") || rest.startsWith("\\") ? rest.slice(1) : rest;
  }
  return absPath;
}

/** Re-exported so callers can name event payloads precisely. */
export type { JobEventName as JobRunnerEventName };

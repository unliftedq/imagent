import { describe, expect, it } from "vitest";
import type { GalleryItem } from "../domain/gallery.js";
import type { Job, JobState } from "../domain/job.js";
import type { ImageProvider } from "../ports/image-provider.js";
import type { VideoProvider } from "../ports/video-provider.js";
import type {
  FilesServicePort,
  GalleryRepositoryPort,
  JobRepositoryPort,
  ThumbnailServicePort,
} from "./job-runner.js";
import { JobRunner } from "./job-runner.js";

class InMemoryJobs implements JobRepositoryPort {
  jobs = new Map<string, Job>();
  create(job: Job): Job {
    this.jobs.set(job.id, { ...job });
    return { ...job };
  }
  get(id: string): Job | null {
    const j = this.jobs.get(id);
    return j ? { ...j } : null;
  }
  updateState(
    id: string,
    patch: Partial<
      Pick<
        Job,
        "state" | "progress" | "errorMessage" | "providerJobId" | "resultItemId" | "finishedAt"
      >
    >,
  ): Job {
    const cur = this.jobs.get(id);
    if (!cur) throw new Error(`no such job ${id}`);
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    this.jobs.set(id, next);
    return { ...next };
  }
  listByStates(states: readonly JobState[]): Job[] {
    return [...this.jobs.values()].filter((j) => states.includes(j.state));
  }
}

class InMemoryGallery implements GalleryRepositoryPort {
  items = new Map<string, GalleryItem>();
  create(item: GalleryItem): GalleryItem {
    this.items.set(item.id, { ...item });
    return { ...item };
  }
}

const fakeFiles: FilesServicePort = {
  dataDir: "/tmp/data",
  galleryDir: () => "/tmp/data/gallery/2026/04",
  galleryItemFile: (id, ext) => `/tmp/data/gallery/2026/04/${id}.${ext}`,
};

function fakeImageProvider(
  opts: { onGenerate?: (signal?: AbortSignal) => Promise<void> } = {},
): ImageProvider {
  return {
    id: "fake",
    displayName: "Fake",
    capabilities: {
      sizes: ["1024x1024"],
      aspectRatios: [],
      maxReferences: 0,
      maxOutputs: 1,
      supportsStyleRef: false,
    },
    models: new Map(),
    async generate(_req, signal) {
      if (opts.onGenerate) await opts.onGenerate(signal);
      return {
        outputs: [
          {
            bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
            mimeType: "image/png",
          },
        ],
      };
    },
  };
}

interface FakeVideoState {
  pollResults: Array<{ state: JobState; progress?: number; errorMessage?: string }>;
}

function fakeVideoProvider(state: FakeVideoState): VideoProvider {
  let pollIdx = 0;
  return {
    id: "fake-video",
    displayName: "Fake Video",
    capabilities: {
      durationsSec: [],
      maxDurationSec: 0,
      fpsOptions: [],
      resolutions: [],
      supportsFirstFrame: false,
      supportsLastFrame: false,
      supportsRefImages: false,
    },
    models: new Map(),
    async submit() {
      return { providerId: "fake-video", providerJobId: "task-1" };
    },
    async poll() {
      const result = state.pollResults[Math.min(pollIdx, state.pollResults.length - 1)]!;
      pollIdx += 1;
      return result;
    },
    async fetch() {
      return {
        output: {
          bytes: new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]),
          mimeType: "video/mp4",
        },
      };
    },
  };
}

describe("JobRunner — image path", () => {
  it("happy path: writes file, persists item, emits job.completed", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const writes: Array<{ path: string; bytes: Uint8Array }> = [];
    const dirs: string[] = [];
    const writeFile = async (path: string, bytes: Uint8Array) => {
      writes.push({ path, bytes });
    };
    const ensureDir = async (dir: string) => {
      dirs.push(dir);
    };
    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map([["fake", fakeImageProvider()]]),
      videoRegistry: new Map(),
      writeFile,
      ensureDir,
      idFactory: () => `id-${++counter}`,
      now: () => 1730000000000,
    });

    const completed = new Promise<Job>((resolve) => {
      runner.once("job.completed", (job: Job) => resolve(job));
    });

    const id = await runner.start({
      kind: "image",
      request: {
        prompt: "an otter",
        providerId: "fake",
        model: "any",
        count: 1,
        references: [],
        assetIds: [],
      },
    });
    expect(id).toBe("id-1");
    const finishedJob = await completed;
    expect(finishedJob.state).toBe("succeeded");
    expect(finishedJob.resultItemId).toBe("id-2");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe("/tmp/data/gallery/2026/04/id-2.png");
    expect(dirs).toEqual(["/tmp/data/gallery/2026/04"]);
    expect(gallery.items.size).toBe(1);
  });

  it("cancel during image generation marks state=cancelled", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const writeFile = async () => {};
    const ensureDir = async () => {};
    let counter = 0;

    let resolveGen: (() => void) | undefined;
    const provider = fakeImageProvider({
      onGenerate: async (signal) => {
        await new Promise<void>((resolve, reject) => {
          resolveGen = resolve;
          signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      },
    });

    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map([["fake", provider]]),
      videoRegistry: new Map(),
      writeFile,
      ensureDir,
      idFactory: () => `id-${++counter}`,
    });

    const failed = new Promise<Job>((resolve) => runner.once("job.failed", (j: Job) => resolve(j)));
    const id = await runner.start({
      kind: "image",
      request: {
        prompt: "x",
        providerId: "fake",
        model: "any",
        count: 1,
        references: [],
        assetIds: [],
      },
    });
    await runner.cancel(id);
    // Resolve the pending generate so the loop unwinds.
    resolveGen?.();
    const j = await failed;
    expect(j.state).toBe("cancelled");
  });

  it("does not overwrite a cancelled image job when the provider succeeds", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    let counter = 0;
    const provider = fakeImageProvider({
      onGenerate: async () => {
        jobs.updateState("id-1", {
          state: "cancelled",
          errorMessage: "cancelled via CLI",
          finishedAt: Date.now(),
        });
      },
    });
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map([["fake", provider]]),
      videoRegistry: new Map(),
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
    });
    const failed = new Promise<Job>((resolve) => runner.once("job.failed", (j: Job) => resolve(j)));
    await runner.start({
      kind: "image",
      request: {
        prompt: "x",
        providerId: "fake",
        model: "any",
        count: 1,
        references: [],
        assetIds: [],
      },
    });
    const j = await failed;
    expect(j.state).toBe("cancelled");
    expect(j.errorMessage).toBe("cancelled via CLI");
    expect(gallery.items.size).toBe(0);
  });

  it("does not mark a cancelled image job succeeded after creating the gallery item", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery: {
        create(item) {
          const created = gallery.create(item);
          jobs.updateState("id-1", {
            state: "cancelled",
            errorMessage: "cancelled after gallery create",
            finishedAt: Date.now(),
          });
          return created;
        },
      },
      files: fakeFiles,
      imageRegistry: new Map([["fake", fakeImageProvider()]]),
      videoRegistry: new Map(),
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
    });
    const failed = new Promise<Job>((resolve) => runner.once("job.failed", (j: Job) => resolve(j)));
    await runner.start({
      kind: "image",
      request: {
        prompt: "x",
        providerId: "fake",
        model: "any",
        count: 1,
        references: [],
        assetIds: [],
      },
    });
    const j = await failed;
    expect(j.state).toBe("cancelled");
    expect(j.errorMessage).toBe("cancelled after gallery create");
    expect(j.resultItemId).toBeNull();
  });

  it("emits job.failed if provider returns 0 outputs", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const provider: ImageProvider = {
      id: "fake",
      displayName: "Fake",
      capabilities: {
        sizes: [],
        aspectRatios: [],
        maxReferences: 0,
        maxOutputs: 1,
        supportsStyleRef: false,
      },
      models: new Map(),
      async generate() {
        // intentionally invalid — runner should detect zero outputs
        return { outputs: [] as never };
      },
    };
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map([["fake", provider]]),
      videoRegistry: new Map(),
      writeFile: async () => {},
      ensureDir: async () => {},
    });
    const failed = new Promise<Job>((resolve) => runner.once("job.failed", (j: Job) => resolve(j)));
    await runner.start({
      kind: "image",
      request: {
        prompt: "x",
        providerId: "fake",
        model: "any",
        count: 1,
        references: [],
        assetIds: [],
      },
    });
    const j = await failed;
    expect(j.state).toBe("failed");
  });
});

describe("JobRunner — video path", () => {
  it("polls running twice then succeeds and downloads MP4", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const state: FakeVideoState = {
      pollResults: [
        { state: "running", progress: 0.3 },
        { state: "running", progress: 0.7 },
        { state: "succeeded" },
      ],
    };
    const writes: Array<{ path: string; bytes: Uint8Array }> = [];

    // Mock setTimer to invoke immediately.
    const setTimer = (cb: () => void) => {
      queueMicrotask(cb);
      return Symbol("t");
    };

    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map([["fake-video", fakeVideoProvider(state)]]),
      writeFile: async (p, b) => {
        writes.push({ path: p, bytes: b });
      },
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
      setTimer,
      clearTimer: () => {},
    });

    let progressCount = 0;
    runner.on("job.progress", () => {
      progressCount += 1;
    });
    const completed = new Promise<Job>((resolve) =>
      runner.once("job.completed", (j: Job) => resolve(j)),
    );
    await runner.start({
      kind: "video",
      request: {
        prompt: "rotating crystal",
        providerId: "fake-video",
        model: "any",
        references: [],
        assetIds: [],
      },
    });
    const j = await completed;
    expect(j.state).toBe("succeeded");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path.endsWith(".mp4")).toBe(true);
    // first job.progress emitted on submit→running, plus one per running-poll
    expect(progressCount).toBeGreaterThanOrEqual(2);
  });

  it("invokes ThumbnailService on video success and persists thumbPath", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const state: FakeVideoState = {
      pollResults: [{ state: "succeeded" }],
    };
    const thumbCalls: Array<{ src: string; dest: string }> = [];
    const thumbnailService: ThumbnailServicePort = {
      async generateForVideo(srcPath: string, destPath: string) {
        thumbCalls.push({ src: srcPath, dest: destPath });
        return { ok: true } as const;
      },
    };

    const setTimer = (cb: () => void) => {
      queueMicrotask(cb);
      return Symbol("t");
    };

    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map([["fake-video", fakeVideoProvider(state)]]),
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
      setTimer,
      clearTimer: () => {},
      thumbnailService,
    });
    const completed = new Promise<Job>((resolve) =>
      runner.once("job.completed", (j: Job) => resolve(j)),
    );
    await runner.start({
      kind: "video",
      request: {
        prompt: "x",
        providerId: "fake-video",
        model: "any",
        references: [],
        assetIds: [],
      },
    });
    const j = await completed;
    expect(j.state).toBe("succeeded");
    expect(thumbCalls).toHaveLength(1);
    expect(thumbCalls[0]?.src.endsWith(".mp4")).toBe(true);
    expect(thumbCalls[0]?.dest.endsWith(".thumb.webp")).toBe(true);
    const item = gallery.items.get(j.resultItemId!);
    expect(item?.thumbPath).toBeTruthy();
    expect(item?.thumbPath?.endsWith(".thumb.webp")).toBe(true);
  });

  it("does not call ThumbnailService on video failure", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const state: FakeVideoState = {
      pollResults: [{ state: "failed", errorMessage: "boom" }],
    };
    let calls = 0;
    const thumbnailService: ThumbnailServicePort = {
      async generateForVideo() {
        calls += 1;
        return { ok: true } as const;
      },
    };
    const setTimer = (cb: () => void) => {
      queueMicrotask(cb);
      return Symbol("t");
    };
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map([["fake-video", fakeVideoProvider(state)]]),
      writeFile: async () => {},
      ensureDir: async () => {},
      setTimer,
      clearTimer: () => {},
      thumbnailService,
    });
    const failed = new Promise<Job>((resolve) => runner.once("job.failed", (j: Job) => resolve(j)));
    await runner.start({
      kind: "video",
      request: {
        prompt: "x",
        providerId: "fake-video",
        model: "any",
        references: [],
        assetIds: [],
      },
    });
    await failed;
    expect(calls).toBe(0);
  });

  it("survives ThumbnailService failure and still persists the gallery item", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const state: FakeVideoState = {
      pollResults: [{ state: "succeeded" }],
    };
    const thumbnailService: ThumbnailServicePort = {
      async generateForVideo() {
        throw new Error("ffmpeg blew up");
      },
    };
    const setTimer = (cb: () => void) => {
      queueMicrotask(cb);
      return Symbol("t");
    };
    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map([["fake-video", fakeVideoProvider(state)]]),
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
      setTimer,
      clearTimer: () => {},
      thumbnailService,
    });
    const completed = new Promise<Job>((resolve) =>
      runner.once("job.completed", (j: Job) => resolve(j)),
    );
    await runner.start({
      kind: "video",
      request: {
        prompt: "x",
        providerId: "fake-video",
        model: "any",
        references: [],
        assetIds: [],
      },
    });
    const j = await completed;
    expect(j.state).toBe("succeeded");
    const item = gallery.items.get(j.resultItemId!);
    expect(item).toBeTruthy();
    expect(item?.thumbPath ?? null).toBeNull();
  });

  it("does not create a video gallery item when cancelled after writing the output", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const state: FakeVideoState = {
      pollResults: [{ state: "succeeded" }],
    };
    const setTimer = (cb: () => void) => {
      queueMicrotask(cb);
      return Symbol("t");
    };
    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map([["fake-video", fakeVideoProvider(state)]]),
      writeFile: async () => {
        jobs.updateState("id-1", {
          state: "cancelled",
          errorMessage: "cancelled during video write",
          finishedAt: Date.now(),
        });
      },
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
      setTimer,
      clearTimer: () => {},
    });
    const failed = new Promise<Job>((resolve) => runner.once("job.failed", (j: Job) => resolve(j)));
    await runner.start({
      kind: "video",
      request: {
        prompt: "x",
        providerId: "fake-video",
        model: "any",
        references: [],
        assetIds: [],
      },
    });
    const j = await failed;
    expect(j.state).toBe("cancelled");
    expect(j.errorMessage).toBe("cancelled during video write");
    expect(gallery.items.size).toBe(0);
  });

  it("video failed status emits job.failed", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const state: FakeVideoState = {
      pollResults: [{ state: "failed", errorMessage: "boom" }],
    };
    const setTimer = (cb: () => void) => {
      queueMicrotask(cb);
      return Symbol("t");
    };
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map([["fake-video", fakeVideoProvider(state)]]),
      writeFile: async () => {},
      ensureDir: async () => {},
      setTimer,
      clearTimer: () => {},
    });
    const failed = new Promise<Job>((resolve) => runner.once("job.failed", (j: Job) => resolve(j)));
    await runner.start({
      kind: "video",
      request: {
        prompt: "x",
        providerId: "fake-video",
        model: "any",
        references: [],
        assetIds: [],
      },
    });
    const j = await failed;
    expect(j.state).toBe("failed");
    expect(j.errorMessage).toBe("boom");
  });
});

describe("JobRunner — resumeRunningJobs", () => {
  it("resumes a video job from state=running, polls succeeded, and emits job.completed", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const now = Date.now();
    jobs.create({
      id: "vid-resume",
      kind: "video",
      state: "running",
      providerId: "fake-video",
      providerJobId: "task-resume",
      requestJson: JSON.stringify({
        prompt: "rotating crystal",
        providerId: "fake-video",
        model: "any",
        references: [],
        assetIds: [],
      }),
      progress: 0.5,
      errorMessage: null,
      resultItemId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });
    const setTimer = (cb: () => void) => {
      queueMicrotask(cb);
      return Symbol("t");
    };
    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map([
        ["fake-video", fakeVideoProvider({ pollResults: [{ state: "succeeded" }] })],
      ]),
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
      setTimer,
      clearTimer: () => {},
    });
    const completed = new Promise<Job>((resolve) =>
      runner.once("job.completed", (j: Job) => resolve(j)),
    );
    await runner.resumeRunningJobs();
    const j = await completed;
    expect(j.state).toBe("succeeded");
    expect(j.id).toBe("vid-resume");
    expect(gallery.items.size).toBe(1);
  });

  it("marks orphaned image jobs failed with 'process restarted' message", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const now = Date.now();
    jobs.create({
      id: "stale-1",
      kind: "image",
      state: "running",
      providerId: "fake",
      providerJobId: null,
      requestJson: "{}",
      progress: 0.5,
      errorMessage: null,
      resultItemId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map(),
      writeFile: async () => {},
      ensureDir: async () => {},
    });
    const failed = new Promise<Job>((resolve) => runner.once("job.failed", (j: Job) => resolve(j)));
    await runner.resumeRunningJobs();
    const j = await failed;
    expect(j.state).toBe("failed");
    expect(j.errorMessage).toContain("process restarted");
  });
});

describe("JobRunner — attach", () => {
  it("attach to a queued video job, mock provider returns succeeded on first poll", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const now = Date.now();
    jobs.create({
      id: "video-1",
      kind: "video",
      state: "running",
      providerId: "fake-video",
      providerJobId: "task-attach",
      requestJson: JSON.stringify({
        prompt: "x",
        providerId: "fake-video",
        model: "any",
        references: [],
        assetIds: [],
      }),
      progress: 0.1,
      errorMessage: null,
      resultItemId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });

    const setTimer = (cb: () => void) => {
      queueMicrotask(cb);
      return Symbol("t");
    };

    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map([
        ["fake-video", fakeVideoProvider({ pollResults: [{ state: "succeeded" }] })],
      ]),
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
      setTimer,
      clearTimer: () => {},
    });

    const result = await runner.attach("video-1");
    expect(result.state).toBe("succeeded");
    expect(result.id).toBe("video-1");
    expect(result.resultItemId).toBeTruthy();
    expect(gallery.items.size).toBe(1);
  });

  it("attach to an image job marks failed (cannot resume across processes)", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const now = Date.now();
    jobs.create({
      id: "img-stale",
      kind: "image",
      state: "running",
      providerId: "fake",
      providerJobId: null,
      requestJson: "{}",
      progress: 0.5,
      errorMessage: null,
      resultItemId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map(),
      writeFile: async () => {},
      ensureDir: async () => {},
    });
    await expect(runner.attach("img-stale")).rejects.toThrow(/process restarted/);
    const j = jobs.get("img-stale");
    expect(j?.state).toBe("failed");
  });

  it("attach to a terminal succeeded job returns immediately", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const now = Date.now();
    jobs.create({
      id: "done-1",
      kind: "video",
      state: "succeeded",
      providerId: "fake-video",
      providerJobId: "tt",
      requestJson: "{}",
      progress: 1,
      errorMessage: null,
      resultItemId: "item-1",
      createdAt: now,
      updatedAt: now,
      finishedAt: now,
    });
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map(),
      videoRegistry: new Map(),
      writeFile: async () => {},
      ensureDir: async () => {},
    });
    const result = await runner.attach("done-1");
    expect(result.state).toBe("succeeded");
  });
});

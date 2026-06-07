import { describe, expect, it } from "vitest";
import type { GalleryItem } from "../domain/gallery.js";
import type { Job, JobState } from "../domain/job.js";
import type { ImageProvider } from "../ports/image-provider.js";
import type {
  BoardRepositoryPort,
  GalleryRepositoryPort,
  FilesServicePort,
  JobRepositoryPort,
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
      Pick<Job, "state" | "progress" | "errorMessage" | "providerJobId" | "resultItemId" | "finishedAt">
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

class InMemoryBoards implements BoardRepositoryPort {
  /** boardId -> ordered list of itemIds */
  links = new Map<string, string[]>();
  appendItem(boardId: string, itemId: string): unknown {
    const list = this.links.get(boardId) ?? [];
    if (!list.includes(itemId)) list.push(itemId);
    this.links.set(boardId, list);
    return { boardId, itemId, position: list.length - 1, addedAt: Date.now() };
  }
  hasItem(boardId: string, itemId: string): boolean {
    return (this.links.get(boardId) ?? []).includes(itemId);
  }
}

const emptySpeechRegistry = new Map();

const fakeFiles: FilesServicePort = {
  dataDir: "/tmp/data",
  galleryDir: () => "/tmp/data/gallery/2026/04",
  galleryItemFile: (id, ext) => `/tmp/data/gallery/2026/04/${id}.${ext}`,
};

function fakeImageProvider(): ImageProvider {
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
    async generate() {
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

describe("JobRunner — parentId / boardId pass-through", () => {
  it("persists parent_id on the resulting gallery_item when set on the intent", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      files: fakeFiles,
      imageRegistry: new Map([["fake", fakeImageProvider()]]),
      videoRegistry: new Map(),
      speechRegistry: emptySpeechRegistry,
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
      now: () => 1730000000000,
    });

    const completed = new Promise<Job>((resolve) =>
      runner.once("job.completed", (j: Job) => resolve(j)),
    );
    await runner.start({
      kind: "image",
      parentId: "parent-xyz",
      request: {
        prompt: "remixed",
        providerId: "fake",
        model: "any",
        count: 1,
        references: [],
        assetIds: [],
      },
    });
    const j = await completed;
    expect(j.state).toBe("succeeded");
    const item = gallery.items.get(j.resultItemId!);
    expect(item).toBeTruthy();
    expect(item!.parentId).toBe("parent-xyz");
  });

  it("inserts a board_items row when boardId is supplied on the intent", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const boards = new InMemoryBoards();
    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      boards,
      files: fakeFiles,
      imageRegistry: new Map([["fake", fakeImageProvider()]]),
      videoRegistry: new Map(),
      speechRegistry: emptySpeechRegistry,
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
    });
    const completed = new Promise<Job>((resolve) =>
      runner.once("job.completed", (j: Job) => resolve(j)),
    );
    await runner.start({
      kind: "image",
      boardId: "board-1",
      request: {
        prompt: "x",
        providerId: "fake",
        model: "any",
        count: 1,
        references: [],
        assetIds: [],
      },
    });
    const j = await completed;
    expect(boards.hasItem("board-1", j.resultItemId!)).toBe(true);
  });

  it("intent without parentId/boardId leaves item parent null and boards untouched", async () => {
    const jobs = new InMemoryJobs();
    const gallery = new InMemoryGallery();
    const boards = new InMemoryBoards();
    let counter = 0;
    const runner = new JobRunner({
      jobs,
      gallery,
      boards,
      files: fakeFiles,
      imageRegistry: new Map([["fake", fakeImageProvider()]]),
      videoRegistry: new Map(),
      speechRegistry: emptySpeechRegistry,
      writeFile: async () => {},
      ensureDir: async () => {},
      idFactory: () => `id-${++counter}`,
    });
    const completed = new Promise<Job>((resolve) =>
      runner.once("job.completed", (j: Job) => resolve(j)),
    );
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
    const j = await completed;
    const item = gallery.items.get(j.resultItemId!);
    expect(item?.parentId ?? null).toBeNull();
    expect(boards.links.size).toBe(0);
  });
});

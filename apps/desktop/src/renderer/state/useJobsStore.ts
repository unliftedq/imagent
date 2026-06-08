import type { Job, JobsQuery } from "@imagent/core";
import { create } from "zustand";
import { api } from "../lib/api.js";

interface JobProgressEvent {
  id: string;
  progress: number;
  state: Job["state"];
}

export interface StudioTrackedJob {
  id: string;
  kind: Job["kind"];
  prompt: string;
  submittedAt: number;
}

interface JobsState {
  /** Hot index: jobId → latest known job snapshot. */
  jobs: Record<string, Job>;
  /** Optional id of the focused Studio job — drives canvas detail and cancel affordances. */
  activeJobId: string | null;
  /** Recent jobs submitted from Studio, newest first. */
  studioJobs: StudioTrackedJob[];
  /** True once bindEvents() has wired the IPC listeners. */
  bound: boolean;
  bindEvents: () => () => void;
  setActiveJobId: (id: string | null) => void;
  trackStudioJob: (job: StudioTrackedJob) => void;
  dismissStudioJob: (id: string) => void;
  applyProgressEvent: (e: JobProgressEvent) => void;
  applyCompletedEvent: (j: Job) => void;
  applyFailedEvent: (j: Job) => void;
  cancel: (id: string) => Promise<void>;
  /**
   * Re-submit the original generation request behind a failed (or cancelled)
   * job. Re-uses the persisted `requestJson`, tracks the resulting new job
   * in the Studio rail, and returns its id. Throws when the source job is
   * unknown or its persisted request is unusable.
   */
  retry: (id: string) => Promise<string>;
  refresh: (query?: JobsQuery) => Promise<void>;
}

const defaultQuery = {
  state: ["queued", "running", "succeeded", "failed", "cancelled"] as Job["state"][],
  limit: 50,
  offset: 0,
} satisfies JobsQuery;

const MAX_TRACKED_STUDIO_JOBS = 12;

function nextActiveStudioJobId(
  studioJobs: StudioTrackedJob[],
  jobs: Record<string, Job>,
  completedId: string,
): string | null {
  return (
    studioJobs.find((job) => {
      if (job.id === completedId) return false;
      const state = jobs[job.id]?.state;
      return state === "queued" || state === "running";
    })?.id ?? null
  );
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: {},
  activeJobId: null,
  studioJobs: [],
  bound: false,

  bindEvents: () => {
    if (get().bound) return () => {};
    set({ bound: true });
    const offProgress = api.on("job.progress", (payload) => {
      get().applyProgressEvent(payload);
    });
    const offCompleted = api.on("job.completed", (payload) => {
      get().applyCompletedEvent(payload);
    });
    const offFailed = api.on("job.failed", (payload) => {
      get().applyFailedEvent(payload);
    });
    return () => {
      offProgress();
      offCompleted();
      offFailed();
      set({ bound: false });
    };
  },

  setActiveJobId: (id) => set({ activeJobId: id }),

  trackStudioJob: (job) => {
    set((s) => ({
      activeJobId: job.id,
      studioJobs: s.studioJobs.some((existing) => existing.id === job.id)
        ? s.studioJobs.map((existing) => (existing.id === job.id ? job : existing))
        : [job, ...s.studioJobs].slice(0, MAX_TRACKED_STUDIO_JOBS),
    }));
  },

  dismissStudioJob: (id) => {
    set((s) => ({
      activeJobId: s.activeJobId === id ? null : s.activeJobId,
      studioJobs: s.studioJobs.filter((job) => job.id !== id),
    }));
  },

  applyProgressEvent: (e) => {
    set((s) => {
      const existing = s.jobs[e.id];
      if (!existing) {
        // We don't have the row yet; stash a thin shadow.
        const tracked = s.studioJobs.find((job) => job.id === e.id);
        const shadow: Job = {
          id: e.id,
          kind: tracked?.kind ?? "image",
          state: e.state,
          providerId: "",
          providerJobId: null,
          requestJson: tracked ? JSON.stringify({ prompt: tracked.prompt }) : "{}",
          progress: e.progress,
          errorMessage: null,
          resultItemId: null,
          createdAt: tracked?.submittedAt ?? Date.now(),
          updatedAt: Date.now(),
          finishedAt: null,
        };
        return {
          jobs: { ...s.jobs, [e.id]: shadow },
        };
      }
      return {
        jobs: {
          ...s.jobs,
          [e.id]: { ...existing, state: e.state, progress: e.progress },
        },
      };
    });
  },

  applyCompletedEvent: (j) => {
    const wasActive = get().activeJobId === j.id;
    set((s) => {
      const updatedJobs = { ...s.jobs, [j.id]: j };
      // Only re-target `activeJobId` when the completed job was the focused
      // one *and* another job is still running. Otherwise keep focus on the
      // completed job so the canvas surfaces its result via `selectedResult`
      // even if a previously-pinned item (or the canvas-pin window event)
      // doesn't end up overriding the display.
      if (s.activeJobId !== j.id) {
        return { jobs: updatedJobs };
      }
      const nextRunning = nextActiveStudioJobId(s.studioJobs, updatedJobs, j.id);
      return {
        jobs: updatedJobs,
        activeJobId: nextRunning ?? j.id,
      };
    });
    // Also nudge the canvas's local `pinnedId` to the new result so an
    // earlier user-pinned item (or a stale pin from another mode) doesn't
    // mask the freshly-generated output. Harmless when no canvas is mounted.
    if (wasActive && j.resultItemId && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<{ id: string; item?: undefined }>("imagent:canvas-pin", {
          detail: { id: j.resultItemId },
        }),
      );
    }
  },

  applyFailedEvent: (j) => {
    set((s) => {
      const updatedJobs = { ...s.jobs, [j.id]: j };
      if (s.activeJobId !== j.id) {
        return { jobs: updatedJobs };
      }
      // Mirror `applyCompletedEvent` — keep focus on the terminated job when
      // no other job is running so the rail card stays highlighted and the
      // user can act on the failure inline.
      const nextRunning = nextActiveStudioJobId(s.studioJobs, updatedJobs, j.id);
      return {
        jobs: updatedJobs,
        activeJobId: nextRunning ?? j.id,
      };
    });
  },

  cancel: async (id) => {
    await api["jobs.cancel"]({ id });
  },

  retry: async (id) => {
    const job = get().jobs[id];
    if (!job) throw new Error(`job ${id} not found`);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(job.requestJson) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`cannot retry: stored request is malformed (${(err as Error).message})`);
    }
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
    // The persisted request already carries the augmented prompt + merged
    // references/assetIds. We resubmit it as-is — no `assetSlots` so the
    // handler won't double-apply slot resolution.
    if (job.kind === "image") {
      const { jobId } = await api["image.submit"](
        parsed as Parameters<(typeof api)["image.submit"]>[0],
      );
      get().trackStudioJob({ id: jobId, kind: "image", prompt, submittedAt: Date.now() });
      return jobId;
    }
    if (job.kind === "speech") {
      const { jobId } = await api["speech.submit"](
        parsed as Parameters<(typeof api)["speech.submit"]>[0],
      );
      get().trackStudioJob({ id: jobId, kind: "speech", prompt, submittedAt: Date.now() });
      return jobId;
    }
    const { jobId } = await api["video.submit"](
      parsed as Parameters<(typeof api)["video.submit"]>[0],
    );
    get().trackStudioJob({ id: jobId, kind: "video", prompt, submittedAt: Date.now() });
    return jobId;
  },

  refresh: async (query) => {
    const list = await api["jobs.list"](query ?? defaultQuery);
    const next: Record<string, Job> = {};
    for (const j of list) next[j.id] = j;
    set({ jobs: next });
  },
}));

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
    set((s) => ({
      jobs: { ...s.jobs, [j.id]: j },
      activeJobId:
        s.activeJobId === j.id
          ? nextActiveStudioJobId(s.studioJobs, { ...s.jobs, [j.id]: j }, j.id)
          : s.activeJobId,
    }));
    if (wasActive && j.resultItemId && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<{ id: string }>("imagent:canvas-pin", {
          detail: { id: j.resultItemId },
        }),
      );
    }
  },

  applyFailedEvent: (j) => {
    set((s) => ({
      jobs: { ...s.jobs, [j.id]: j },
      activeJobId:
        s.activeJobId === j.id
          ? nextActiveStudioJobId(s.studioJobs, { ...s.jobs, [j.id]: j }, j.id)
          : s.activeJobId,
    }));
  },

  cancel: async (id) => {
    await api["jobs.cancel"]({ id });
  },

  refresh: async (query) => {
    const list = await api["jobs.list"](query ?? defaultQuery);
    const next: Record<string, Job> = {};
    for (const j of list) next[j.id] = j;
    set({ jobs: next });
  },
}));

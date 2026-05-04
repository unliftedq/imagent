import { create } from "zustand";
import type { Job, JobsQuery } from "@imagine/core";
import { api } from "../lib/api.js";

interface JobProgressEvent {
  id: string;
  progress: number;
  state: Job["state"];
}

interface JobsState {
  /** Hot index: jobId → latest known job snapshot. */
  jobs: Record<string, Job>;
  /** Optional id of the in-flight Studio job — drives the active progress bar. */
  activeJobId: string | null;
  /** True once bindEvents() has wired the IPC listeners. */
  bound: boolean;
  bindEvents: () => () => void;
  setActiveJobId: (id: string | null) => void;
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

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: {},
  activeJobId: null,
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

  applyProgressEvent: (e) => {
    set((s) => {
      const existing = s.jobs[e.id];
      // Studio sets activeJobId="__pending__" while waiting for the runner
      // to assign a real id. The first progress event for any newly-running
      // job is our cue to promote that placeholder to the real id so the
      // cancel button can target it.
      const nextActiveJobId =
        s.activeJobId === "__pending__" && (e.state === "queued" || e.state === "running")
          ? e.id
          : s.activeJobId;
      if (!existing) {
        // We don't have the row yet; stash a thin shadow.
        const shadow: Job = {
          id: e.id,
          kind: "image",
          state: e.state,
          providerId: "",
          providerJobId: null,
          requestJson: "{}",
          progress: e.progress,
          errorMessage: null,
          resultItemId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          finishedAt: null,
        };
        return {
          jobs: { ...s.jobs, [e.id]: shadow },
          activeJobId: nextActiveJobId,
        };
      }
      return {
        jobs: {
          ...s.jobs,
          [e.id]: { ...existing, state: e.state, progress: e.progress },
        },
        activeJobId: nextActiveJobId,
      };
    });
  },

  applyCompletedEvent: (j) => {
    set((s) => ({
      jobs: { ...s.jobs, [j.id]: j },
      activeJobId: s.activeJobId === j.id ? null : s.activeJobId,
    }));
  },

  applyFailedEvent: (j) => {
    set((s) => ({
      jobs: { ...s.jobs, [j.id]: j },
      activeJobId: s.activeJobId === j.id ? null : s.activeJobId,
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

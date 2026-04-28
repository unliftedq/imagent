import type { Job, JobId } from "../domain/job.js";
import type { GenerationIntent } from "../domain/request.js";

/** A single mutation observed by JobRunner subscribers. */
export type JobEvent =
  | { type: "job.created"; job: Job }
  | { type: "job.progress"; id: JobId; progress: number; state: Job["state"] }
  | { type: "job.completed"; job: Job }
  | { type: "job.failed"; job: Job }
  | { type: "job.cancelled"; job: Job };

export type JobEventHandler = (event: JobEvent) => void;
export type JobUnsubscribe = () => void;

/**
 * Skeleton for the application-level job runner. The full implementation
 * (provider dispatch, persistence, polling loop, event emission) lands in
 * M2 — see workplan.md §1 M2. The public surface here is honest about the
 * eventual shape so consumers can be typed against it now.
 */
export class JobRunner {
  // M2: registries, repositories, scheduler, abortControllers all live here.
  start(_intent: GenerationIntent): Promise<JobId> {
    throw new Error("not implemented (M2)");
  }

  cancel(_jobId: JobId): Promise<void> {
    throw new Error("not implemented (M2)");
  }

  subscribe(_cb: JobEventHandler): JobUnsubscribe {
    throw new Error("not implemented (M2)");
  }

  /**
   * Resume in-flight jobs at app launch. Implemented in M2 / M7
   * (see workplan.md §1 M7 acceptance: "submit Seedance, close app, reopen").
   */
  resumePersistedJobs(): Promise<void> {
    throw new Error("not implemented (M2)");
  }
}

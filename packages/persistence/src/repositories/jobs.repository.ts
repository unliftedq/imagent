import type { Job, JobsQuery, JobState } from "@imagine-studio/core";
import type { DatabaseType } from "../db.js";

export class JobRepository {
  constructor(private readonly db: DatabaseType) {}

  query(_query: JobsQuery): Job[] {
    return [];
  }

  get(_id: string): Job | null {
    return null;
  }

  create(_job: Job): Job {
    throw new Error("not implemented (M2)");
  }

  updateState(_id: string, _patch: Partial<Pick<Job, "state" | "progress" | "errorMessage" | "providerJobId" | "resultItemId" | "finishedAt">>): Job {
    throw new Error("not implemented (M2)");
  }

  /** Used at app launch to resume queued/running jobs (architecture.md §4). */
  listByStates(_states: readonly JobState[]): Job[] {
    return [];
  }
}

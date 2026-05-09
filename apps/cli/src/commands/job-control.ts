import type { Job, JobId, JobRunner, JobState } from "@imagent/core";
import type { JobRepository } from "@imagent/persistence";

const TERMINAL_STATES = new Set<JobState>(["succeeded", "failed", "cancelled"]);
const MIN_JOB_ID_PREFIX_LENGTH = 6;

export function isTerminalState(state: JobState): boolean {
  return TERMINAL_STATES.has(state);
}

export function resolveJobId(jobs: JobRepository, input: string): JobId {
  if (input.length < MIN_JOB_ID_PREFIX_LENGTH) {
    throw new Error(
      `job id prefix must be at least ${MIN_JOB_ID_PREFIX_LENGTH} characters (got ${input.length})`,
    );
  }
  const matches = jobs.findByIdPrefix(input);
  if (matches.length === 0) throw new Error(`no job with id prefix '${input}'`);
  const exact = matches.find((job) => job.id === input);
  if (exact) return exact.id;
  if (matches.length > 1) {
    throw new Error(
      `job id prefix '${input}' is ambiguous (${matches.length} matches); provide more characters`,
    );
  }
  const [match] = matches;
  if (!match) throw new Error(`no job with id prefix '${input}'`);
  return match.id;
}

export function installCancelOnInterrupt(
  runner: JobRunner,
  jobs: JobRepository,
  id: JobId,
): () => void {
  let cancelling = false;
  const handler = (): void => {
    if (cancelling) return;
    cancelling = true;
    try {
      const current = jobs.get(id);
      if (current && !isTerminalState(current.state)) {
        jobs.updateState(id, {
          state: "cancelled",
          errorMessage: "cancelled by user interrupt",
          finishedAt: Date.now(),
        });
      }
    } catch {
      // Preserve signal handling; the process is exiting anyway.
    }
    void runner.cancel(id).finally(() => {
      process.stderr.write("\ncancelled\n");
      process.exit(130);
    });
    setTimeout(() => process.exit(130), 1_000).unref();
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
  return () => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
}

export async function waitForPersistedTerminalJob(
  jobs: JobRepository,
  id: JobId,
  onSnapshot: (job: Job) => void,
  intervalMs = 2_000,
): Promise<Job> {
  let lastKey = "";
  for (;;) {
    const job = jobs.get(id);
    if (!job) throw new Error(`job ${id} not found`);
    const key = `${job.state}:${job.progress ?? ""}:${job.updatedAt}:${job.errorMessage ?? ""}`;
    if (key !== lastKey) {
      onSnapshot(job);
      lastKey = key;
    }
    if (isTerminalState(job.state)) return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

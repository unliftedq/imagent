import type { Job, JobState, JobsQuery } from "@imagent/core";
import type { DatabaseType } from "../db.js";

interface JobRow {
  id: string;
  kind: string;
  state: string;
  provider_id: string;
  provider_job_id: string | null;
  request_json: string;
  progress: number | null;
  error_message: string | null;
  result_item_id: string | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

function rowToJob(r: JobRow): Job {
  return {
    id: r.id,
    kind: r.kind as Job["kind"],
    state: r.state as JobState,
    providerId: r.provider_id,
    providerJobId: r.provider_job_id,
    requestJson: r.request_json,
    progress: r.progress,
    errorMessage: r.error_message,
    resultItemId: r.result_item_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    finishedAt: r.finished_at,
  };
}

export class JobRepository {
  constructor(private readonly db: DatabaseType) {}

  query(query: JobsQuery): Job[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.state && query.state.length > 0) {
      where.push(`state IN (${query.state.map(() => "?").join(",")})`);
      params.push(...query.state);
    }
    if (query.kind) {
      where.push("kind = ?");
      params.push(query.kind);
    }
    const sql =
      `SELECT * FROM jobs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ` +
      "ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const rows = this.db.prepare(sql).all(...params, query.limit, query.offset) as JobRow[];
    return rows.map(rowToJob);
  }

  get(id: string): Job | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? rowToJob(row) : null;
  }

  findByIdPrefix(prefix: string): Job[] {
    const end = prefixRangeEnd(prefix);
    const rows = end
      ? (this.db
          .prepare("SELECT * FROM jobs WHERE id >= ? AND id < ? ORDER BY created_at DESC")
          .all(prefix, end) as JobRow[])
      : (this.db
          .prepare("SELECT * FROM jobs WHERE id >= ? ORDER BY created_at DESC")
          .all(prefix) as JobRow[]);
    return rows.map(rowToJob);
  }

  create(job: Job): Job {
    this.db
      .prepare(
        `INSERT INTO jobs (id, kind, state, provider_id, provider_job_id, request_json,
            progress, error_message, result_item_id, created_at, updated_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        job.id,
        job.kind,
        job.state,
        job.providerId,
        job.providerJobId ?? null,
        job.requestJson,
        job.progress ?? null,
        job.errorMessage ?? null,
        job.resultItemId ?? null,
        job.createdAt,
        job.updatedAt,
        job.finishedAt ?? null,
      );
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(job.id) as JobRow;
    return rowToJob(row);
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
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [Date.now()];
    if (patch.state !== undefined) {
      sets.push("state = ?");
      params.push(patch.state);
    }
    if (patch.progress !== undefined) {
      sets.push("progress = ?");
      params.push(patch.progress);
    }
    if (patch.errorMessage !== undefined) {
      sets.push("error_message = ?");
      params.push(patch.errorMessage);
    }
    if (patch.providerJobId !== undefined) {
      sets.push("provider_job_id = ?");
      params.push(patch.providerJobId);
    }
    if (patch.resultItemId !== undefined) {
      sets.push("result_item_id = ?");
      params.push(patch.resultItemId);
    }
    if (patch.finishedAt !== undefined) {
      sets.push("finished_at = ?");
      params.push(patch.finishedAt);
    }
    params.push(id);
    this.db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    if (!row) {
      throw new Error(`job ${id} not found after update`);
    }
    return rowToJob(row);
  }

  /** Used at app launch to resume queued/running jobs (architecture.md §4). */
  listByStates(states: readonly JobState[]): Job[] {
    if (states.length === 0) return [];
    const placeholders = states.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT * FROM jobs WHERE state IN (${placeholders}) ORDER BY created_at`)
      .all(...states) as JobRow[];
    return rows.map(rowToJob);
  }
}

function prefixRangeEnd(prefix: string): string | null {
  for (let i = prefix.length - 1; i >= 0; i -= 1) {
    const code = prefix.charCodeAt(i);
    if (code < 0xffff) {
      return `${prefix.slice(0, i)}${String.fromCharCode(code + 1)}`;
    }
  }
  return null;
}

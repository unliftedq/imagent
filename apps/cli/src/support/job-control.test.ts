import type { Job } from "@imagent/core";
import type { JobRepository } from "@imagent/persistence";
import { describe, expect, it } from "vitest";
import { resolveJobId } from "./job-control.js";

function job(id: string): Job {
  return {
    id,
    kind: "image",
    state: "running",
    providerId: "fake",
    providerJobId: null,
    requestJson: "{}",
    progress: 0,
    errorMessage: null,
    resultItemId: null,
    createdAt: 0,
    updatedAt: 0,
    finishedAt: null,
  };
}

function repo(matches: Job[]): JobRepository {
  return {
    findByIdPrefix: () => matches,
  } as unknown as JobRepository;
}

describe("resolveJobId", () => {
  it("rejects prefixes shorter than six characters", () => {
    expect(() => resolveJobId(repo([]), "abcde")).toThrow(
      "job id prefix must be at least 6 characters",
    );
  });

  it("rejects prefixes with no matches", () => {
    expect(() => resolveJobId(repo([]), "abcdef")).toThrow("no job with id prefix 'abcdef'");
  });

  it("returns the unique prefix match", () => {
    expect(resolveJobId(repo([job("abcdef12-3456-7890-abcd-ef1234567890")]), "abcdef")).toBe(
      "abcdef12-3456-7890-abcd-ef1234567890",
    );
  });

  it("prefers an exact match over longer prefix matches", () => {
    expect(
      resolveJobId(repo([job("abcdef"), job("abcdef12-3456-7890-abcd-ef1234567890")]), "abcdef"),
    ).toBe("abcdef");
  });

  it("rejects ambiguous prefix matches", () => {
    expect(() =>
      resolveJobId(
        repo([
          job("abcdef12-3456-7890-abcd-ef1234567890"),
          job("abcdef99-3456-7890-abcd-ef1234567890"),
        ]),
        "abcdef",
      ),
    ).toThrow("job id prefix 'abcdef' is ambiguous (2 matches)");
  });
});

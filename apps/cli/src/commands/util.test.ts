import { describe, expect, it } from "vitest";
import { capReferences } from "./asset-slots.js";
import { excerpt, formatRelativeTime, parseNonNegativeIntegerOption, truncate } from "./util.js";

describe("util", () => {
  it("truncate pads short strings to width", () => {
    expect(truncate("ab", 5)).toBe("ab   ");
  });
  it("truncate trims long strings with ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
  });

  it("formatRelativeTime past minutes", () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5m ago");
  });
  it("formatRelativeTime hours", () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3h ago");
  });
  it("formatRelativeTime future", () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now + 10_000, now)).toBe("in 10s");
  });

  it("excerpt collapses whitespace and adds ellipsis when over n", () => {
    expect(excerpt("hello   world  foo bar", 12)).toBe("hello world…");
    expect(excerpt("short", 20)).toBe("short");
  });

  it("parseNonNegativeIntegerOption accepts zero", () => {
    expect(parseNonNegativeIntegerOption("image", "seed", "0")).toBe(0);
    expect(() => parseNonNegativeIntegerOption("image", "seed", "-1")).toThrow(
      "non-negative integer",
    );
  });
});

describe("asset-slots — capReferences", () => {
  it("returns paths unchanged when under cap", () => {
    expect(capReferences(["a", "b"], 4)).toEqual({ references: ["a", "b"] });
  });
  it("trims to cap and reports the cap", () => {
    expect(capReferences(["a", "b", "c", "d"], 2)).toEqual({
      references: ["a", "b"],
      capped: 2,
    });
  });
  it("undefined cap means no truncation", () => {
    expect(capReferences(["a", "b", "c"], undefined)).toEqual({
      references: ["a", "b", "c"],
    });
  });
});

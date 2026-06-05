import { describe, expect, it } from "vitest";
import { MediaKindSchema } from "./media.js";

describe("MediaKindSchema", () => {
  it("accepts image, video and audio", () => {
    expect(MediaKindSchema.parse("image")).toBe("image");
    expect(MediaKindSchema.parse("video")).toBe("video");
    expect(MediaKindSchema.parse("audio")).toBe("audio");
  });

  it("rejects unknown kinds", () => {
    expect(() => MediaKindSchema.parse("text")).toThrow();
  });
});

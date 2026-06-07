import { describe, expect, it } from "vitest";
import { MediaKindSchema } from "./media.js";

describe("MediaKindSchema", () => {
  it("accepts image, video and speech", () => {
    expect(MediaKindSchema.parse("image")).toBe("image");
    expect(MediaKindSchema.parse("video")).toBe("video");
    expect(MediaKindSchema.parse("speech")).toBe("speech");
  });

  it("rejects unknown kinds", () => {
    expect(() => MediaKindSchema.parse("text")).toThrow();
  });
});

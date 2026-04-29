import { describe, expect, it } from "vitest";
import type { Asset } from "../domain/asset.js";
import {
  appendStylePromptSnippets,
  capReferencePaths,
  resolveAssetSlots,
} from "./asset-slot-resolver.js";

function makeAsset(partial: Partial<Asset> & { id: string; kind: Asset["kind"] }): Asset {
  return {
    id: partial.id,
    kind: partial.kind,
    name: partial.name ?? `asset-${partial.id}`,
    description: partial.description ?? null,
    promptSnippet: partial.promptSnippet ?? null,
    files: partial.files ?? [],
    createdAt: partial.createdAt ?? 0,
    updatedAt: partial.updatedAt ?? 0,
    archivedAt: partial.archivedAt ?? null,
  };
}

const charA = makeAsset({
  id: "char-a",
  kind: "character",
  files: [
    {
      id: "f-a-1",
      assetId: "char-a",
      role: "reference",
      relPath: "assets/char-a/ref-001.png",
      mimeType: "image/png",
      width: 1024,
      height: 768,
      bytes: 1,
      sha256: "x",
      position: 0,
      createdAt: 0,
    },
  ],
});

const objB = makeAsset({
  id: "obj-b",
  kind: "object",
  files: [
    {
      id: "f-b-1",
      assetId: "obj-b",
      role: "reference",
      relPath: "assets/obj-b/ref-001.png",
      mimeType: "image/png",
      width: 512,
      height: 512,
      bytes: 1,
      sha256: "y",
      position: 0,
      createdAt: 0,
    },
  ],
});

const bgC = makeAsset({
  id: "bg-c",
  kind: "background",
  files: [
    {
      id: "f-c-1",
      assetId: "bg-c",
      role: "reference",
      relPath: "assets/bg-c/ref-001.png",
      mimeType: "image/png",
      bytes: 1,
      sha256: "z",
      position: 0,
      createdAt: 0,
    },
  ],
});

const styleRef = makeAsset({
  id: "style-ref",
  kind: "style",
  promptSnippet: "in the style of Studio Ghibli",
  files: [
    {
      id: "f-s-1",
      assetId: "style-ref",
      role: "reference",
      relPath: "assets/style-ref/ref-001.png",
      mimeType: "image/png",
      bytes: 1,
      sha256: "s",
      position: 0,
      createdAt: 0,
    },
  ],
});

const styleSnippetOnly = makeAsset({
  id: "style-only",
  kind: "style",
  promptSnippet: "soft pastels",
  files: [],
});

const lookup = (id: string): Asset | null => {
  switch (id) {
    case "char-a":
      return charA;
    case "obj-b":
      return objB;
    case "bg-c":
      return bgC;
    case "style-ref":
      return styleRef;
    case "style-only":
      return styleSnippetOnly;
    default:
      return null;
  }
};

const abs = (rel: string): string => `/data/${rel}`;

describe("resolveAssetSlots", () => {
  it("no inputs → empty result", () => {
    const r = resolveAssetSlots({}, lookup, abs);
    expect(r).toEqual({
      referencePaths: [],
      stylePromptSnippets: [],
      assetIds: [],
      attachments: [],
    });
  });

  it("combines refs across slots in fixed order (char → obj → bg → style)", () => {
    const r = resolveAssetSlots(
      { style: ["style-ref"], background: ["bg-c"], object: ["obj-b"], character: ["char-a"] },
      lookup,
      abs,
    );
    expect(r.referencePaths).toEqual([
      "/data/assets/char-a/ref-001.png",
      "/data/assets/obj-b/ref-001.png",
      "/data/assets/bg-c/ref-001.png",
      "/data/assets/style-ref/ref-001.png",
    ]);
    expect(r.attachments.map((a) => a.role)).toEqual([
      "character",
      "object",
      "background",
      "style",
    ]);
  });

  it("style with refs and supportsReferences=true → uses refs (no snippet appended)", () => {
    const r = resolveAssetSlots(
      { style: ["style-ref"] },
      lookup,
      abs,
      { supportsReferences: true },
    );
    expect(r.referencePaths).toEqual(["/data/assets/style-ref/ref-001.png"]);
    expect(r.stylePromptSnippets).toEqual([]);
    expect(r.attachments).toEqual([{ assetId: "style-ref", role: "style" }]);
  });

  it("style with refs and supportsReferences=false → appends snippet", () => {
    const r = resolveAssetSlots(
      { style: ["style-ref"] },
      lookup,
      abs,
      { supportsReferences: false },
    );
    expect(r.referencePaths).toEqual([]);
    expect(r.stylePromptSnippets).toEqual(["in the style of Studio Ghibli"]);
    expect(r.attachments).toEqual([{ assetId: "style-ref", role: "style" }]);
  });

  it("style with snippet only → always appends snippet", () => {
    const r = resolveAssetSlots(
      { style: ["style-only"] },
      lookup,
      abs,
      { supportsReferences: true },
    );
    expect(r.referencePaths).toEqual([]);
    expect(r.stylePromptSnippets).toEqual(["soft pastels"]);
  });

  it("alwaysAppendStyleSnippets=true with refs and preferStyleRefOverSnippet=false → both", () => {
    const r = resolveAssetSlots(
      { style: ["style-ref"] },
      lookup,
      abs,
      {
        supportsReferences: true,
        alwaysAppendStyleSnippets: true,
        preferStyleRefOverSnippet: false,
      },
    );
    expect(r.referencePaths).toEqual(["/data/assets/style-ref/ref-001.png"]);
    expect(r.stylePromptSnippets).toEqual(["in the style of Studio Ghibli"]);
  });

  it("missing asset id → throws", () => {
    expect(() =>
      resolveAssetSlots({ character: ["does-not-exist"] }, lookup, abs),
    ).toThrow(/not found/);
  });

  it("kind mismatch → throws", () => {
    expect(() =>
      // char-a is kind=character; passing it as a style slot is a user bug.
      resolveAssetSlots({ style: ["char-a"] }, lookup, abs),
    ).toThrow(/kind=/);
  });
});

describe("capReferencePaths", () => {
  it("no cap → returns the input as-is", () => {
    const r = capReferencePaths(["a", "b", "c"], undefined);
    expect(r.references).toEqual(["a", "b", "c"]);
    expect(r.capped).toBeUndefined();
  });

  it("cap >= length → no truncation", () => {
    const r = capReferencePaths(["a", "b"], 5);
    expect(r.references).toEqual(["a", "b"]);
    expect(r.capped).toBeUndefined();
  });

  it("cap < length → truncates from the end and surfaces the cap", () => {
    const r = capReferencePaths(["a", "b", "c", "d"], 2);
    expect(r.references).toEqual(["a", "b"]);
    expect(r.capped).toBe(2);
  });
});

describe("appendStylePromptSnippets", () => {
  it("no snippets → unchanged", () => {
    expect(appendStylePromptSnippets("a cat", [])).toBe("a cat");
  });

  it("single snippet → comma-separated", () => {
    expect(appendStylePromptSnippets("a cat", ["pastel"])).toBe("a cat, pastel");
  });

  it("multiple snippets → joined with commas", () => {
    expect(
      appendStylePromptSnippets("a cat", ["pastel", "studio ghibli"]),
    ).toBe("a cat, pastel, studio ghibli");
  });

  it("empty prompt → snippets become the whole prompt", () => {
    expect(appendStylePromptSnippets("", ["pastel"])).toBe("pastel");
  });
});

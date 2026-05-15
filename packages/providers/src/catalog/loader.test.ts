import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getBundledCatalog, loadCatalog, saveCatalog } from "./loader.js";
import type { ModelCatalog } from "./schema.js";

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "imagent-catalog-test-"));
}

function silentLogger(): { info: () => void; warn: () => void } {
  return { info: () => {}, warn: () => {} };
}

describe("loadCatalog", () => {
  it("first run: returns bundled default without writing it to the user path", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");

    const loaded = await loadCatalog({ path: userPath, logger: silentLogger() });
    expect(loaded.version).toBe(2);
    // Sanity: the bundled default ships with at least one openai image model.
    expect(loaded.providers.openai?.image?.length).toBeGreaterThan(0);
    expect(loaded.models.image["MAI-Image-2"]?.capabilities?.minWidth).toBe(768);
    expect(loaded.models.image["flux-2-pro"]?.capabilities?.maxWidth).toBe(2048);

    await expect(fs.stat(userPath)).rejects.toBeTruthy();
  });

  it("normal: merges user catalog overlay with bundled defaults", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    const overlay = {
      version: 2,
      models: {
        image: {
          "custom-model": {
            id: "custom-model",
            displayName: "Custom",
            capabilities: {
              sizes: ["1024x1024"],
              maxOutputs: 1,
              supportsStyleRef: false,
            },
            defaults: { size: "1024x1024", count: 1 },
          },
          "gpt-image-2": {
            displayName: "GPT Image 2 Override",
            defaults: { quality: "high" },
          },
        },
      },
      providers: {
        openai: { image: [{ id: "custom-route", modelId: "custom-model" }] },
      },
    };
    await fs.writeFile(userPath, JSON.stringify(overlay, null, 2));

    const loaded = await loadCatalog({ path: userPath, logger: silentLogger() });
    expect(loaded.providers.openai?.image?.some((entry) => entry.id === "custom-route")).toBe(true);
    expect(loaded.providers.openai?.image?.some((entry) => entry.id === "gpt-image-2")).toBe(true);
    expect(loaded.models.image["custom-model"]?.displayName).toBe("Custom");
    expect(loaded.models.image["gpt-image-2"]?.displayName).toBe("GPT Image 2 Override");
    expect(loaded.models.image["gpt-image-2"]?.defaults?.quality).toBe("high");
    expect(Object.keys(loaded.models.video).length).toBeGreaterThan(0);
  });

  it("merges partial capability overlays without applying capability defaults", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    const overlay = {
      version: 2,
      models: {
        image: {
          "gpt-image-2": {
            capabilities: { sizes: ["1024x1024"] },
          },
        },
        video: {
          "veo-3.0-generate-001": {
            capabilities: { resolutions: ["720p"] },
          },
        },
      },
    };
    await fs.writeFile(userPath, JSON.stringify(overlay, null, 2));

    const loaded = await loadCatalog({ path: userPath, logger: silentLogger() });
    const imageCaps = loaded.models.image["gpt-image-2"]?.capabilities;
    expect(imageCaps?.sizes).toEqual(["1024x1024"]);
    expect(imageCaps?.supportsStyleRef).toBe(true);
    expect(imageCaps?.maxOutputs).toBe(10);

    const videoCaps = loaded.models.video["veo-3.0-generate-001"]?.capabilities;
    expect(videoCaps?.resolutions).toEqual(["720p"]);
    // Bundled defaults for Veo 3 stable: first/last frame are not wired through
    // the provider and not supported by the stable model (Veo 3.1 preview only).
    expect(videoCaps?.supportsFirstFrame).toBe(false);
    expect(videoCaps?.supportsLastFrame).toBe(false);
  });

  it("can read the bundled default from a packaged asset path", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    const assetPath = path.join(dir, "catalog.default.json");
    const bundled = getBundledCatalog();
    await fs.writeFile(
      assetPath,
      JSON.stringify(
        {
          ...bundled,
          comments: "asset-source",
        },
        null,
        2,
      ),
    );

    const loaded = await loadCatalog({
      path: userPath,
      bundledPath: assetPath,
      logger: silentLogger(),
    });
    expect(loaded.comments).toBe("asset-source");
  });

  it("invalid JSON: falls back to bundled in-memory and does NOT touch user file", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    await fs.writeFile(userPath, "this is not json {{{");

    const warnings: string[] = [];
    const logger = { info: () => {}, warn: (m: string) => warnings.push(m) };
    const loaded = await loadCatalog({ path: userPath, logger });
    // Bundled default is returned in-memory.
    expect(loaded.providers.openai?.image?.length).toBeGreaterThan(0);
    // User file was preserved verbatim.
    const onDisk = await fs.readFile(userPath, "utf8");
    expect(onDisk).toBe("this is not json {{{");
    expect(warnings.some((w) => /invalid JSON|schema/i.test(w))).toBe(true);
  });

  it("schema mismatch: falls back to bundled in-memory + warn", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    // Wrong shape: v2 requires `models` and `providers`.
    await fs.writeFile(userPath, JSON.stringify({ version: 2, image: "nope", video: {} }));

    const warnings: string[] = [];
    const logger = { info: () => {}, warn: (m: string) => warnings.push(m) };
    const loaded = await loadCatalog({ path: userPath, logger });
    expect(loaded.providers.openai?.image?.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("saveCatalog", () => {
  it("writes atomically: temp file then rename", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    const bundled = getBundledCatalog();
    await saveCatalog(bundled, { path: userPath });
    const onDisk = JSON.parse(await fs.readFile(userPath, "utf8")) as ModelCatalog;
    expect(onDisk.version).toBe(2);

    // No `.catalog.json.*.tmp` siblings should remain after a successful write.
    const entries = await fs.readdir(dir);
    const stragglers = entries.filter((e) => e.startsWith(".catalog.json.") && e.endsWith(".tmp"));
    expect(stragglers).toEqual([]);
  });

  it("rejects an invalid catalog before writing", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    const bogus = { version: 99 } as unknown as ModelCatalog;
    await expect(saveCatalog(bogus, { path: userPath })).rejects.toBeTruthy();
    // No file written.
    await expect(fs.stat(userPath)).rejects.toBeTruthy();
  });
});

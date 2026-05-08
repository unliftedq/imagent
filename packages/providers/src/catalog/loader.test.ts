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
  it("first run: writes bundled default to user path and returns it", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    const bundled = getBundledCatalog();

    const loaded = await loadCatalog({ path: userPath, logger: silentLogger() });
    expect(loaded.version).toBe(2);
    // Sanity: the bundled default ships with at least one openai image model.
    expect(loaded.providers.openai?.image?.length).toBeGreaterThan(0);
    expect(loaded.models.image["MAI-Image-2"]?.capabilities?.minWidth).toBe(768);
    expect(loaded.models.image["flux-2-pro"]?.capabilities?.maxWidth).toBe(2048);

    const onDisk = JSON.parse(await fs.readFile(userPath, "utf8")) as ModelCatalog;
    expect(onDisk.version).toBe(2);
    expect(onDisk.providers.openai?.image?.length).toBe(bundled.providers.openai?.image?.length);
  });

  it("normal: reads user file verbatim", async () => {
    const dir = await tempDir();
    const userPath = path.join(dir, "catalog.json");
    const custom: ModelCatalog = {
      version: 2,
      models: {
        image: {
          "custom-model": {
            id: "custom-model",
            displayName: "Custom",
            capabilities: {
              sizes: ["1024x1024"],
              maxOutputs: 1,
              supportsNegativePrompt: false,
              supportsSeed: false,
              supportsStyleRef: false,
            },
            defaults: { size: "1024x1024", count: 1 },
          },
        },
        video: {},
      },
      providers: {
        openai: { image: [{ id: "custom-route", modelId: "custom-model" }] },
      },
    };
    await fs.writeFile(userPath, JSON.stringify(custom, null, 2));

    const loaded = await loadCatalog({ path: userPath, logger: silentLogger() });
    expect(loaded.providers.openai?.image).toHaveLength(1);
    expect(loaded.providers.openai?.image?.[0]?.id).toBe("custom-route");
    expect(loaded.models.image["custom-model"]?.displayName).toBe("Custom");
    expect(loaded.models.video).toEqual({});
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

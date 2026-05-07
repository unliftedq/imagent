import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createEnvSecretsStore,
  createFileSecretsStore,
  envProviderRoutingOverlay,
  mergeSecrets,
} from "./secrets.js";
import { ProviderPreferencesSchema } from "./schema.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imagent-secrets-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createFileSecretsStore", () => {
  it("returns empty secrets when secrets.json does not exist", async () => {
    const filePath = path.join(tmpDir, "secrets.json");
    const store = createFileSecretsStore(filePath);
    await expect(store.loadSecrets()).resolves.toEqual({});
    await expect(fs.readFile(filePath, "utf8")).resolves.toBe("{}");
  });

  it("saves apiKey-only secrets to plaintext json and reloads them", async () => {
    const filePath = path.join(tmpDir, "secrets.json");
    const store = createFileSecretsStore(filePath);

    await store.saveSecrets({
      "azure-openai": { apiKey: "azure-key" },
      openai: { apiKey: "sk-test" },
    });

    const raw = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual({
      "azure-openai": { apiKey: "azure-key" },
      openai: { apiKey: "sk-test" },
    });
    await expect(store.loadSecrets()).resolves.toEqual({
      "azure-openai": { apiKey: "azure-key" },
      openai: { apiKey: "sk-test" },
    });
  });

  it("merges partial vendor patches preserving the apiKey on subsequent writes", async () => {
    const store = createFileSecretsStore(path.join(tmpDir, "secrets.json"));

    await store.saveSecrets({ "azure-openai": { apiKey: "old-key" } });
    await store.saveSecrets({ openai: { apiKey: "openai-key" } });

    await expect(store.loadSecrets()).resolves.toEqual({
      "azure-openai": { apiKey: "old-key" },
      openai: { apiKey: "openai-key" },
    });
  });
});

describe("createEnvSecretsStore", () => {
  it("loads apiKey env vars across all known vendors", async () => {
    const store = createEnvSecretsStore({
      OPENAI_API_KEY: "sk-1",
      AZURE_OPENAI_API_KEY: "azure-key",
      GOOGLE_API_KEY: "g",
      FLUX_BFL_API_KEY: "f",
      BYTEDANCE_API_KEY: "b",
      XAI_API_KEY: "x",
    });

    await expect(store.loadSecrets()).resolves.toEqual({
      openai: { apiKey: "sk-1" },
      "azure-openai": { apiKey: "azure-key" },
      google: { apiKey: "g" },
      "flux-bfl": { apiKey: "f" },
      bytedance: { apiKey: "b" },
      xai: { apiKey: "x" },
    });
  });

  it("does not surface endpoint env vars in the secrets shape (those are routing)", async () => {
    const store = createEnvSecretsStore({
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      BYTEDANCE_ENDPOINT: "https://ark.cn-beijing.volces.com",
    });

    await expect(store.loadSecrets()).resolves.toEqual({});
  });
});

describe("envProviderRoutingOverlay", () => {
  it("overlays Azure + ByteDance endpoints on top of an empty prefs block", () => {
    const empty = ProviderPreferencesSchema.parse({});
    const overlaid = envProviderRoutingOverlay(
      {
        AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
        BYTEDANCE_ENDPOINT: "https://ark.cn-beijing.volces.com",
      },
      empty,
    );

    expect(overlaid["azure-openai"]?.endpoint).toBe("https://example.openai.azure.com");
    expect(overlaid.bytedance?.endpoint).toBe("https://ark.cn-beijing.volces.com");
  });

  it("returns the same prefs object when no relevant env vars are set", () => {
    const empty = ProviderPreferencesSchema.parse({});
    const overlaid = envProviderRoutingOverlay({}, empty);
    expect(overlaid).toBe(empty);
  });

  it("preserves config-defined image[]/video[] entries while overlaying endpoint", () => {
    const prefs = ProviderPreferencesSchema.parse({
      "azure-openai": {
        image: [{ id: "deployment-1", modelId: "gpt-image-2" }],
      },
    });
    const overlaid = envProviderRoutingOverlay(
      { AZURE_OPENAI_ENDPOINT: "https://from-env.openai.azure.com" },
      prefs,
    );
    expect(overlaid["azure-openai"]?.endpoint).toBe("https://from-env.openai.azure.com");
    expect(overlaid["azure-openai"]?.image).toEqual([
      { id: "deployment-1", modelId: "gpt-image-2" },
    ]);
  });
});

describe("mergeSecrets", () => {
  it("lets later layers override earlier fields", () => {
    expect(
      mergeSecrets(
        { openai: { apiKey: "file-key" } },
        { openai: { apiKey: "env-key" }, google: { apiKey: "google-key" } },
      ),
    ).toEqual({
      openai: { apiKey: "env-key" },
      google: { apiKey: "google-key" },
    });
  });
});

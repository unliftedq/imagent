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
      azure: { apiKey: "azure-key" },
      openai: { apiKey: "sk-test" },
    });

    const raw = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual({
      azure: { apiKey: "azure-key" },
      openai: { apiKey: "sk-test" },
    });
    await expect(store.loadSecrets()).resolves.toEqual({
      azure: { apiKey: "azure-key" },
      openai: { apiKey: "sk-test" },
    });
  });

  it("merges partial vendor patches preserving the apiKey on subsequent writes", async () => {
    const store = createFileSecretsStore(path.join(tmpDir, "secrets.json"));

    await store.saveSecrets({ azure: { apiKey: "old-key" } });
    await store.saveSecrets({ openai: { apiKey: "openai-key" } });

    await expect(store.loadSecrets()).resolves.toEqual({
      azure: { apiKey: "old-key" },
      openai: { apiKey: "openai-key" },
    });
  });
});

describe("createEnvSecretsStore", () => {
  it("loads apiKey env vars across all known vendors", async () => {
    const store = createEnvSecretsStore({
      OPENAI_API_KEY: "sk-1",
      AZURE_API_KEY: "azure-key",
      GOOGLE_API_KEY: "g",
      FLUX_BFL_API_KEY: "f",
      BYTEPLUS_API_KEY: "bp",
      VOLCENGINE_API_KEY: "v",
      XAI_API_KEY: "x",
    });

    await expect(store.loadSecrets()).resolves.toEqual({
      openai: { apiKey: "sk-1" },
      azure: { apiKey: "azure-key" },
      google: { apiKey: "g" },
      "flux-bfl": { apiKey: "f" },
      byteplus: { apiKey: "bp" },
      volcengine: { apiKey: "v" },
      xai: { apiKey: "x" },
    });
  });

  it("accepts legacy ByteDance env var aliases for BytePlus", async () => {
    const store = createEnvSecretsStore({
      BYTEDANCE_API_KEY: "legacy-bp",
    });

    await expect(store.loadSecrets()).resolves.toEqual({
      byteplus: { apiKey: "legacy-bp" },
    });
  });

  it("does not surface endpoint env vars in the secrets shape (those are routing)", async () => {
    const store = createEnvSecretsStore({
      AZURE_ENDPOINT: "https://example.openai.azure.com",
      BYTEPLUS_ENDPOINT: "https://ark.ap-southeast.bytepluses.com/api/v3",
      VOLCENGINE_ENDPOINT: "https://ark.cn-beijing.volces.com/api/v3",
    });

    await expect(store.loadSecrets()).resolves.toEqual({});
  });
});

describe("envProviderRoutingOverlay", () => {
  it("overlays Azure + BytePlus + Volcengine endpoints on top of an empty prefs block", () => {
    const empty = ProviderPreferencesSchema.parse({});
    const overlaid = envProviderRoutingOverlay(
      {
        AZURE_ENDPOINT: "https://example.openai.azure.com",
        BYTEPLUS_ENDPOINT: "https://ark.ap-southeast.bytepluses.com/api/v3",
        VOLCENGINE_ENDPOINT: "https://ark.cn-beijing.volces.com/api/v3",
      },
      empty,
    );

    expect(overlaid.azure?.endpoint).toBe("https://example.openai.azure.com");
    expect(overlaid.byteplus?.endpoint).toBe("https://ark.ap-southeast.bytepluses.com/api/v3");
    expect(overlaid.volcengine?.endpoint).toBe("https://ark.cn-beijing.volces.com/api/v3");
  });

  it("accepts the legacy ByteDance endpoint env var alias for BytePlus", () => {
    const empty = ProviderPreferencesSchema.parse({});
    const overlaid = envProviderRoutingOverlay(
      {
        BYTEDANCE_ENDPOINT: "https://legacy.byteplus.example/api/v3",
      },
      empty,
    );

    expect(overlaid.byteplus?.endpoint).toBe("https://legacy.byteplus.example/api/v3");
  });

  it("returns the same prefs object when no relevant env vars are set", () => {
    const empty = ProviderPreferencesSchema.parse({});
    const overlaid = envProviderRoutingOverlay({}, empty);
    expect(overlaid).toBe(empty);
  });

  it("preserves config-defined image[]/video[] entries while overlaying endpoint", () => {
    const prefs = ProviderPreferencesSchema.parse({
      azure: {
        image: [{ id: "deployment-1", modelId: "gpt-image-2" }],
      },
    });
    const overlaid = envProviderRoutingOverlay(
      { AZURE_ENDPOINT: "https://from-env.openai.azure.com" },
      prefs,
    );
    expect(overlaid.azure?.endpoint).toBe("https://from-env.openai.azure.com");
    expect(overlaid.azure?.image).toEqual([
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

describe("legacy bytedance compatibility", () => {
  it("loads a secrets.json that stores its key under the legacy `bytedance` field", async () => {
    const filePath = path.join(tmpDir, "secrets.json");
    await fs.writeFile(
      filePath,
      JSON.stringify({ bytedance: { apiKey: "legacy-key-12345" } }),
      "utf8",
    );
    const store = createFileSecretsStore(filePath);
    const loaded = await store.loadSecrets();
    expect(loaded).toEqual({ byteplus: { apiKey: "legacy-key-12345" } });
    expect(loaded).not.toHaveProperty("bytedance");
  });

  it("re-saving after a legacy load drops the `bytedance` field on disk", async () => {
    const filePath = path.join(tmpDir, "secrets.json");
    await fs.writeFile(
      filePath,
      JSON.stringify({ bytedance: { apiKey: "legacy-key-12345" } }),
      "utf8",
    );
    const store = createFileSecretsStore(filePath);
    // Trigger a save (no-op patch is enough — current state is normalized
    // through the schema preprocess on the way in).
    await store.saveSecrets({});
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    expect(raw).toEqual({ byteplus: { apiKey: "legacy-key-12345" } });
    expect(raw).not.toHaveProperty("bytedance");
  });

  it("new `byteplus` wins when both fields are present", () => {
    const parsed = ProviderPreferencesSchema.parse({
      bytedance: { endpoint: "https://legacy.example/api" },
      byteplus: { endpoint: "https://new.example/api" },
    });
    expect(parsed.byteplus?.endpoint).toBe("https://new.example/api");
    expect(parsed).not.toHaveProperty("bytedance");
  });
});

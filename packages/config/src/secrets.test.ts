import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEnvSecretsStore, createFileSecretsStore, mergeSecrets } from "./secrets.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imagent-secrets-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createFileSecretsStore", () => {
  it("returns empty secrets when secrets.json does not exist", async () => {
    const store = createFileSecretsStore(path.join(tmpDir, "secrets.json"));
    await expect(store.loadSecrets()).resolves.toEqual({});
  });

  it("saves provider secrets to plaintext json and reloads them", async () => {
    const filePath = path.join(tmpDir, "secrets.json");
    const store = createFileSecretsStore(filePath);

    await store.saveSecrets({
      "azure-openai": {
        endpoint: "https://example.openai.azure.com",
        apiKey: "azure-key",
      },
    });

    const raw = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual({
      "azure-openai": {
        endpoint: "https://example.openai.azure.com",
        apiKey: "azure-key",
      },
    });
    await expect(store.loadSecrets()).resolves.toEqual({
      "azure-openai": {
        endpoint: "https://example.openai.azure.com",
        apiKey: "azure-key",
      },
    });
  });

  it("deep-merges partial provider patches", async () => {
    const store = createFileSecretsStore(path.join(tmpDir, "secrets.json"));

    await store.saveSecrets({
      "azure-openai": {
        endpoint: "https://old.example.com",
        apiKey: "old-key",
      },
    });
    await store.saveSecrets({
      "azure-openai": {
        endpoint: "https://new.example.com",
      },
    });

    await expect(store.loadSecrets()).resolves.toEqual({
      "azure-openai": {
        endpoint: "https://new.example.com",
        apiKey: "old-key",
      },
    });
  });
});

describe("createEnvSecretsStore", () => {
  it("loads complete provider records from env vars", async () => {
    const store = createEnvSecretsStore({
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      AZURE_OPENAI_API_KEY: "azure-key",
    });

    await expect(store.loadSecrets()).resolves.toEqual({
      "azure-openai": {
        endpoint: "https://example.openai.azure.com",
        apiKey: "azure-key",
      },
    });
  });

  it("drops incomplete endpoint/key provider records", async () => {
    const store = createEnvSecretsStore({
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
    });

    await expect(store.loadSecrets()).resolves.toEqual({});
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

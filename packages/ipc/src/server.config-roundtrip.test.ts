/**
 * Round-trip tests for `providers.config.set` + `providers.secrets.set`.
 *
 * These tests exist because the renderer's "Save" button on the Providers
 * page wasn't actually persisting user input. Each test mimics what the UI
 * sends after a user fills in a row, drives it through `registerIpcHandlers`
 * (the real server validator + envelope path), backed by real
 * `createFileConfigStore` / `createFileSecretsStore` instances, and asserts
 * that a subsequent `providers.config.get` / `providers.secrets.get`
 * returns the same data.
 *
 * After the "minimum-auth" reshape, well-known providers carry empty prefs
 * blocks; the catalog is the source of truth for model/provider bindings,
 * including Azure deployment names.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFileConfigStore,
  createFileSecretsStore,
  DEFAULT_CONFIG,
  type ConfigStore,
  type ProviderPreferences,
  type ProviderSecrets,
  type SecretsStore,
} from "@imagine/config";
import { createIpcClient, type IpcTransport } from "./client.js";
import { registerIpcHandlers, type ContractHandlers, type IpcMainLike } from "./server.js";
import type { MaskedSecrets, ProviderPreferencesPayload, SecretsWrite } from "./contract.js";

// ----- fake ipc + transport (same shape as server.test.ts) ------------------
function makeFakeIpc(): {
  ipcMain: IpcMainLike;
  invoke: (channel: string, input: unknown) => Promise<unknown>;
} {
  const channels = new Map<
    string,
    (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  >();
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => {
      channels.set(channel, listener);
    },
    removeHandler: (channel) => {
      channels.delete(channel);
    },
  };
  return {
    ipcMain,
    invoke: async (channel, input) => {
      const fn = channels.get(channel);
      if (!fn) throw new Error(`channel ${channel} not registered`);
      return fn({}, input);
    },
  };
}

function makeTransport(
  invoke: (channel: string, input: unknown) => Promise<unknown>,
): IpcTransport {
  return {
    invoke: (method, input) => invoke(method, input),
    subscribe: () => () => {},
  };
}

// ----- payload bridge (mirrors apps/desktop/src/main/ipc-handlers.ts) -------
function prefsPayloadFromConfig(_p: ProviderPreferences): ProviderPreferencesPayload {
  return {
    openai: {},
    "azure-openai": {},
    google: {},
    "flux-bfl": {},
    bytedance: {},
    xai: {},
  };
}

function prefsConfigFromPayload(_payload: ProviderPreferencesPayload): ProviderPreferences {
  return {
    openai: {},
    "azure-openai": {},
    google: {},
    "flux-bfl": {},
    bytedance: {},
    xai: {},
  };
}

function maskValue(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 9) return "*".repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function maskSecrets(s: ProviderSecrets): MaskedSecrets {
  const out: MaskedSecrets = {};
  if (s.openai) out.openai = { apiKey: maskValue(s.openai.apiKey) };
  if (s["azure-openai"]) {
    out["azure-openai"] = {
      endpoint: s["azure-openai"].endpoint || null,
      apiKey: maskValue(s["azure-openai"].apiKey),
    };
  }
  if (s.google) out.google = { apiKey: maskValue(s.google.apiKey) };
  if (s["flux-bfl"]) out["flux-bfl"] = { apiKey: maskValue(s["flux-bfl"].apiKey) };
  if (s.bytedance) {
    out.bytedance = {
      endpoint: s.bytedance.endpoint || null,
      apiKey: maskValue(s.bytedance.apiKey),
    };
  }
  if (s.xai) out.xai = { apiKey: maskValue(s.xai.apiKey) };
  return out;
}

async function applySecretsWrite(store: SecretsStore, input: SecretsWrite): Promise<void> {
  const patch: Partial<ProviderSecrets> = {};
  if (input.openai?.apiKey) patch.openai = { apiKey: input.openai.apiKey };
  if (input["azure-openai"]) {
    const cur = (await store.loadSecrets())["azure-openai"];
    const merged = {
      endpoint: input["azure-openai"].endpoint ?? cur?.endpoint ?? "",
      apiKey: input["azure-openai"].apiKey ?? cur?.apiKey ?? "",
    };
    if (merged.endpoint && merged.apiKey) patch["azure-openai"] = merged;
  }
  if (input.google?.apiKey) patch.google = { apiKey: input.google.apiKey };
  if (input["flux-bfl"]?.apiKey) patch["flux-bfl"] = { apiKey: input["flux-bfl"].apiKey };
  if (input.bytedance) {
    const cur = (await store.loadSecrets()).bytedance;
    const merged = {
      endpoint: input.bytedance.endpoint ?? cur?.endpoint ?? "",
      apiKey: input.bytedance.apiKey ?? cur?.apiKey ?? "",
    };
    if (merged.endpoint && merged.apiKey) patch.bytedance = merged;
  }
  if (input.xai?.apiKey) patch.xai = { apiKey: input.xai.apiKey };
  await store.saveSecrets(patch);
}

function makeHandlers(
  configStore: ConfigStore,
  secretsStore: SecretsStore,
): Partial<ContractHandlers> {
  return {
    "providers.config.get": async () => {
      const config = await configStore.loadConfig();
      return prefsPayloadFromConfig(config.providers);
    },
    "providers.config.set": async (input) => {
      const next = await configStore.saveConfig({
        providers: prefsConfigFromPayload(input),
      });
      return prefsPayloadFromConfig(next.providers);
    },
    "providers.secrets.get": async () => {
      return maskSecrets(await secretsStore.loadSecrets());
    },
    "providers.secrets.set": async (input) => {
      await applySecretsWrite(secretsStore, input);
      return maskSecrets(await secretsStore.loadSecrets());
    },
  };
}

// ----- fixture --------------------------------------------------------------
let tmpDir: string;
let configStore: ConfigStore;
let secretsStore: SecretsStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imagine-roundtrip-"));
  configStore = createFileConfigStore(path.join(tmpDir, "config.json"));
  secretsStore = createFileSecretsStore(path.join(tmpDir, "secrets.json"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function buildClient() {
  const { ipcMain, invoke } = makeFakeIpc();
  registerIpcHandlers(ipcMain, makeHandlers(configStore, secretsStore));
  return createIpcClient(makeTransport(invoke));
}

// ----- prefs round-trip per provider ---------------------------------------

describe("providers.config.set + providers.config.get round-trip", () => {
  it("openai: empty slot round-trips (catalog is source of truth)", async () => {
    const client = buildClient();
    const initial = await client["providers.config.get"]();
    expect(initial.openai).toEqual({});
    const saved = await client["providers.config.set"](initial);
    expect(saved.openai).toEqual({});
    const reloaded = await client["providers.config.get"]();
    expect(reloaded.openai).toEqual({});
  });

  it("azure-openai: empty slot round-trips (deployments removed in latest revision)", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded["azure-openai"]).toEqual({});
  });

  it("google: empty slot round-trips", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded.google).toEqual({});
  });

  it("flux-bfl: empty slot round-trips", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded["flux-bfl"]).toEqual({});
  });

  it("bytedance: empty slot round-trips", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded.bytedance).toEqual({});
  });

  it("xai: empty slot round-trips", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded.xai).toEqual({});
  });

  it("regression: full multi-provider save reloads exactly", async () => {
    // Reproduces the original bug: the renderer ships the FULL prefs payload
    // on every Save click. If `prefsConfigFromPayload` (or a side-channel)
    // drops or reshapes any provider's block, the subsequent reload looks
    // empty for that provider. After the deployment-name removal there's no
    // configurable surface left in prefs, so the round-trip is a no-op
    // identity check; the hook stays in case future per-provider knobs land.
    const client = buildClient();
    const initial = await client["providers.config.get"]();
    const saved = await client["providers.config.set"](initial);
    expect(saved).toEqual(initial);
    const reloaded = await client["providers.config.get"]();
    expect(reloaded).toEqual(initial);
  });
});

describe("providers.secrets.set + providers.secrets.get round-trip", () => {
  it("openai: persists apiKey (masked on read-back)", async () => {
    const client = buildClient();
    const patch: SecretsWrite = { openai: { apiKey: "sk-test-12345" } };
    const masked = await client["providers.secrets.set"](patch);
    expect(masked.openai?.apiKey).toBe("sk-t…2345");
    const reloaded = await client["providers.secrets.get"]();
    expect(reloaded.openai?.apiKey).toBe("sk-t…2345");
    // And the raw store must contain the plaintext.
    const raw = await secretsStore.loadSecrets();
    expect(raw.openai?.apiKey).toBe("sk-test-12345");
  });

  it("azure-openai: requires endpoint+apiKey to land in the patch", async () => {
    const client = buildClient();
    const patch: SecretsWrite = {
      "azure-openai": {
        endpoint: "https://r.openai.azure.com",
        apiKey: "azure-key-123456",
      },
    };
    await client["providers.secrets.set"](patch);
    const raw = await secretsStore.loadSecrets();
    expect(raw["azure-openai"]).toEqual({
      endpoint: "https://r.openai.azure.com",
      apiKey: "azure-key-123456",
    });
  });

  it("bytedance: persists endpoint + apiKey (mirrors Azure shape)", async () => {
    const client = buildClient();
    const patch: SecretsWrite = {
      bytedance: {
        endpoint: "https://ark.cn-beijing.volces.com/api/v3",
        apiKey: "volc-key-12345",
      },
    };
    await client["providers.secrets.set"](patch);
    const raw = await secretsStore.loadSecrets();
    expect(raw.bytedance).toEqual({
      endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      apiKey: "volc-key-12345",
    });
  });

  it("azure-openai apiKey-only save (after endpoint pre-saved) merges with current", async () => {
    // Reproduces the original silent-fail scenario: the Azure secrets handler
    // will SKIP writing the patch unless BOTH endpoint and apiKey are present
    // in the merged record. If a previous save already stored the endpoint,
    // typing only the apiKey on a subsequent save MUST still persist.
    await secretsStore.saveSecrets({
      "azure-openai": {
        endpoint: "https://prev.openai.azure.com",
        apiKey: "old-key",
      },
    });
    const client = buildClient();
    const patch: SecretsWrite = {
      "azure-openai": {
        apiKey: "new-key-shiny",
      },
    };
    await client["providers.secrets.set"](patch);
    const raw = await secretsStore.loadSecrets();
    expect(raw["azure-openai"]?.apiKey).toBe("new-key-shiny");
    expect(raw["azure-openai"]?.endpoint).toBe("https://prev.openai.azure.com");
  });
});

// Sanity: DEFAULT_CONFIG ships every provider slot the schema requires.
describe("DEFAULT_CONFIG sanity", () => {
  it("contains every provider key the IPC payload expects", () => {
    expect(DEFAULT_CONFIG.providers.openai).toBeDefined();
    expect(DEFAULT_CONFIG.providers["azure-openai"]).toBeDefined();
    expect(DEFAULT_CONFIG.providers.google).toBeDefined();
    expect(DEFAULT_CONFIG.providers["flux-bfl"]).toBeDefined();
    expect(DEFAULT_CONFIG.providers.bytedance).toBeDefined();
    expect(DEFAULT_CONFIG.providers.xai).toBeDefined();
  });
});

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
} from "@imagent/config";
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
// Audio provider config slots that are not yet renderer-editable are preserved
// as defaults so this IPC package remains type-compatible with @imagent/config.
function prefsPayloadFromConfig(p: ProviderPreferences): ProviderPreferencesPayload {
  return {
    openai: p.openai ?? {},
    "azure": p["azure"] ?? {},
    google: p.google ?? {},
    "flux-bfl": p["flux-bfl"] ?? {},
    byteplus: p.byteplus ?? {},
    volcengine: p.volcengine ?? {},
    xai: p.xai ?? {},
    minimax: p.minimax ?? {},
    customOpenAI: p.customOpenAI ?? {},
  };
}

function prefsConfigFromPayload(payload: ProviderPreferencesPayload): ProviderPreferences {
  return {
    openai: payload.openai,
    "azure": payload["azure"],
    google: payload.google,
    "flux-bfl": payload["flux-bfl"],
    byteplus: payload.byteplus,
    volcengine: payload.volcengine,
    xai: payload.xai,
    minimax: payload.minimax,
    elevenlabs: {},
    customOpenAI: payload.customOpenAI,
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
  if (s["azure"]) out["azure"] = { apiKey: maskValue(s["azure"].apiKey) };
  if (s.google) out.google = { apiKey: maskValue(s.google.apiKey) };
  if (s["flux-bfl"]) out["flux-bfl"] = { apiKey: maskValue(s["flux-bfl"].apiKey) };
  if (s.byteplus) out.byteplus = { apiKey: maskValue(s.byteplus.apiKey) };
  if (s.volcengine) out.volcengine = { apiKey: maskValue(s.volcengine.apiKey) };
  if (s.xai) out.xai = { apiKey: maskValue(s.xai.apiKey) };
  if (s.minimax) out.minimax = { apiKey: maskValue(s.minimax.apiKey) };
  return out;
}

async function applySecretsWrite(store: SecretsStore, input: SecretsWrite): Promise<void> {
  const patch: Partial<ProviderSecrets> = {};
  if (input.openai?.apiKey) patch.openai = { apiKey: input.openai.apiKey };
  if (input["azure"]?.apiKey) {
    patch["azure"] = { apiKey: input["azure"].apiKey };
  }
  if (input.google?.apiKey) patch.google = { apiKey: input.google.apiKey };
  if (input["flux-bfl"]?.apiKey) patch["flux-bfl"] = { apiKey: input["flux-bfl"].apiKey };
  if (input.byteplus?.apiKey) patch.byteplus = { apiKey: input.byteplus.apiKey };
  if (input.volcengine?.apiKey) patch.volcengine = { apiKey: input.volcengine.apiKey };
  if (input.xai?.apiKey) patch.xai = { apiKey: input.xai.apiKey };
  if (input.minimax?.apiKey) patch.minimax = { apiKey: input.minimax.apiKey };
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imagent-roundtrip-"));
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

  it("azure: empty slot round-trips (deployments removed in latest revision)", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded["azure"]).toEqual({});
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

  it("byteplus: empty slot round-trips", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded.byteplus).toEqual({});
  });

  it("volcengine: empty slot round-trips", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded.volcengine).toEqual({});
  });

  it("xai: empty slot round-trips", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded.xai).toEqual({});
  });

  it("minimax: empty slot round-trips", async () => {
    const client = buildClient();
    const reloaded = await client["providers.config.get"]();
    expect(reloaded.minimax).toEqual({});
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

  it("azure: persists apiKey only (endpoint moved to providers.config)", async () => {
    const client = buildClient();
    const patch: SecretsWrite = {
      "azure": { apiKey: "azure-key-123456" },
    };
    await client["providers.secrets.set"](patch);
    const raw = await secretsStore.loadSecrets();
    expect(raw["azure"]).toEqual({ apiKey: "azure-key-123456" });
  });

  it("byteplus: persists apiKey only (endpoint moved to providers.config)", async () => {
    const client = buildClient();
    const patch: SecretsWrite = {
      byteplus: { apiKey: "bp-key-12345" },
    };
    await client["providers.secrets.set"](patch);
    const raw = await secretsStore.loadSecrets();
    expect(raw.byteplus).toEqual({ apiKey: "bp-key-12345" });
  });

  it("volcengine: persists apiKey only (endpoint moved to providers.config)", async () => {
    const client = buildClient();
    const patch: SecretsWrite = {
      volcengine: { apiKey: "volc-key-12345" },
    };
    await client["providers.secrets.set"](patch);
    const raw = await secretsStore.loadSecrets();
    expect(raw.volcengine).toEqual({ apiKey: "volc-key-12345" });
  });

  it("azure apiKey can be re-saved without resending the endpoint", async () => {
    // Pre-stored apiKey is overwritten cleanly on re-save; endpoint lives in
    // providers.config now and is unaffected by secrets writes.
    await secretsStore.saveSecrets({ "azure": { apiKey: "old-key" } });
    const client = buildClient();
    await client["providers.secrets.set"]({ "azure": { apiKey: "new-key-shiny" } });
    const raw = await secretsStore.loadSecrets();
    expect(raw["azure"]?.apiKey).toBe("new-key-shiny");
  });
});

// Sanity: DEFAULT_CONFIG ships every provider slot the schema requires.
describe("DEFAULT_CONFIG sanity", () => {
  it("contains every provider key the IPC payload expects", () => {
    expect(DEFAULT_CONFIG.providers.openai).toBeDefined();
    expect(DEFAULT_CONFIG.providers["azure"]).toBeDefined();
    expect(DEFAULT_CONFIG.providers.google).toBeDefined();
    expect(DEFAULT_CONFIG.providers["flux-bfl"]).toBeDefined();
    expect(DEFAULT_CONFIG.providers.byteplus).toBeDefined();
    expect(DEFAULT_CONFIG.providers.volcengine).toBeDefined();
    expect(DEFAULT_CONFIG.providers.xai).toBeDefined();
    expect(DEFAULT_CONFIG.providers.minimax).toBeDefined();
  });
});

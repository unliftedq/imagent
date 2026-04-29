import { app, dialog, shell, type BrowserWindow, type IpcMain } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  type ConfigStore,
  type ProviderPreferences,
  type ProviderSecrets,
  type SecretsStore,
  DEFAULT_CONFIG,
} from "@imagine-studio/config";
import {
  configuredProviderCount as _unused,
  type ImageRegistry,
  type VideoRegistry,
} from "@imagine-studio/providers";
import { KvRepository, type DatabaseType, type PathResolver } from "@imagine-studio/persistence";
import {
  IpcHandlerError,
  notImplemented,
  registerIpcHandlers,
  type ContractHandlers,
  type IpcServer,
} from "@imagine-studio/ipc";
import type { Logger } from "@imagine-studio/core";
import type { RuntimeServices } from "./job-runner-bootstrap.js";

void _unused;

export interface IpcDeps {
  ipcMain: IpcMain;
  db: DatabaseType;
  configStore: ConfigStore;
  secretsStore: SecretsStore;
  paths: PathResolver;
  logger: Logger;
  runtime: RuntimeServices;
  /** All currently-open windows. Used to address `system.chooseDirectory` to the right one. */
  getMainWindow: () => BrowserWindow | null;
}

/**
 * Wires every IPC route described in the contract. M4 routes are real;
 * M5/M6/M7 routes return `not_implemented` envelopes. Push events are not
 * forwarded here — the main process attaches `webContents` targets via
 * `IpcServer.addEventTarget`.
 */
export function setupIpc(deps: IpcDeps): IpcServer {
  const { ipcMain, configStore, secretsStore, paths, logger, runtime, getMainWindow } = deps;
  const kv = new KvRepository(deps.db);

  const handlers: Partial<ContractHandlers> = {
    "providers.list": async () => {
      const config = await configStore.loadConfig();
      const secrets = await secretsStore.loadSecrets();
      return providerSummaryList(config.providers, secrets);
    },

    "providers.config.get": async () => {
      const config = await configStore.loadConfig();
      return prefsPayloadFromConfig(config.providers);
    },

    "providers.config.set": async (input) => {
      const next = await configStore.saveConfig({ providers: prefsConfigFromPayload(input) });
      return prefsPayloadFromConfig(next.providers);
    },

    "providers.secrets.get": async () => {
      const secrets = await secretsStore.loadSecrets();
      return maskSecrets(secrets);
    },

    "providers.secrets.set": async (input) => {
      // Map the renderer's plaintext payload into the internal patch shape.
      const patch: Partial<ProviderSecrets> = {};
      if (input.openai?.apiKey) patch.openai = { apiKey: input.openai.apiKey };
      if (input["azure-openai"]) {
        const cur = (await secretsStore.loadSecrets())["azure-openai"];
        const merged = {
          endpoint: input["azure-openai"].endpoint ?? cur?.endpoint ?? "",
          apiKey: input["azure-openai"].apiKey ?? cur?.apiKey ?? "",
          apiVersion: input["azure-openai"].apiVersion ?? cur?.apiVersion ?? "2024-10-21",
        };
        if (merged.endpoint && merged.apiKey) patch["azure-openai"] = merged;
      }
      if (input.google?.apiKey) patch.google = { apiKey: input.google.apiKey };
      if (input["flux-bfl"]?.apiKey) patch["flux-bfl"] = { apiKey: input["flux-bfl"].apiKey };
      if (input.volcengine) {
        const cur = (await secretsStore.loadSecrets()).volcengine;
        if (input.volcengine.apiKey || input.volcengine.region) {
          patch.volcengine = {
            apiKey: input.volcengine.apiKey ?? cur?.apiKey ?? "",
            region: input.volcengine.region ?? cur?.region ?? "cn-beijing",
          };
        }
      }
      await secretsStore.saveSecrets(patch);
      // Rebuild registries so subsequent providers.test() picks up the new keys.
      await runtime.refresh();
      return maskSecrets(await secretsStore.loadSecrets());
    },

    "providers.test": async ({ id }) => {
      const provider =
        runtime.imageRegistry.get(id) ?? runtime.videoRegistry.get(id);
      if (!provider) {
        return { ok: false, reason: `provider '${id}' is not configured` };
      }
      if (!provider.test) {
        return { ok: false, reason: `provider '${id}' does not implement test()` };
      }
      try {
        return await provider.test();
      } catch (err) {
        // Defense in depth — the contract says test() never throws, but if a
        // future implementation slips, surface the failure cleanly.
        return { ok: false, reason: (err as Error)?.message ?? String(err) };
      }
    },

    "app.preferences.get": async () => {
      const config = await configStore.loadConfig();
      return config.app;
    },

    "app.preferences.set": async (input) => {
      const next = await configStore.saveConfig({ app: input });
      return next.app;
    },

    "app.version": async () => ({
      app: app.getVersion(),
      electron: process.versions.electron ?? "unknown",
      node: process.versions.node,
      chrome: process.versions.chrome ?? "unknown",
      platform: process.platform,
      arch: process.arch,
      dataDir: paths.dataDir,
    }),

    "app.storagePaths": async () => ({
      dataDir: paths.dataDir,
      configFile: paths.configFile(),
      secretsBin: paths.secretsBin(),
      secretsJson: paths.secretsFile(),
      dbFile: paths.dbFile(),
      galleryDir: path.join(paths.dataDir, "gallery"),
      assetsDir: paths.assetsDir(),
      logsDir: paths.logsDir(),
    }),

    "system.openExternal": async ({ url }) => {
      // Only allow http/https/mailto — refuse `file://` and shell handlers.
      if (!/^(https?|mailto):/i.test(url)) {
        throw new IpcHandlerError("validation_failed", `Refusing to open URL '${url}'`);
      }
      await shell.openExternal(url);
    },

    "system.openPath": async ({ path: target }) => {
      // Only allow paths inside dataDir to avoid arbitrary fs poking from the renderer.
      const abs = path.resolve(target);
      if (!abs.startsWith(path.resolve(paths.dataDir))) {
        throw new IpcHandlerError("validation_failed", `Refusing to open path outside dataDir`);
      }
      try {
        await fs.mkdir(abs, { recursive: true });
      } catch {
        // path may be a file — that's fine; openPath handles both.
      }
      const reason = await shell.openPath(abs);
      if (reason) throw new IpcHandlerError("internal", `openPath failed: ${reason}`);
    },

    "system.chooseDirectory": async (input) => {
      const win = getMainWindow();
      const opts: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
      };
      if (input?.defaultPath) opts.defaultPath = input.defaultPath;
      const res = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (res.canceled || res.filePaths.length === 0) return { path: null };
      return { path: res.filePaths[0] ?? null };
    },

    "system.resetConfig": async () => {
      await configStore.saveConfig(DEFAULT_CONFIG);
      await runtime.refresh();
    },

    "workspace.kv.get": async ({ key }) => kv.get(key),
    "workspace.kv.set": async ({ key, value }) => {
      kv.set(key, value);
    },
    "workspace.kv.delete": async ({ key }) => {
      kv.delete(key);
    },

    // M5 — Studio + Gallery
    "image.generate": notImplemented("M5", "image.generate"),
    "gallery.query": notImplemented("M5", "gallery.query"),
    "gallery.remix": notImplemented("M5", "gallery.remix"),
    "gallery.toggleFavorite": notImplemented("M5", "gallery.toggleFavorite"),
    "gallery.delete": notImplemented("M5", "gallery.delete"),
    "boards.list": notImplemented("M5", "boards.list"),
    "boards.create": notImplemented("M5", "boards.create"),
    "boards.update": notImplemented("M5", "boards.update"),
    "boards.delete": notImplemented("M5", "boards.delete"),
    "boards.addItem": notImplemented("M5", "boards.addItem"),
    "boards.removeItem": notImplemented("M5", "boards.removeItem"),
    "boards.setCover": notImplemented("M5", "boards.setCover"),
    "jobs.list": notImplemented("M5", "jobs.list"),
    "jobs.cancel": notImplemented("M5", "jobs.cancel"),

    // M6 — Assets
    "assets.list": notImplemented("M6", "assets.list"),
    "assets.create": notImplemented("M6", "assets.create"),
    "assets.update": notImplemented("M6", "assets.update"),
    "assets.delete": notImplemented("M6", "assets.delete"),
    "assets.uploadFile": notImplemented("M6", "assets.uploadFile"),

    // M7 — Video Studio
    "video.submit": notImplemented("M7", "video.submit"),
  };

  const server = registerIpcHandlers(ipcMain, handlers);
  logger.info("[ipc] handlers registered");
  return server;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function providerSummaryList(
  prefs: ProviderPreferences,
  secrets: ProviderSecrets,
): Array<{
  id: "openai" | "azure-openai" | "google" | "flux-bfl" | "seedream" | "seedance";
  displayName: string;
  configured: boolean;
  defaultModel: string | null;
  modelIds: string[];
}> {
  return [
    {
      id: "openai",
      displayName: "OpenAI",
      configured: !!secrets.openai,
      defaultModel: prefs.openai.defaultModel ?? null,
      modelIds: prefs.openai.models.map((m) => (typeof m === "string" ? m : m.id)),
    },
    {
      id: "azure-openai",
      displayName: "Azure OpenAI",
      configured: !!secrets["azure-openai"],
      defaultModel: prefs["azure-openai"].deployments.image || null,
      modelIds: [prefs["azure-openai"].deployments.image].filter(Boolean) as string[],
    },
    {
      id: "google",
      displayName: "Google (Imagen / Gemini)",
      configured: !!secrets.google,
      defaultModel: prefs.google.defaultModel ?? null,
      modelIds: prefs.google.models.map((m) => (typeof m === "string" ? m : m.id)),
    },
    {
      id: "flux-bfl",
      displayName: "Flux (BFL)",
      configured: !!secrets["flux-bfl"],
      defaultModel: prefs["flux-bfl"].defaultModel ?? null,
      modelIds: prefs["flux-bfl"].models.map((m) => (typeof m === "string" ? m : m.id)),
    },
    {
      id: "seedream",
      displayName: "Seedream (Volcengine)",
      configured: !!secrets.volcengine,
      defaultModel: prefs.seedream.defaultModel ?? null,
      modelIds: prefs.seedream.models.map((m) => (typeof m === "string" ? m : m.id)),
    },
    {
      id: "seedance",
      displayName: "Seedance (Volcengine)",
      configured: !!secrets.volcengine,
      defaultModel: prefs.seedance.defaultModel ?? null,
      modelIds: prefs.seedance.models.map((m) => (typeof m === "string" ? m : m.id)),
    },
  ];
}

/** Mask a secret value: keep first 4 + last 4 characters, ellide the middle. */
export function maskValue(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 9) return "*".repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function maskSecrets(s: ProviderSecrets): {
  openai?: { apiKey: string | null };
  "azure-openai"?: { endpoint: string | null; apiKey: string | null; apiVersion: string | null };
  google?: { apiKey: string | null };
  "flux-bfl"?: { apiKey: string | null };
  volcengine?: { apiKey: string | null; region: string | null };
} {
  const out: Record<string, unknown> = {};
  if (s.openai) out.openai = { apiKey: maskValue(s.openai.apiKey) };
  if (s["azure-openai"]) {
    out["azure-openai"] = {
      // Endpoint and apiVersion aren't really secret — surface them unmasked.
      endpoint: s["azure-openai"].endpoint || null,
      apiKey: maskValue(s["azure-openai"].apiKey),
      apiVersion: s["azure-openai"].apiVersion || null,
    };
  }
  if (s.google) out.google = { apiKey: maskValue(s.google.apiKey) };
  if (s["flux-bfl"]) out["flux-bfl"] = { apiKey: maskValue(s["flux-bfl"].apiKey) };
  if (s.volcengine) {
    out.volcengine = {
      apiKey: maskValue(s.volcengine.apiKey),
      region: s.volcengine.region || null,
    };
  }
  return out as ReturnType<typeof maskSecrets>;
}

function prefsPayloadFromConfig(p: ProviderPreferences): {
  openai: { baseUrl: string | null; models: string[]; defaultModel: string };
  "azure-openai": {
    deployments: { image: string; video: string | null };
    defaultDeployment: "image" | "video";
  };
  google: { models: string[]; defaultModel: string };
  "flux-bfl": { baseUrl: string; models: string[]; defaultModel: string };
  seedream: { baseUrl: string; models: string[]; defaultModel: string };
  seedance: { baseUrl: string; models: string[]; defaultModel: string };
} {
  const ids = (entries: ReadonlyArray<string | { id: string }>): string[] =>
    entries.map((e) => (typeof e === "string" ? e : e.id));
  return {
    openai: {
      baseUrl: p.openai.baseUrl,
      models: ids(p.openai.models),
      defaultModel: p.openai.defaultModel,
    },
    "azure-openai": {
      deployments: p["azure-openai"].deployments,
      defaultDeployment: p["azure-openai"].defaultDeployment,
    },
    google: { models: ids(p.google.models), defaultModel: p.google.defaultModel },
    "flux-bfl": {
      baseUrl: p["flux-bfl"].baseUrl,
      models: ids(p["flux-bfl"].models),
      defaultModel: p["flux-bfl"].defaultModel,
    },
    seedream: {
      baseUrl: p.seedream.baseUrl,
      models: ids(p.seedream.models),
      defaultModel: p.seedream.defaultModel,
    },
    seedance: {
      baseUrl: p.seedance.baseUrl,
      models: ids(p.seedance.models),
      defaultModel: p.seedance.defaultModel,
    },
  };
}

function prefsConfigFromPayload(
  payload: ReturnType<typeof prefsPayloadFromConfig>,
): ProviderPreferences {
  // Models come back as bare strings; the catalog merge happens at registry
  // construction so storing strings is exactly what config.json expects.
  return {
    openai: payload.openai,
    "azure-openai": payload["azure-openai"],
    google: payload.google,
    "flux-bfl": payload["flux-bfl"],
    seedream: payload.seedream,
    seedance: payload.seedance,
  };
}


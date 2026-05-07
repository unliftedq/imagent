import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type ProviderPreferences,
  ProviderPreferencesSchema,
  type ProviderRouting,
  type ProviderSecrets,
  ProviderSecretsSchema,
} from "./schema.js";
import type { DeepPartial, SecretsStore } from "./store.js";

/**
 * Env var names per architecture.md / .env.example. `apiKey` env vars become
 * an in-memory secrets layer; `endpoint` env vars overlay the **routing**
 * (preferences) — they're URLs, not secrets.
 */
const ENV_KEYS = {
  openai: { apiKey: "OPENAI_API_KEY" },
  "azure-openai": {
    apiKey: "AZURE_OPENAI_API_KEY",
    endpoint: "AZURE_OPENAI_ENDPOINT",
  },
  google: { apiKey: "GOOGLE_API_KEY" },
  "flux-bfl": { apiKey: "FLUX_BFL_API_KEY" },
  bytedance: { apiKey: "BYTEDANCE_API_KEY", endpoint: "BYTEDANCE_ENDPOINT" },
  xai: { apiKey: "XAI_API_KEY" },
} as const;

/**
 * File-backed secrets store. On save it best-effort chmod 600; chmod is a
 * no-op on Windows (NTFS doesn't honour POSIX bits) — we swallow EPERM /
 * ENOSYS gracefully.
 */
export function createFileSecretsStore(filePath: string): SecretsStore {
  return {
    async loadSecrets(): Promise<ProviderSecrets> {
      let raw: string;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          await writeSecretsFile(filePath, {});
          return {};
        }
        throw err;
      }
      const parsed = JSON.parse(raw);
      return ProviderSecretsSchema.parse(parsed);
    },
    async saveSecrets(patch): Promise<void> {
      const current = await this.loadSecrets();
      const next = ProviderSecretsSchema.parse(deepMergeSecrets(current, patch));
      await writeSecretsFile(filePath, next);
    },
  };
}

async function writeSecretsFile(filePath: string, secrets: ProviderSecrets): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(secrets, null, 2), "utf8");
  try {
    await fs.chmod(filePath, 0o600);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // Windows NTFS doesn't expose POSIX bits; ignore the failure.
    if (code !== "EPERM" && code !== "ENOSYS" && code !== "ENOTSUP") {
      throw err;
    }
  }
}

/**
 * Reads provider apiKeys from the documented env vars. Endpoint env vars are
 * routing — see {@link envProviderRoutingOverlay} — and don't appear here.
 */
export function createEnvSecretsStore(env: NodeJS.ProcessEnv): SecretsStore {
  return {
    async loadSecrets(): Promise<ProviderSecrets> {
      const out: ProviderSecrets = {};
      const openaiKey = env[ENV_KEYS.openai.apiKey];
      if (openaiKey) out.openai = { apiKey: openaiKey };

      const azureKey = env[ENV_KEYS["azure-openai"].apiKey];
      if (azureKey) out["azure-openai"] = { apiKey: azureKey };

      const googleKey = env[ENV_KEYS.google.apiKey];
      if (googleKey) out.google = { apiKey: googleKey };

      const fluxKey = env[ENV_KEYS["flux-bfl"].apiKey];
      if (fluxKey) out["flux-bfl"] = { apiKey: fluxKey };

      const bdKey = env[ENV_KEYS.bytedance.apiKey];
      if (bdKey) out.bytedance = { apiKey: bdKey };

      const xaiKey = env[ENV_KEYS.xai.apiKey];
      if (xaiKey) out.xai = { apiKey: xaiKey };
      return ProviderSecretsSchema.parse(out);
    },
    async saveSecrets(): Promise<void> {
      throw new Error("Env secrets store is read-only");
    },
  };
}

/**
 * Read endpoint-style env vars and overlay them on top of `prefs`. Returns
 * a fresh `ProviderPreferences`. Used by the CLI runtime so users can run
 * `AZURE_OPENAI_ENDPOINT=... imagent image ...` without mutating config.json.
 *
 * Env-supplied values win over the file. No-op when no relevant vars are set.
 */
export function envProviderRoutingOverlay(
  env: NodeJS.ProcessEnv,
  prefs: ProviderPreferences,
): ProviderPreferences {
  const azureEndpoint = env[ENV_KEYS["azure-openai"].endpoint];
  const bdEndpoint = env[ENV_KEYS.bytedance.endpoint];
  if (!azureEndpoint && !bdEndpoint) return prefs;

  const next: ProviderPreferences = {
    ...prefs,
    "azure-openai": { ...(prefs["azure-openai"] ?? {}) },
    bytedance: { ...(prefs.bytedance ?? {}) },
  };
  if (azureEndpoint) {
    (next["azure-openai"] as ProviderRouting).endpoint = azureEndpoint;
  }
  if (bdEndpoint) {
    (next.bytedance as ProviderRouting).endpoint = bdEndpoint;
  }
  return ProviderPreferencesSchema.parse(next);
}

/**
 * Merges secrets stores in priority order. Later arguments win — pass env
 * last to override the file (CLI behaviour: env trumps secrets.json).
 */
export function mergeSecrets(...layers: ProviderSecrets[]): ProviderSecrets {
  const out: Record<string, unknown> = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      out[key] = { ...(out[key] as object | undefined), ...value };
    }
  }
  return ProviderSecretsSchema.parse(out);
}

function deepMergeSecrets(
  base: ProviderSecrets,
  patch: DeepPartial<ProviderSecrets>,
): ProviderSecrets {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = { ...(out[key] as object | undefined), ...value };
  }
  return out as ProviderSecrets;
}

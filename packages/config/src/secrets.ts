import { promises as fs } from "node:fs";
import path from "node:path";
import { type ProviderSecrets, ProviderSecretsSchema } from "./schema.js";
import type { DeepPartial, SecretsStore } from "./store.js";

/** Env var names per architecture.md / .env.example. */
const ENV_KEYS = {
  openai: { apiKey: "OPENAI_API_KEY" },
  "azure-openai": {
    apiKey: "AZURE_OPENAI_API_KEY",
    endpoint: "AZURE_OPENAI_ENDPOINT",
    apiVersion: "AZURE_OPENAI_API_VERSION",
  },
  google: { apiKey: "GOOGLE_API_KEY" },
  "flux-bfl": { apiKey: "FLUX_BFL_API_KEY" },
  volcengine: { apiKey: "VOLCENGINE_API_KEY", region: "VOLCENGINE_REGION" },
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
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(next, null, 2), "utf8");
      try {
        await fs.chmod(filePath, 0o600);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        // Windows NTFS doesn't expose POSIX bits; ignore the failure.
        if (code !== "EPERM" && code !== "ENOSYS" && code !== "ENOTSUP") {
          throw err;
        }
      }
    },
  };
}

/**
 * Reads secrets from the documented env vars. Only fields actually present
 * in the env are populated — partial provider records are dropped so the
 * resulting shape passes ProviderSecretsSchema.
 */
export function createEnvSecretsStore(env: NodeJS.ProcessEnv): SecretsStore {
  return {
    async loadSecrets(): Promise<ProviderSecrets> {
      const out: ProviderSecrets = {};
      const openaiKey = env[ENV_KEYS.openai.apiKey];
      if (openaiKey) out.openai = { apiKey: openaiKey };

      const azureKey = env[ENV_KEYS["azure-openai"].apiKey];
      const azureEndpoint = env[ENV_KEYS["azure-openai"].endpoint];
      if (azureKey && azureEndpoint) {
        out["azure-openai"] = {
          apiKey: azureKey,
          endpoint: azureEndpoint,
          apiVersion: env[ENV_KEYS["azure-openai"].apiVersion] ?? "2024-10-21",
        };
      }

      const googleKey = env[ENV_KEYS.google.apiKey];
      if (googleKey) out.google = { apiKey: googleKey };

      const fluxKey = env[ENV_KEYS["flux-bfl"].apiKey];
      if (fluxKey) out["flux-bfl"] = { apiKey: fluxKey };

      const volcKey = env[ENV_KEYS.volcengine.apiKey];
      if (volcKey) {
        out.volcengine = {
          apiKey: volcKey,
          region: env[ENV_KEYS.volcengine.region] ?? "cn-beijing",
        };
      }
      return ProviderSecretsSchema.parse(out);
    },
    async saveSecrets(): Promise<void> {
      throw new Error("Env secrets store is read-only");
    },
  };
}

/**
 * Electron safeStorage variant. Stub for M1 — wired in M4 alongside the
 * Electron main process and first-run secrets.json migration (architecture.md
 * §7.4).
 */
export function createElectronSecretsStore(_safeStorage: unknown): SecretsStore {
  return {
    async loadSecrets(): Promise<ProviderSecrets> {
      throw new Error("not implemented (M4)");
    },
    async saveSecrets(): Promise<void> {
      throw new Error("not implemented (M4)");
    },
  };
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

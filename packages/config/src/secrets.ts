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
 * Subset of Electron's `safeStorage` we depend on. Defining the interface
 * locally lets the config package avoid a hard dependency on `electron` (which
 * isn't installed in the CLI build path).
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface CreateElectronSecretsStoreOptions {
  safeStorage: SafeStorageLike;
  /** Encrypted blob path. Default: `<dataDir>/secrets.bin`. */
  binPath: string;
  /** Sibling plaintext path used for first-run migration. Default: `<dataDir>/secrets.json`. */
  jsonPath?: string;
  /** Logger; defaults to console for the migration message. */
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
  /** OS platform; default `process.platform`. Linux without keyring → fallback. */
  platform?: NodeJS.Platform;
}

/**
 * Electron `safeStorage`-backed secrets store. On first run, migrates a
 * plaintext `secrets.json` sibling into `secrets.bin` and unlinks the
 * original (architecture.md §7.4).
 *
 * If `safeStorage.isEncryptionAvailable()` returns false:
 *   - On Linux (where it can fail without a keyring), we fall back to the
 *     plaintext file store with a console warning.
 *   - On Windows + macOS, we throw — those should always have an OS-level
 *     credential store available.
 */
export function createElectronSecretsStore(
  opts: CreateElectronSecretsStoreOptions,
): SecretsStore {
  const platform = opts.platform ?? process.platform;
  const logger = opts.logger ?? {
    info: (msg) => console.info(msg),
    warn: (msg) => console.warn(msg),
  };
  const binPath = opts.binPath;
  const jsonPath = opts.jsonPath ?? path.join(path.dirname(binPath), "secrets.json");

  if (!opts.safeStorage.isEncryptionAvailable()) {
    if (platform === "linux") {
      logger.warn(
        "[secrets] safeStorage.isEncryptionAvailable() = false on Linux; " +
          "falling back to plaintext secrets.json (no system keyring)",
      );
      return createFileSecretsStore(jsonPath);
    }
    throw new Error(
      "Electron safeStorage encryption is unavailable on this platform — " +
        "expected on Windows + macOS. Refusing to write plaintext secrets.",
    );
  }

  let migrationLogged = false;

  async function migrateIfNeeded(): Promise<void> {
    // First-run migration: encrypted blob missing AND plaintext present.
    const binExists = await pathExists(binPath);
    if (binExists) return;
    const jsonExists = await pathExists(jsonPath);
    if (!jsonExists) return;
    const raw = await fs.readFile(jsonPath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn(`[secrets] could not parse plaintext ${jsonPath}: ${(err as Error).message}`);
      return;
    }
    const safe = ProviderSecretsSchema.parse(parsed);
    const encrypted = opts.safeStorage.encryptString(JSON.stringify(safe));
    await fs.mkdir(path.dirname(binPath), { recursive: true });
    await atomicWrite(binPath, encrypted);
    await fs.unlink(jsonPath);
    if (!migrationLogged) {
      logger.info(`[secrets] migrated plaintext secrets.json → encrypted secrets.bin`);
      migrationLogged = true;
    }
  }

  return {
    async loadSecrets(): Promise<ProviderSecrets> {
      await migrateIfNeeded();
      let raw: Buffer;
      try {
        raw = await fs.readFile(binPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return {};
        }
        throw err;
      }
      let plain: string;
      try {
        plain = opts.safeStorage.decryptString(raw);
      } catch (err) {
        throw new Error(
          `[secrets] failed to decrypt ${binPath}: ${(err as Error).message}. ` +
            "The OS keyring may have changed since the file was written.",
        );
      }
      const parsed = JSON.parse(plain);
      return ProviderSecretsSchema.parse(parsed);
    },
    async saveSecrets(patch): Promise<void> {
      await migrateIfNeeded();
      const current = await this.loadSecrets();
      const next = ProviderSecretsSchema.parse(deepMergeSecrets(current, patch));
      const encrypted = opts.safeStorage.encryptString(JSON.stringify(next));
      await fs.mkdir(path.dirname(binPath), { recursive: true });
      await atomicWrite(binPath, encrypted);
    },
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(filePath: string, bytes: Buffer): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, filePath);
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

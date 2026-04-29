import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type ConfigFile,
  ConfigFileSchema,
  DEFAULT_CONFIG,
  type ProviderSecrets,
} from "./schema.js";

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export interface ConfigStore {
  loadConfig(): Promise<ConfigFile>;
  saveConfig(patch: DeepPartial<ConfigFile>): Promise<ConfigFile>;
  watchConfig(cb: (c: ConfigFile) => void): () => void;
}

export interface SecretsStore {
  loadSecrets(): Promise<ProviderSecrets>;
  saveSecrets(patch: DeepPartial<ProviderSecrets>): Promise<void>;
}

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (patch === undefined || patch === null) return base;
  if (typeof base !== "object" || base === null) return patch as T;
  if (Array.isArray(base) || Array.isArray(patch)) return patch as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const baseValue = out[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue !== null &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      out[key] = deepMerge(
        baseValue as Record<string, unknown>,
        value as DeepPartial<Record<string, unknown>>,
      );
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * File-backed config.json store. Reads on every loadConfig (cheap; not hot-
 * pathed). Applies DEFAULT_CONFIG when the file is missing.
 */
export function createFileConfigStore(filePath: string): ConfigStore {
  return {
    async loadConfig(): Promise<ConfigFile> {
      let raw: string;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          await ensureDir(path.dirname(filePath));
          await fs.writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
          return DEFAULT_CONFIG;
        }
        throw err;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        throw new Error(`config.json at ${filePath} is not valid JSON: ${(err as Error).message}`);
      }

      const merged = deepMerge(DEFAULT_CONFIG, parsed as DeepPartial<ConfigFile>);
      return ConfigFileSchema.parse(merged);
    },
    async saveConfig(patch): Promise<ConfigFile> {
      const current = await this.loadConfig();
      const next = ConfigFileSchema.parse(deepMerge(current, patch));
      await ensureDir(path.dirname(filePath));
      await atomicWriteText(filePath, JSON.stringify(next, null, 2));
      return next;
    },
    watchConfig(_cb): () => void {
      // M4: fs.watch on filePath, debounced reload, dispatch via cb.
      return () => {};
    },
  };
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function atomicWriteText(filePath: string, text: string): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, filePath);
}

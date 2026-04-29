import {
  type ProviderSecrets,
  ProviderSecretsSchema,
  createFileSecretsStore,
} from "@imagine-studio/config";
import { createPathResolver, ensureDataDir } from "@imagine-studio/persistence";
import chalk from "chalk";
import type { Command } from "commander";

/**
 * `imagine config set <vendor>.<key> <value>`
 * `imagine config get <vendor>.<key>`
 * `imagine config path`
 *
 * Walks the dotted path against the secrets schema; recognised vendors are
 * the ProviderSecretsSchema keys (openai | azure-openai | google | flux-bfl |
 * volcengine). M2 ships secrets-only support; richer config.json mutation
 * lands in M3.
 */
export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Inspect and edit ~/.imagine-studio/config.json and secrets.json");

  config
    .command("set <key> <value>")
    .description("Set a secret (e.g. openai.apiKey, volcengine.region)")
    .action(async (key: string, value: string) => {
      try {
        await runSet(key, value);
      } catch (err) {
        process.stderr.write(`config set failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  config
    .command("get [key]")
    .description("Print a secret value (apiKey fields are masked)")
    .action(async (key: string | undefined) => {
      try {
        await runGet(key);
      } catch (err) {
        process.stderr.write(`config get failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  config
    .command("path")
    .description("Print the absolute config.json and secrets.json paths")
    .action(async () => {
      const resolver = createPathResolver();
      process.stdout.write(`config:  ${resolver.configFile()}\n`);
      process.stdout.write(`secrets: ${resolver.secretsFile()}\n`);
    });
}

const VENDOR_KEYS = ["openai", "azure-openai", "google", "flux-bfl", "volcengine", "xai"] as const;
type VendorId = (typeof VENDOR_KEYS)[number];

function isVendorKey(s: string): s is VendorId {
  return (VENDOR_KEYS as readonly string[]).includes(s);
}

async function runSet(dottedKey: string, value: string): Promise<void> {
  const { vendor, field } = parseKey(dottedKey);
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const store = createFileSecretsStore(resolver.secretsFile());
  const current = await store.loadSecrets();

  // Build the patch precisely, validating against the schema. We construct
  // the merged record manually because zod default-value sub-schemas refuse
  // to round-trip through DeepPartial.
  const merged = applyPatch(current, vendor, field, value);
  // Ensure the result still parses (schema enforces required fields).
  ProviderSecretsSchema.parse(merged);
  await store.saveSecrets(merged);
  process.stdout.write("OK\n");
}

async function runGet(dottedKey: string | undefined): Promise<void> {
  const resolver = createPathResolver();
  const store = createFileSecretsStore(resolver.secretsFile());
  const secrets = await store.loadSecrets();

  if (!dottedKey) {
    // Print all keys, masking sensitive fields.
    process.stdout.write(`${JSON.stringify(maskSecrets(secrets), null, 2)}\n`);
    return;
  }

  const { vendor, field } = parseKey(dottedKey);
  const block = (secrets as Record<string, Record<string, string>>)[vendor];
  if (!block) {
    process.stdout.write(`${chalk.dim(`${vendor} not configured`)}\n`);
    return;
  }
  const raw = block[field];
  if (raw === undefined) {
    process.stdout.write(`${chalk.dim(`${dottedKey} not set`)}\n`);
    return;
  }
  process.stdout.write(`${maskIfSensitive(field, raw)}\n`);
}

function parseKey(dottedKey: string): { vendor: VendorId; field: string } {
  const idx = dottedKey.indexOf(".");
  if (idx <= 0) {
    throw new Error(`expected '<vendor>.<key>' (got '${dottedKey}')`);
  }
  const vendor = dottedKey.slice(0, idx);
  const field = dottedKey.slice(idx + 1);
  if (!isVendorKey(vendor)) {
    throw new Error(
      `unknown vendor '${vendor}'. Expected one of: ${VENDOR_KEYS.join(", ")}`,
    );
  }
  if (!field) {
    throw new Error(`missing field name (got '${dottedKey}')`);
  }
  return { vendor, field };
}

function applyPatch(
  current: ProviderSecrets,
  vendor: VendorId,
  field: string,
  value: string,
): ProviderSecrets {
  const next: Record<string, Record<string, string>> = {
    ...(current as unknown as Record<string, Record<string, string>>),
  };
  const block = { ...(next[vendor] ?? {}) };
  block[field] = value;
  // Apply default region/apiVersion so the schema's required fields are
  // satisfied when the user sets the apiKey first.
  if (vendor === "volcengine") {
    block.region ??= "cn-beijing";
  }
  if (vendor === "azure-openai") {
    block.apiVersion ??= "2024-10-21";
  }
  next[vendor] = block;
  return next as unknown as ProviderSecrets;
}

function maskSecrets(s: ProviderSecrets): unknown {
  const out: Record<string, Record<string, string>> = {};
  for (const [vendor, block] of Object.entries(s)) {
    if (!block) continue;
    out[vendor] = {};
    for (const [k, v] of Object.entries(block)) {
      out[vendor]![k] = maskIfSensitive(k, v);
    }
  }
  return out;
}

function maskIfSensitive(field: string, value: string): string {
  const lower = field.toLowerCase();
  if (lower.includes("apikey") || lower.endsWith("key")) {
    return mask(value);
  }
  return value;
}

function mask(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

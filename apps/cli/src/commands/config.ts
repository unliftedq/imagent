import { promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import {
  createFileConfigStore,
  createFileSecretsStore,
  DEFAULT_CONFIG,
  type ProviderSecrets,
  ProviderSecretsSchema,
} from "@imagent/config";
import { createPathResolver, ensureDataDir } from "@imagent/persistence";
import { getBundledCatalog, loadCatalog, saveCatalog } from "@imagent/providers";
import chalk from "chalk";
import type { Command } from "commander";

import { loadCliRuntime } from "./runtime.js";

/**
 * `imagent config set <vendor>.<key> <value>`
 * `imagent config get <vendor>.<key>`
 * `imagent config path`
 * `imagent config reset <target>`
 *
 * Walks the dotted path against the known provider config keys. API keys are
 * written to secrets.json; non-sensitive routing fields are written to
 * config.json under providers.<id>. Use `imagent config provider ...` to manage
 * Azure deployments and custom OpenAI-compatible model mappings.
 *
 * Recognised paths:
 *   - `<vendor>.apiKey`
 *   - `azure-openai.endpoint`
 *   - `bytedance.endpoint`
 *   - any `<vendor>.baseUrl` (advanced override)
 *
 * Anything else (e.g. `<vendor>.models`, `<vendor>.defaultModel`) is rejected
 * with `unknown config path: <key>`.
 *
 * `reset <target>` rewrites one of the on-disk files to its default state:
 *   - `catalog`  → ~/.imagent/catalog.json with bundled-default catalog
 *   - `secrets`  → ~/.imagent/secrets.json cleared to `{}`
 *   - `config`   → ~/.imagent/config.json with default preferences
 */
export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description(
      [
        "Inspect and edit local provider credentials in ~/.imagent/secrets.json (and the preferences file at ~/.imagent/config.json).",
        "",
        "Recognised dotted keys: <vendor>.apiKey, azure-openai.endpoint, bytedance.endpoint, <vendor>.baseUrl.",
        "Vendors: openai | azure-openai | google | flux-bfl | bytedance | xai.",
        "Use `imagent models` and `imagent options` to inspect the model catalog instead of reading catalog.json by hand.",
      ].join("\n"),
    );

  config
    .command("set <key> <value>")
    .description(
      "Set a secret. Examples: `imagent config set openai.apiKey sk-...`, `imagent config set azure-openai.endpoint https://...`, `imagent config set bytedance.endpoint https://ark.cn-beijing.volces.com`.",
    )
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
    .description(
      "Print a secret value (apiKey fields are masked). Omit [key] to dump every configured secret as JSON.",
    )
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
    .description("Print the absolute paths of config.json, catalog.json, and secrets.json")
    .action(async () => {
      const resolver = createPathResolver();
      await ensureDataDir(resolver);
      await createFileConfigStore(resolver.configFile()).loadConfig();
      await createFileSecretsStore(resolver.secretsFile()).loadSecrets();
      await loadCatalog({ path: resolver.catalogFile() });
      process.stdout.write(`config:  ${resolver.configFile()}\n`);
      process.stdout.write(`catalog: ${resolver.catalogFile()}\n`);
      process.stdout.write(`secrets: ${resolver.secretsFile()}\n`);
    });

  config
    .command("reset <target>")
    .description(
      "Reset a state file to its default. <target> is one of: catalog | secrets | config. Pass --force to skip the confirmation prompt.",
    )
    .option("--force", "Skip the confirmation prompt", false)
    .action(async (target: string, options: { force?: boolean }) => {
      try {
        await runReset(target, options);
      } catch (err) {
        process.stderr.write(`config reset failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  // ----- provider routing (Azure deployments + custom OpenAI providers) -----
  const provider = config
    .command("provider")
    .description(
      [
        "Manage per-user provider routing in config.json (Azure deployment names, custom OpenAI-compatible model lists).",
        "",
        "Use this when you have an Azure deployment named differently from the canonical model id, or when registering a custom OpenAI-compatible provider's models. The runtime merges these entries on top of the bundled catalog.",
      ].join("\n"),
    );

  provider
    .command("add <provider> <id>")
    .description(
      "Register an offering. <provider> is `azure-openai` or a custom provider id; <id> is the deployment/model id the provider exposes. Pass --model <canonical-id> to bind it to a catalog model.",
    )
    .requiredOption(
      "--model <canonical-id>",
      "Canonical model id (see `imagent models --json`); the offering inherits its capabilities/defaults",
    )
    .option("--kind <kind>", "image | video (default: image)", "image")
    .option("--display-name <name>", "Optional friendly name shown in `imagent models`")
    .option(
      "--display-name-provider <name>",
      "Override the provider's display name (custom providers; saved to config.providers.<id>.displayName)",
    )
    .action(
      async (
        providerId: string,
        offeringId: string,
        options: {
          model: string;
          kind?: string;
          displayName?: string;
          displayNameProvider?: string;
        },
      ) => {
        try {
          await runProviderAdd(providerId, offeringId, options);
        } catch (err) {
          process.stderr.write(`config provider add failed: ${(err as Error).message}\n`);
          process.exitCode = 1;
        }
      },
    );

  provider
    .command("rm <provider> <id>")
    .description("Remove an offering from the provider's routing list.")
    .option("--kind <kind>", "image | video (default: image)", "image")
    .action(async (providerId: string, offeringId: string, options: { kind?: string }) => {
      try {
        await runProviderRm(providerId, offeringId, options);
      } catch (err) {
        process.stderr.write(`config provider rm failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  provider
    .command("list [provider]")
    .description(
      "Print the per-user routing block for a single provider, or every configured provider when [provider] is omitted.",
    )
    .option("--json", "Emit machine-readable JSON instead of the human-friendly table", false)
    .action(async (providerId: string | undefined, options: { json?: boolean }) => {
      try {
        await runProviderList(providerId, options);
      } catch (err) {
        process.stderr.write(`config provider list failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });
}

const VENDOR_KEYS = ["openai", "azure-openai", "google", "flux-bfl", "bytedance", "xai"] as const;
type VendorId = (typeof VENDOR_KEYS)[number];

const RESET_TARGETS = ["catalog", "secrets", "config"] as const;
type ResetTarget = (typeof RESET_TARGETS)[number];

/**
 * Allow-listed dotted-key fields per vendor. Each entry routes to either the
 * secrets store (sensitive) or the config store (per-user routing). Anything
 * outside this map is rejected with `unknown config path`.
 */
type FieldStore = "secrets" | "config";
interface FieldDef {
  store: FieldStore;
}
const ALLOWED_FIELDS: Record<VendorId, Record<string, FieldDef>> = {
  openai: { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
  "azure-openai": { apiKey: { store: "secrets" }, endpoint: { store: "config" } },
  google: { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
  "flux-bfl": { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
  bytedance: { apiKey: { store: "secrets" }, endpoint: { store: "config" } },
  xai: { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
};

function isVendorKey(s: string): s is VendorId {
  return (VENDOR_KEYS as readonly string[]).includes(s);
}

function isResetTarget(s: string): s is ResetTarget {
  return (RESET_TARGETS as readonly string[]).includes(s);
}

async function runSet(dottedKey: string, value: string): Promise<void> {
  const { vendor, field } = parseKey(dottedKey);
  const fieldDef = ALLOWED_FIELDS[vendor][field];
  if (!fieldDef) {
    throw new Error(
      `unknown config path: ${dottedKey}. ` +
        `Allowed for ${vendor}: ${Object.keys(ALLOWED_FIELDS[vendor]).join(", ")}`,
    );
  }
  // Trigger the routing migration before mutating either file so legacy
  // endpoint/baseUrl values stuck in secrets.json don't shadow new writes.
  await loadCliRuntime();
  const resolver = createPathResolver();
  await ensureDataDir(resolver);

  if (fieldDef.store === "secrets") {
    const store = createFileSecretsStore(resolver.secretsFile());
    const current = await store.loadSecrets();
    const merged = applyPatch(current, vendor, field, value);
    ProviderSecretsSchema.parse(merged);
    await store.saveSecrets(merged);
  } else {
    const store = createFileConfigStore(resolver.configFile());
    const config = await store.loadConfig();
    const block = (config.providers as Record<string, Record<string, unknown>>)[vendor] ?? {};
    const nextBlock = { ...block, [field]: value };
    const nextProviders = { ...config.providers, [vendor]: nextBlock };
    await store.saveConfig({ providers: nextProviders });
  }
  process.stdout.write("OK\n");
}

async function runGet(dottedKey: string | undefined): Promise<void> {
  // Run migration so reads see the post-split file shape.
  await loadCliRuntime();
  const resolver = createPathResolver();
  const secrets = await createFileSecretsStore(resolver.secretsFile()).loadSecrets();
  const config = await createFileConfigStore(resolver.configFile()).loadConfig();

  if (!dottedKey) {
    const view = combinedConfigView(secrets, config.providers);
    process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
    return;
  }

  const { vendor, field } = parseKey(dottedKey);
  const fieldDef = ALLOWED_FIELDS[vendor][field];
  if (!fieldDef) {
    throw new Error(
      `unknown config path: ${dottedKey}. ` +
        `Allowed for ${vendor}: ${Object.keys(ALLOWED_FIELDS[vendor]).join(", ")}`,
    );
  }
  const value =
    fieldDef.store === "secrets"
      ? (secrets as Record<string, Record<string, string> | undefined>)[vendor]?.[field]
      : (config.providers as Record<string, Record<string, unknown> | undefined>)[vendor]?.[field];
  if (value === undefined) {
    process.stdout.write(`${chalk.dim(`${dottedKey} not set`)}\n`);
    return;
  }
  if (fieldDef.store === "secrets") {
    process.stdout.write(`${maskIfSensitive(field, String(value))}\n`);
  } else {
    process.stdout.write(`${String(value)}\n`);
  }
}

function combinedConfigView(
  secrets: ProviderSecrets,
  providers: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, Record<string, string>> = {};
  for (const [vendor, fields] of Object.entries(ALLOWED_FIELDS)) {
    const merged: Record<string, string> = {};
    for (const [field, def] of Object.entries(fields)) {
      const v =
        def.store === "secrets"
          ? (secrets as Record<string, Record<string, string> | undefined>)[vendor]?.[field]
          : (providers as Record<string, Record<string, unknown> | undefined>)[vendor]?.[field];
      if (v === undefined) continue;
      merged[field] = def.store === "secrets" ? maskIfSensitive(field, String(v)) : String(v);
    }
    if (Object.keys(merged).length > 0) out[vendor] = merged;
  }
  return out;
}

async function runReset(rawTarget: string, options: { force?: boolean }): Promise<void> {
  if (!isResetTarget(rawTarget)) {
    throw new Error(
      `unknown reset target '${rawTarget}'. Expected one of: ${RESET_TARGETS.join(", ")}`,
    );
  }
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const targetPath = resetPathFor(rawTarget, resolver);
  const intent = resetIntentFor(rawTarget);

  if (!options.force && !(await confirm(`${chalk.yellow(intent)} ${targetPath}. Continue? [y/N] `))) {
    process.stdout.write("aborted\n");
    return;
  }

  switch (rawTarget) {
    case "catalog": {
      await saveCatalog(getBundledCatalog(), { path: targetPath });
      break;
    }
    case "secrets": {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, "{}\n", "utf8");
      try {
        await fs.chmod(targetPath, 0o600);
      } catch {
        // chmod is a no-op on Windows; ignore.
      }
      break;
    }
    case "config": {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
      break;
    }
  }
  process.stdout.write(`reset ${targetPath}\n`);
}

function resetPathFor(target: ResetTarget, resolver: ReturnType<typeof createPathResolver>): string {
  switch (target) {
    case "catalog":
      return resolver.catalogFile();
    case "secrets":
      return resolver.secretsFile();
    case "config":
      return resolver.configFile();
  }
}

function resetIntentFor(target: ResetTarget): string {
  switch (target) {
    case "catalog":
      return "This will overwrite the catalog with the bundled default at";
    case "secrets":
      return "This will clear all secrets at";
    case "config":
      return "This will reset preferences to defaults at";
  }
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(prompt);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

// ----- provider routing helpers ------------------------------------------

interface ProviderAddOptions {
  model: string;
  kind?: string;
  displayName?: string;
  displayNameProvider?: string;
}

const BUILT_IN_ROUTING_IDS = new Set<string>([
  "openai",
  "azure-openai",
  "google",
  "flux-bfl",
  "bytedance",
  "xai",
]);

function normalizeRoutingKind(kind: string | undefined): "image" | "video" {
  const k = (kind ?? "image").toLowerCase();
  if (k !== "image" && k !== "video") {
    throw new Error(`--kind must be 'image' or 'video' (got '${kind}')`);
  }
  return k;
}

async function runProviderAdd(
  providerId: string,
  offeringId: string,
  options: ProviderAddOptions,
): Promise<void> {
  const kind = normalizeRoutingKind(options.kind);
  const isBuiltIn = BUILT_IN_ROUTING_IDS.has(providerId);
  if (!isBuiltIn && !/^[a-z0-9][a-z0-9_-]*$/.test(providerId)) {
    throw new Error(
      `provider id '${providerId}' must be lowercase letters, numbers, hyphens, or underscores`,
    );
  }
  // Run the routing migration before mutating config so legacy catalog
  // entries don't surprise the user.
  await loadCliRuntime();
  const resolver = createPathResolver();
  await ensureDataDir(resolver);

  // Validate the canonical model id against the user's catalog so we fail
  // fast on typos instead of waiting for a runtime mismatch.
  const catalog = await loadCatalog({ path: resolver.catalogFile() });
  const canonical = catalog.models[kind][options.model];
  if (!canonical) {
    const known = Object.keys(catalog.models[kind]).join(", ");
    throw new Error(`canonical ${kind} model '${options.model}' not found. Known: ${known}`);
  }

  const store = createFileConfigStore(resolver.configFile());
  const config = await store.loadConfig();
  const block = readRoutingBlock(config.providers, providerId, isBuiltIn);
  const list = [...((block[kind] as Array<{ id: string }> | undefined) ?? [])];
  const existingIdx = list.findIndex((entry) => entry.id === offeringId);
  const offering: { id: string; modelId: string; displayName?: string } = {
    id: offeringId,
    modelId: options.model,
  };
  if (options.displayName?.trim()) offering.displayName = options.displayName.trim();
  if (existingIdx === -1) list.push(offering);
  else list[existingIdx] = offering;

  const nextBlock = { ...block, [kind]: list };
  if (!isBuiltIn && options.displayNameProvider?.trim()) {
    nextBlock.displayName = options.displayNameProvider.trim();
  }
  const nextProviders = writeRoutingBlock(config.providers, providerId, isBuiltIn, nextBlock);
  await store.saveConfig({ providers: nextProviders });
  process.stdout.write(
    `${chalk.green("ok:")} ${providerId} ${kind} '${offeringId}' → '${options.model}'\n`,
  );
}

async function runProviderRm(
  providerId: string,
  offeringId: string,
  options: { kind?: string },
): Promise<void> {
  const kind = normalizeRoutingKind(options.kind);
  const isBuiltIn = BUILT_IN_ROUTING_IDS.has(providerId);
  await loadCliRuntime();
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const store = createFileConfigStore(resolver.configFile());
  const config = await store.loadConfig();
  const block = readRoutingBlock(config.providers, providerId, isBuiltIn);
  const list = ((block[kind] as Array<{ id: string }> | undefined) ?? []).filter(
    (entry) => entry.id !== offeringId,
  );
  const nextBlock = { ...block, [kind]: list };
  if (list.length === 0) delete nextBlock[kind];
  const nextProviders = writeRoutingBlock(config.providers, providerId, isBuiltIn, nextBlock);
  await store.saveConfig({ providers: nextProviders });
  process.stdout.write(`${chalk.green("ok:")} removed ${providerId} ${kind} '${offeringId}'\n`);
}

async function runProviderList(
  providerId: string | undefined,
  options: { json?: boolean },
): Promise<void> {
  await loadCliRuntime();
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const config = await createFileConfigStore(resolver.configFile()).loadConfig();
  const summary: Record<string, unknown> = {};
  for (const id of [...BUILT_IN_ROUTING_IDS]) {
    const block = readRoutingBlock(config.providers, id, true);
    if (hasRouting(block)) summary[id] = block;
  }
  for (const [id, block] of Object.entries(config.providers.customOpenAI ?? {})) {
    if (hasRouting(block)) summary[id] = block;
  }
  if (providerId) {
    const block = summary[providerId];
    if (!block) {
      process.stdout.write(`${chalk.dim(`${providerId}: no routing configured`)}\n`);
      return;
    }
    if (options.json) {
      process.stdout.write(`${JSON.stringify(block, null, 2)}\n`);
    } else {
      formatRouting(providerId, block as Record<string, unknown>);
    }
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (Object.keys(summary).length === 0) {
    process.stdout.write(`${chalk.dim("no per-user routing configured")}\n`);
    return;
  }
  for (const [id, block] of Object.entries(summary)) {
    formatRouting(id, block as Record<string, unknown>);
  }
}

function readRoutingBlock(
  providers: Record<string, unknown>,
  providerId: string,
  isBuiltIn: boolean,
): Record<string, unknown> {
  if (isBuiltIn) {
    return { ...((providers[providerId] as Record<string, unknown> | undefined) ?? {}) };
  }
  const custom = (providers.customOpenAI ?? {}) as Record<string, Record<string, unknown>>;
  return { ...(custom[providerId] ?? {}) };
}

function writeRoutingBlock(
  providers: Record<string, unknown>,
  providerId: string,
  isBuiltIn: boolean,
  block: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...providers };
  if (isBuiltIn) {
    next[providerId] = block;
    return next;
  }
  const custom = { ...((next.customOpenAI as Record<string, unknown> | undefined) ?? {}) };
  custom[providerId] = block;
  next.customOpenAI = custom;
  return next;
}

function hasRouting(block: Record<string, unknown>): boolean {
  const image = (block.image as unknown[] | undefined)?.length ?? 0;
  const video = (block.video as unknown[] | undefined)?.length ?? 0;
  return image > 0 || video > 0 || typeof block.displayName === "string";
}

function formatRouting(providerId: string, block: Record<string, unknown>): void {
  process.stdout.write(`${chalk.bold(providerId)}\n`);
  if (typeof block.displayName === "string") {
    process.stdout.write(`  ${chalk.dim("displayName:")} ${block.displayName}\n`);
  }
  for (const kind of ["image", "video"] as const) {
    const list = (block[kind] as Array<{ id: string; modelId: string; displayName?: string }> | undefined) ?? [];
    if (list.length === 0) continue;
    process.stdout.write(`  ${chalk.cyan(`${kind}:`)}\n`);
    for (const entry of list) {
      const display = entry.displayName ? chalk.dim(` — ${entry.displayName}`) : "";
      process.stdout.write(`    ${entry.id} ${chalk.dim("→")} ${entry.modelId}${display}\n`);
    }
  }
}

function parseKey(dottedKey: string): { vendor: VendorId; field: string } {
  const idx = dottedKey.indexOf(".");
  if (idx <= 0) {
    throw new Error(`expected '<vendor>.<key>' (got '${dottedKey}')`);
  }
  const vendor = dottedKey.slice(0, idx);
  const field = dottedKey.slice(idx + 1);
  if (!isVendorKey(vendor)) {
    throw new Error(`unknown vendor '${vendor}'. Expected one of: ${VENDOR_KEYS.join(", ")}`);
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
  next[vendor] = block;
  return next as unknown as ProviderSecrets;
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

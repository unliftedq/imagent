import {
  createFileConfigStore,
  createFileSecretsStore,
  type DefaultModelPreference,
  type ProviderSecrets,
  ProviderSecretsSchema,
} from "@imagent/config";
import { createPathResolver, ensureDataDir } from "@imagent/persistence";
import chalk from "chalk";

import { loadCliRuntime } from "../runtime.js";
import {
  ALLOWED_FIELDS,
  applyPatch,
  defaultModelFieldFor,
  formatDefaultModelValue,
  maskIfSensitive,
  parseDefaultModelValue,
  parseKey,
} from "./shared.js";

export async function runSet(dottedKey: string, value: string): Promise<void> {
  const defaultModelField = defaultModelFieldFor(dottedKey);
  if (defaultModelField) {
    const parsed = parseDefaultModelValue(value);
    const runtime = await loadCliRuntime();
    if (!validateConfiguredDefaultModel(defaultModelField, parsed, runtime)) return;
    const resolver = createPathResolver();
    await ensureDataDir(resolver);
    const store = createFileConfigStore(resolver.configFile());
    await store.saveConfig({ app: { [defaultModelField]: parsed } });
    process.stdout.write("OK\n");
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

export async function runGet(dottedKey: string | undefined): Promise<void> {
  await loadCliRuntime();
  const resolver = createPathResolver();
  const secrets = await createFileSecretsStore(resolver.secretsFile()).loadSecrets();
  const config = await createFileConfigStore(resolver.configFile()).loadConfig();

  if (!dottedKey) {
    const view = combinedConfigView(secrets, config.providers);
    view.app = defaultModelConfigView(config.app);
    process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
    return;
  }

  const defaultModelField = defaultModelFieldFor(dottedKey);
  if (defaultModelField) {
    const value = config.app[defaultModelField];
    if (!value) {
      process.stdout.write(`${chalk.dim(`${dottedKey} not set`)}\n`);
      return;
    }
    process.stdout.write(`${formatDefaultModelValue(value)}\n`);
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

function validateConfiguredDefaultModel(
  field: "defaultImageModel" | "defaultVideoModel",
  value: DefaultModelPreference,
  runtime: Awaited<ReturnType<typeof loadCliRuntime>>,
): boolean {
  const kind = field === "defaultImageModel" ? "image" : "video";
  const registry = kind === "image" ? runtime.imageRegistry : runtime.videoRegistry;
  const provider = registry.get(value.providerId);
  if (!provider) {
    process.stderr.write(
      `${chalk.yellow("warn:")} ${kind} provider '${value.providerId}' is not configured; default model was not changed\n`,
    );
    return false;
  }
  if (!provider.models.has(value.modelId)) {
    process.stderr.write(
      `${chalk.yellow("warn:")} ${kind} model '${value.modelId}' is not available for configured provider '${value.providerId}'; default model was not changed\n`,
    );
    return false;
  }
  return true;
}

function defaultModelConfigView(app: {
  defaultImageModel: DefaultModelPreference | null;
  defaultVideoModel: DefaultModelPreference | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (app.defaultImageModel) out.defaultImageModel = formatDefaultModelValue(app.defaultImageModel);
  if (app.defaultVideoModel) out.defaultVideoModel = formatDefaultModelValue(app.defaultVideoModel);
  return out;
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

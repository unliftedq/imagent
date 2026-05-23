import { createFileConfigStore } from "@imagent/config";
import { createPathResolver, ensureDataDir } from "@imagent/persistence";
import { loadCatalog } from "@imagent/providers";
import chalk from "chalk";

import { loadCliRuntime } from "../runtime.js";

export interface ProviderAddOptions {
  model: string;
  kind?: string;
  displayName?: string;
  displayNameProvider?: string;
}

const BUILT_IN_ROUTING_IDS = new Set<string>([
  "openai",
  "azure",
  "google",
  "flux-bfl",
  "byteplus",
  "volcengine",
  "xai",
]);

export async function runProviderAdd(
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
  await loadCliRuntime();
  const resolver = createPathResolver();
  await ensureDataDir(resolver);

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

export async function runProviderRm(
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

export async function runProviderList(
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

function normalizeRoutingKind(kind: string | undefined): "image" | "video" {
  const k = (kind ?? "image").toLowerCase();
  if (k !== "image" && k !== "video") {
    throw new Error(`--kind must be 'image' or 'video' (got '${kind}')`);
  }
  return k;
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
    const list =
      (block[kind] as Array<{ id: string; modelId: string; displayName?: string }> | undefined) ??
      [];
    if (list.length === 0) continue;
    process.stdout.write(`  ${chalk.cyan(`${kind}:`)}\n`);
    for (const entry of list) {
      const display = entry.displayName ? chalk.dim(` — ${entry.displayName}`) : "";
      process.stdout.write(`    ${entry.id} ${chalk.dim("→")} ${entry.modelId}${display}\n`);
    }
  }
}

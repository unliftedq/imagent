export interface ModelsOptions {
  kind?: string;
  provider?: string;
  configured?: boolean;
  json?: boolean;
}

export interface OptionsCommandArgs {
  provider?: string;
  model?: string;
  kind?: string;
  json?: boolean;
}

export interface OptionDescriptor {
  key: string;
  allowed?: string[];
  note?: string;
}

export type ModelKind = "image" | "video" | "speech";

export function isProviderConfigured(
  providerId: string,
  imageRegistry: ReadonlyMap<string, unknown>,
  videoRegistry: ReadonlyMap<string, unknown>,
  speechRegistry: ReadonlyMap<string, unknown>,
): boolean {
  return imageRegistry.has(providerId) || videoRegistry.has(providerId) || speechRegistry.has(providerId);
}

export function normalizeKind(kind: string | undefined): ModelKind | undefined {
  if (!kind) return undefined;
  const lower = kind.toLowerCase();
  if (lower !== "image" && lower !== "video" && lower !== "speech") {
    throw new Error(`--kind must be 'image', 'video', or 'speech' (got '${kind}')`);
  }
  return lower;
}

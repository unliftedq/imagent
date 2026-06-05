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

export type ModelKind = "image" | "video" | "audio";

export function isProviderConfigured(
  providerId: string,
  imageRegistry: ReadonlyMap<string, unknown>,
  videoRegistry: ReadonlyMap<string, unknown>,
  audioRegistry: ReadonlyMap<string, unknown>,
): boolean {
  return imageRegistry.has(providerId) || videoRegistry.has(providerId) || audioRegistry.has(providerId);
}

export function normalizeKind(kind: string | undefined): ModelKind | undefined {
  if (!kind) return undefined;
  const lower = kind.toLowerCase();
  if (lower !== "image" && lower !== "video" && lower !== "audio") {
    throw new Error(`--kind must be 'image', 'video', or 'audio' (got '${kind}')`);
  }
  return lower;
}

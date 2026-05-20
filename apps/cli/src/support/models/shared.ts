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

export function isProviderConfigured(
  providerId: string,
  imageRegistry: ReadonlyMap<string, unknown>,
  videoRegistry: ReadonlyMap<string, unknown>,
): boolean {
  return imageRegistry.has(providerId) || videoRegistry.has(providerId);
}

export function normalizeKind(kind: string | undefined): "image" | "video" | undefined {
  if (!kind) return undefined;
  const lower = kind.toLowerCase();
  if (lower !== "image" && lower !== "video") {
    throw new Error(`--kind must be 'image' or 'video' (got '${kind}')`);
  }
  return lower;
}

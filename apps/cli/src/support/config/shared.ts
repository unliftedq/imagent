import type {
  DefaultModelPreference,
  ProviderSecrets,
} from "@imagent/config";

export const VENDOR_KEYS = [
  "openai",
  "azure",
  "google",
  "flux-bfl",
  "byteplus",
  "volcengine",
  "xai",
  "minimax",
  "elevenlabs",
] as const;
export type VendorId = (typeof VENDOR_KEYS)[number];

export const RESET_TARGETS = ["catalog", "secrets", "config"] as const;
export type ResetTarget = (typeof RESET_TARGETS)[number];

export type FieldStore = "secrets" | "config";
export interface FieldDef {
  store: FieldStore;
}
export const ALLOWED_FIELDS: Record<VendorId, Record<string, FieldDef>> = {
  openai: { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
  azure: { apiKey: { store: "secrets" }, endpoint: { store: "config" } },
  google: { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
  "flux-bfl": { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
  byteplus: { apiKey: { store: "secrets" }, endpoint: { store: "config" } },
  volcengine: { apiKey: { store: "secrets" }, endpoint: { store: "config" } },
  xai: { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
  minimax: { apiKey: { store: "secrets" }, baseUrl: { store: "config" }, groupId: { store: "config" } },
  elevenlabs: { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
};

type DefaultModelConfigKey = "image.defaultModel" | "video.defaultModel" | "audio.defaultModel";
const DEFAULT_MODEL_KEYS: Record<
  DefaultModelConfigKey,
  "defaultImageModel" | "defaultVideoModel" | "defaultAudioModel"
> = {
  "image.defaultModel": "defaultImageModel",
  "video.defaultModel": "defaultVideoModel",
  "audio.defaultModel": "defaultAudioModel",
};

export function isVendorKey(s: string): s is VendorId {
  return (VENDOR_KEYS as readonly string[]).includes(s);
}

export function isResetTarget(s: string): s is ResetTarget {
  return (RESET_TARGETS as readonly string[]).includes(s);
}

export function defaultModelFieldFor(
  dottedKey: string,
): "defaultImageModel" | "defaultVideoModel" | "defaultAudioModel" | null {
  if (dottedKey === "app.defaultImageModel") return "defaultImageModel";
  if (dottedKey === "app.defaultVideoModel") return "defaultVideoModel";
  if (dottedKey === "app.defaultAudioModel") return "defaultAudioModel";
  return DEFAULT_MODEL_KEYS[dottedKey as DefaultModelConfigKey] ?? null;
}

export function parseDefaultModelValue(value: string): DefaultModelPreference {
  const separator = value.indexOf(":");
  if (separator === -1 || separator === 0 || separator === value.length - 1) {
    throw new Error("default model must be formatted as <provider>:<model>");
  }
  return {
    providerId: value.slice(0, separator),
    modelId: value.slice(separator + 1),
  };
}

export function formatDefaultModelValue(value: DefaultModelPreference): string {
  return `${value.providerId}:${value.modelId}`;
}

export function parseKey(dottedKey: string): { vendor: VendorId; field: string } {
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

export function applyPatch(
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

export function maskIfSensitive(field: string, value: string): string {
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

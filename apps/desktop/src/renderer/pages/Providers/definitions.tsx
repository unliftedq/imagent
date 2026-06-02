import type {
  MaskedSecrets,
  ModelCatalogPayload,
  ProviderPreferencesPayload,
  ProviderRoutingPayload,
  SecretsWrite,
} from "@imagent/ipc";
import azureUrl from "../../assets/logos/azure.svg?url";
import bflUrl from "../../assets/logos/bfl.svg?url";
import bytedanceUrl from "../../assets/logos/bytedance.svg?url";
import googleUrl from "../../assets/logos/google.svg?url";
import minimaxUrl from "../../assets/logos/minimax.svg?url";
import openaiUrl from "../../assets/logos/openai.svg?url";
import volcengineUrl from "../../assets/logos/volcengine.svg?url";
import xaiUrl from "../../assets/logos/xai.svg?url";
import type { MessageKey } from "../../i18n/index.js";

export interface BuiltInProvider {
  id: string;
  name: string;
  description: string;
  /** URL of the provider's brand SVG (downloaded from Lobehub's CDN). */
  iconSrc: string;
  /** Accessible label for the logo. */
  iconAlt: string;
  endpointLabel?: string;
  endpointPlaceholder?: string;
  /**
   * Pre-filled into the endpoint field when the user hasn't set one yet.
   * Use only for providers whose default endpoint is a real, working URL
   * (e.g. BytePlus / Volcengine Ark regions). Azure stays placeholder-only
   * because the endpoint URL is unique to each user's resource.
   */
  defaultEndpoint?: string;
  mappingLabel?: string;
}

export interface MappingRowState {
  clientId: string;
  id: string;
  modelId: string;
  displayName: string;
}

export interface ModalState {
  providerId: string;
  displayName: string;
  endpoint: string;
  baseUrl: string;
  apiKey: string;
  mappings: MappingRowState[];
}

export type ActiveModal = { kind: "built-in"; id: string } | { kind: "custom"; id: string | null };

export const BUILT_IN_PROVIDERS: readonly BuiltInProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT Image models through the OpenAI API.",
    iconSrc: openaiUrl,
    iconAlt: "OpenAI",
  },
  {
    id: "azure",
    name: "Azure",
    description:
      "Azure Foundry deployments — GPT Image, MAI Image, and FLUX families on one resource.",
    iconSrc: azureUrl,
    iconAlt: "Azure",
    endpointLabel: "Endpoint",
    endpointPlaceholder: "https://my-resource.services.ai.azure.com",
    mappingLabel: "Deployment",
  },
  {
    id: "google",
    name: "Google AI Studio",
    description: "Imagen, Nano Banana, and Veo with a shared Google API key.",
    iconSrc: googleUrl,
    iconAlt: "Google",
  },
  {
    id: "flux-bfl",
    name: "Black Forest Labs",
    description: "Black Forest Labs image generation models.",
    iconSrc: bflUrl,
    iconAlt: "Black Forest Labs",
  },
  {
    id: "byteplus",
    name: "BytePlus",
    description: "Seedream and Seedance through BytePlus ModelArk endpoints.",
    iconSrc: bytedanceUrl,
    iconAlt: "BytePlus",
    endpointLabel: "Endpoint",
    endpointPlaceholder: "https://ark.ap-southeast.bytepluses.com/api/v3",
    defaultEndpoint: "https://ark.ap-southeast.bytepluses.com/api/v3",
  },
  {
    id: "volcengine",
    name: "Volcengine",
    description:
      "通过火山方舟 Ark 调用 doubao-前缀的 Seedream / Seedance 模型。",
    iconSrc: volcengineUrl,
    iconAlt: "Volcengine",
    endpointLabel: "Endpoint",
    endpointPlaceholder: "https://ark.cn-beijing.volces.com/api/v3",
    defaultEndpoint: "https://ark.cn-beijing.volces.com/api/v3",
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok image and video generation APIs.",
    iconSrc: xaiUrl,
    iconAlt: "xAI",
  },
  {
    id: "minimax",
    name: "MiniMax",
    description: "MiniMax image (image-01) and Hailuo video generation APIs.",
    iconSrc: minimaxUrl,
    iconAlt: "MiniMax",
  },
] as const;

export const BUILT_IN_IDS: ReadonlySet<string> = new Set(BUILT_IN_PROVIDERS.map((p) => p.id));
const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function providerDef(id: string): BuiltInProvider | undefined {
  return BUILT_IN_PROVIDERS.find((p) => p.id === id);
}

export function emptyModalState(): ModalState {
  return {
    providerId: "",
    displayName: "",
    endpoint: "",
    baseUrl: "",
    apiKey: "",
    mappings: [],
  };
}

export function formFromProvider(
  id: string,
  displayName: string,
  catalog: ModelCatalogPayload | null,
  prefs: ProviderPreferencesPayload | null,
  _secrets: MaskedSecrets,
): ModalState {
  // Endpoint/baseUrl now live in providers config (non-secret), not in
  // secrets. Read them from the prefs payload.
  const routing = readRouting(prefs, id);
  // Pre-fill the default endpoint (e.g. BytePlus / Volcengine Ark regions)
  // when the user hasn't saved one yet, so it's visible and editable
  // rather than hidden behind a placeholder.
  const fallbackEndpoint = providerDef(id)?.defaultEndpoint ?? "";
  return {
    providerId: id,
    displayName,
    endpoint: routing?.endpoint ?? fallbackEndpoint,
    baseUrl: routing?.baseUrl ?? "",
    apiKey: "",
    mappings: id === "azure" ? mappingsForBuiltIn(prefs, catalog, id) : [],
  };
}

export function formFromCustom(
  id: string | null,
  catalog: ModelCatalogPayload | null,
  prefs: ProviderPreferencesPayload | null,
  _secrets: MaskedSecrets,
): ModalState {
  if (!id) {
    return {
      providerId: "",
      displayName: "",
      endpoint: "",
      baseUrl: "",
      apiKey: "",
      mappings: [mappingRow("", firstImageModelId(catalog))],
    };
  }
  const routing = prefs?.customOpenAI?.[id];
  return {
    providerId: id,
    displayName: routing?.displayName ?? catalog?.providers[id]?.displayName ?? id,
    endpoint: "",
    baseUrl: routing?.baseUrl ?? "",
    apiKey: "",
    mappings: mappingsForCustom(prefs, catalog, id),
  };
}

function readRouting(
  prefs: ProviderPreferencesPayload | null,
  providerId: string,
): ProviderRoutingPayload | undefined {
  if (!prefs) return undefined;
  if (providerId === "customOpenAI") return undefined;
  if (providerId in prefs) {
    return (prefs as unknown as Record<string, ProviderRoutingPayload>)[providerId];
  }
  return prefs.customOpenAI?.[providerId];
}

function mappingsForBuiltIn(
  prefs: ProviderPreferencesPayload | null,
  catalog: ModelCatalogPayload | null,
  providerId: string,
): MappingRowState[] {
  const fromPrefs = readRouting(prefs, providerId)?.image ?? [];
  if (fromPrefs.length === 0) return [mappingRow("", firstImageModelId(catalog))];
  return fromPrefs.map((row) => ({
    clientId: mappingClientId(),
    id: row.id,
    modelId: row.modelId,
    displayName: row.displayName ?? "",
  }));
}

function mappingsForCustom(
  prefs: ProviderPreferencesPayload | null,
  catalog: ModelCatalogPayload | null,
  providerId: string,
): MappingRowState[] {
  const fromPrefs = prefs?.customOpenAI?.[providerId]?.image ?? [];
  const fromCatalog = catalog?.providers[providerId]?.image ?? [];
  const seen = new Set<string>();
  const merged: typeof fromPrefs = [];
  for (const row of [...fromPrefs, ...fromCatalog]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  if (merged.length === 0) return [mappingRow("", firstImageModelId(catalog))];
  return merged.map((row) => ({
    clientId: mappingClientId(),
    id: row.id,
    modelId: row.modelId,
    displayName: row.displayName ?? "",
  }));
}

export function mappingRow(id: string, modelId: string, displayName = ""): MappingRowState {
  return { clientId: mappingClientId(), id, modelId, displayName };
}

function mappingClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function firstImageModelId(catalog: ModelCatalogPayload | null): string {
  return Object.keys(catalog?.models.image ?? {})[0] ?? "";
}

export function imageModelsForSelect(catalog: ModelCatalogPayload | null) {
  return Object.entries(catalog?.models.image ?? {})
    .map(([id, model]) => ({ id, label: model.displayName ? `${model.displayName} (${id})` : id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function validateModal(
  activeModal: ActiveModal,
  form: ModalState,
  secrets: MaskedSecrets,
  t: (key: MessageKey) => string,
): string | null {
  if (activeModal.kind === "custom") {
    if (!PROVIDER_ID_RE.test(form.providerId)) {
      return t("providers.validation.providerId");
    }
    if (BUILT_IN_IDS.has(form.providerId)) {
      return t("providers.validation.reservedId");
    }
    if (!form.displayName.trim()) return t("providers.validation.displayNameRequired");
    if (!form.baseUrl.trim()) return t("providers.validation.baseUrlRequired");
  }

  if (activeModal.id === "azure" && !form.endpoint.trim()) {
    return t("providers.validation.azureEndpointRequired");
  }
  if (
    (activeModal.id === "byteplus" || activeModal.id === "volcengine") &&
    !form.endpoint.trim()
  ) {
    return t("providers.validation.arkEndpointRequired");
  }

  const masked = maskForModal(activeModal, form.providerId, secrets);
  const keyRequired = activeModal.kind !== "custom";
  if (keyRequired && !masked && !form.apiKey.trim())
    return t("providers.validation.apiKeyRequired");

  if (activeModal.id === "azure" || activeModal.kind === "custom") {
    const usable = form.mappings.filter((row) => row.id.trim() && row.modelId.trim());
    if (usable.length === 0) return t("providers.validation.atLeastOneMapping");
  }
  return null;
}

/** Returns the translated display name for a built-in provider id, or `id` as fallback. */
export function providerDisplayName(id: string, t: (key: MessageKey) => string): string {
  switch (id) {
    case "openai":
      return t("providers.def.openai.name");
    case "azure":
      return t("providers.def.azure.name");
    case "google":
      return t("providers.def.google.name");
    case "flux-bfl":
      return t("providers.def.fluxBfl.name");
    case "byteplus":
      return t("providers.def.byteplus.name");
    case "volcengine":
      return t("providers.def.volcengine.name");
    case "xai":
      return t("providers.def.xai.name");
    case "minimax":
      return t("providers.def.minimax.name");
    default:
      return id;
  }
}

/** Returns the translated description for a built-in provider id. */
export function providerDescription(id: string, t: (key: MessageKey) => string): string {
  switch (id) {
    case "openai":
      return t("providers.def.openai.description");
    case "azure":
      return t("providers.def.azure.description");
    case "google":
      return t("providers.def.google.description");
    case "flux-bfl":
      return t("providers.def.fluxBfl.description");
    case "byteplus":
      return t("providers.def.byteplus.description");
    case "volcengine":
      return t("providers.def.volcengine.description");
    case "xai":
      return t("providers.def.xai.description");
    case "minimax":
      return t("providers.def.minimax.description");
    default:
      return "";
  }
}

/**
 * Build the apiKey-only secrets patch from the modal. Endpoint/baseUrl now
 * round-trip through `prefsWithMappings` → `providers.config.set` instead.
 */
export function buildSecretsPatch(activeModal: ActiveModal, form: ModalState): SecretsWrite {
  const patch: SecretsWrite = {};
  const apiKey = form.apiKey.trim();
  if (!apiKey) return patch;
  if (activeModal.kind === "custom") {
    patch.customOpenAI = { [form.providerId]: { apiKey } };
    return patch;
  }
  switch (activeModal.id) {
    case "openai":
      patch.openai = { apiKey };
      break;
    case "google":
      patch.google = { apiKey };
      break;
    case "flux-bfl":
      patch["flux-bfl"] = { apiKey };
      break;
    case "xai":
      patch.xai = { apiKey };
      break;
    case "minimax":
      patch.minimax = { apiKey };
      break;
    case "azure":
      patch.azure = { apiKey };
      break;
    case "byteplus":
      patch.byteplus = { apiKey };
      break;
    case "volcengine":
      patch.volcengine = { apiKey };
      break;
  }
  return patch;
}

/**
 * Apply the modal's mappings + endpoint/baseUrl to the provider preferences
 * payload. Azure / built-in providers write into `prefs[<id>]`; custom OpenAI
 * providers write into `prefs.customOpenAI[<id>]`. The returned object is a
 * fresh `ProviderPreferencesPayload` suitable for `providers.config.set`.
 */
export function prefsWithMappings(
  prefs: ProviderPreferencesPayload,
  activeModal: ActiveModal,
  form: ModalState,
): ProviderPreferencesPayload {
  const next: ProviderPreferencesPayload = {
    ...prefs,
    customOpenAI: { ...(prefs.customOpenAI ?? {}) },
  };
  const providerId = activeModal.kind === "custom" ? form.providerId : activeModal.id;
  const image = form.mappings
    .filter((row) => row.id.trim() && row.modelId.trim())
    .map((row) => ({
      id: row.id.trim(),
      modelId: row.modelId,
      ...(row.displayName.trim() ? { displayName: row.displayName.trim() } : {}),
    }));
  if (activeModal.kind === "custom") {
    const baseUrl = form.baseUrl.trim();
    next.customOpenAI[providerId] = {
      displayName: form.displayName.trim(),
      ...(baseUrl ? { baseUrl } : {}),
      ...(image.length > 0 ? { image } : {}),
    };
  } else {
    if (providerId === "customOpenAI") {
      throw new Error("Provider id 'customOpenAI' is reserved");
    }
    const existing = (next as unknown as Record<string, ProviderRoutingPayload>)[providerId] ?? {};
    const endpoint = form.endpoint.trim();
    const baseUrl = form.baseUrl.trim();
    const merged: ProviderRoutingPayload = {
      ...existing,
      ...(endpoint ? { endpoint } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(activeModal.id === "azure" ? (image.length > 0 ? { image } : { image: [] }) : {}),
    };
    (next as unknown as Record<string, ProviderRoutingPayload>)[providerId] = merged;
  }
  return next;
}

export function updateMapping(
  rows: MappingRowState[],
  onChange: (rows: MappingRowState[]) => void,
  index: number,
  patch: Partial<MappingRowState>,
) {
  onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
}

export function maskForModal(
  activeModal: ActiveModal,
  providerId: string,
  secrets: MaskedSecrets,
): string | null {
  if (activeModal.kind === "custom") return secrets.customOpenAI?.[providerId]?.apiKey ?? null;
  switch (activeModal.id) {
    case "openai":
      return secrets.openai?.apiKey ?? null;
    case "azure":
      return secrets.azure?.apiKey ?? null;
    case "google":
      return secrets.google?.apiKey ?? null;
    case "flux-bfl":
      return secrets["flux-bfl"]?.apiKey ?? null;
    case "byteplus":
      return secrets.byteplus?.apiKey ?? null;
    case "volcengine":
      return secrets.volcengine?.apiKey ?? null;
    case "xai":
      return secrets.xai?.apiKey ?? null;
    case "minimax":
      return secrets.minimax?.apiKey ?? null;
    default:
      return null;
  }
}

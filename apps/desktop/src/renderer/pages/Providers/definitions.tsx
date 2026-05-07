import type {
  MaskedSecrets,
  ModelCatalogPayload,
  ProviderPreferencesPayload,
  ProviderRoutingPayload,
  SecretsWrite,
} from "@imagent/ipc";
import { Icons } from "@imagent/ui";
import { useId } from "react";

type ProviderIconComponent = React.ComponentType<{
  className?: string;
  weight?: "regular" | "bold" | "fill";
}>;

export interface BuiltInProvider {
  id: string;
  name: string;
  description: string;
  icon: ProviderIconComponent;
  iconClassName?: string;
  endpointLabel?: string;
  endpointPlaceholder?: string;
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
    icon: Icons.OpenAiLogo,
  },
  {
    id: "azure",
    name: "Azure",
    description: "Azure Foundry deployments — GPT Image, MAI Image, and FLUX families on one resource.",
    icon: AzureBrandIcon,
    iconClassName: "text-[#0078D4]",
    endpointLabel: "Endpoint",
    endpointPlaceholder: "https://my-resource.services.ai.azure.com",
    mappingLabel: "Deployment",
  },
  {
    id: "google",
    name: "Google AI Studio",
    description: "Imagen, Nano Banana, and Veo with a shared Google API key.",
    icon: Icons.GoogleLogo,
    iconClassName: "text-[#4285F4]",
  },
  {
    id: "flux-bfl",
    name: "Black Forest Labs",
    description: "Black Forest Labs image generation models.",
    icon: FluxBrandIcon,
  },
  {
    id: "bytedance",
    name: "ByteDance",
    description: "Seedream and Seedance through BytePlus ModelArk endpoints.",
    icon: ByteDanceBrandIcon,
    endpointLabel: "Endpoint",
    endpointPlaceholder: "https://ark.cn-beijing.volces.com/api/v3",
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok image and video generation APIs.",
    icon: Icons.XLogo,
  },
] as const;

export const BUILT_IN_IDS: ReadonlySet<string> = new Set(BUILT_IN_PROVIDERS.map((p) => p.id));
const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

function AzureBrandIcon({
  className,
}: {
  className?: string;
  weight?: "regular" | "bold" | "fill";
}) {
  const baseId = useId().replaceAll(":", "");
  const leftGradientId = `${baseId}-azure-left`;
  const shadowGradientId = `${baseId}-azure-shadow`;
  const rightGradientId = `${baseId}-azure-right`;

  return (
    <svg
      viewBox="0 0 128 128"
      aria-hidden="true"
      className={className}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient
          id={leftGradientId}
          x1="60.919"
          y1="9.602"
          x2="18.667"
          y2="134.423"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#114A8B" />
          <stop offset="1" stopColor="#0669BC" />
        </linearGradient>
        <linearGradient
          id={shadowGradientId}
          x1="74.117"
          y1="67.772"
          x2="64.344"
          y2="71.076"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopOpacity=".3" />
          <stop offset=".071" stopOpacity=".2" />
          <stop offset=".321" stopOpacity=".1" />
          <stop offset=".623" stopOpacity=".05" />
          <stop offset="1" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={rightGradientId}
          x1="68.742"
          y1="5.961"
          x2="115.122"
          y2="129.525"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3CCBF4" />
          <stop offset="1" stopColor="#2892DF" />
        </linearGradient>
      </defs>
      <path
        d="M46.09.002h40.685L44.541 125.137a6.485 6.485 0 0 1-6.146 4.413H6.733a6.482 6.482 0 0 1-5.262-2.699 6.474 6.474 0 0 1-.876-5.848L39.944 4.414A6.488 6.488 0 0 1 46.09 0z"
        fill={`url(#${leftGradientId})`}
        transform="translate(.587 4.468) scale(.91904)"
      />
      <path
        d="M97.28 81.607H37.987a2.743 2.743 0 0 0-1.874 4.751l38.1 35.562a5.991 5.991 0 0 0 4.087 1.61h33.574z"
        fill="#0078d4"
      />
      <path
        d="M46.09.002A6.434 6.434 0 0 0 39.93 4.5L.644 120.897a6.469 6.469 0 0 0 6.106 8.653h32.48a6.942 6.942 0 0 0 5.328-4.531l7.834-23.089 27.985 26.101a6.618 6.618 0 0 0 4.165 1.519h36.396l-15.963-45.616-46.533.011L86.922.002z"
        fill={`url(#${shadowGradientId})`}
        transform="translate(.587 4.468) scale(.91904)"
      />
      <path
        d="M98.055 4.408A6.476 6.476 0 0 0 91.917.002H46.575a6.478 6.478 0 0 1 6.137 4.406l39.35 116.594a6.476 6.476 0 0 1-6.137 8.55h45.344a6.48 6.48 0 0 0 6.136-8.55z"
        fill={`url(#${rightGradientId})`}
        transform="translate(.587 4.468) scale(.91904)"
      />
    </svg>
  );
}

function FluxBrandIcon({
  className,
}: {
  className?: string;
  weight?: "regular" | "bold" | "fill";
}) {
  return (
    <svg viewBox="0 0 196 140" aria-hidden="true" className={className} fill="none">
      <path
        d="M139.8 59.8h-20.9L98.1 30.5 33 122h20.9l44.2-62.2h20.8L74.8 122h20.9l44.1-62.2 56.2 79.2h-15.7v.1h-17.2v-17l-23.3-32.9-23.2 32.8v17.1H62.7v.1H41.8v-.1H0L98.1 1l41.7 58.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ByteDanceBrandIcon({
  className,
}: {
  className?: string;
  weight?: "regular" | "bold" | "fill";
}) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none">
      <image
        href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB8UlEQVR4Ae3BMYiWdRwA4Of3fn/1AiEbrNlukihqCcK1hCIMB0Hv0vv0IDKHCGoJShAnW6LpwE7vLowMPm64hqhoaAoigjbBMZukqDRR+d5fd7TY+fm+75cHLvc8Nm3aEP1kOid1dTQ5lNZU7td0hnDKVp/o4ljuwFe2mbSquB/9fAjncBDfazObjxv6Qtgt9Kwq1hzOFxUL1ht601J8ZpRX8zFhGc/pYib3qC0LO92hWFNsx6PW63nYKP18QljBLm1mk5umVOYxYZ1iXEdyr3ARO7R5OkPtfVucRBihGMfRfB0fYYs2Mzmh8jGmNSi66GfPbR/gLV30cyeWsUeLos1Mbhcu2GqfZmnNbO5WW8GkDopmTwrf4RntwrF8Xu1zPKKjotkJoatnpS/RM4Zi41T+h8oDVhnfFaQNUhlH+gZP4YZ2qXYaCxpUujur8pL0u3Y3pb7iPdzQoNKuVntHeM25uK1NumroBQuxZD60KZqk68Jhi7Gsm0vCy5biso6Ke7uCV5yPH3XzrT8dMIjfjKEYJf3kL/sM4hddDM0LbxjELWMq7rbilimDuKZdLb2rcsZCpFFqP6t87b/SNX9YVdwpfaj2tk9jqN3fakcsxkCTxZjDnHso/nUVxzFnKTTqofarNGUxfvBA7M8JmzZtkH8ASdiM3y2FE6YAAAAASUVORK5CYII="
        width="32"
        height="32"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}

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
  return {
    providerId: id,
    displayName,
    endpoint: routing?.endpoint ?? "",
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
): string | null {
  if (activeModal.kind === "custom") {
    if (!PROVIDER_ID_RE.test(form.providerId)) {
      return "Provider ID must be lowercase letters, numbers, hyphens, or underscores.";
    }
    if (BUILT_IN_IDS.has(form.providerId)) {
      return "Custom provider ID cannot reuse a built-in provider.";
    }
    if (!form.displayName.trim()) return "Display name is required.";
    if (!form.baseUrl.trim()) return "Base URL is required.";
  }

  if (activeModal.id === "azure" && !form.endpoint.trim()) {
    return "Azure endpoint is required.";
  }
  if (activeModal.id === "bytedance" && !form.endpoint.trim()) {
    return "ByteDance endpoint is required.";
  }

  const masked = maskForModal(activeModal, form.providerId, secrets);
  const keyRequired = activeModal.kind !== "custom";
  if (keyRequired && !masked && !form.apiKey.trim()) return "API key is required.";

  if (activeModal.id === "azure" || activeModal.kind === "custom") {
    const usable = form.mappings.filter((row) => row.id.trim() && row.modelId.trim());
    if (usable.length === 0) return "Add at least one model mapping.";
  }
  return null;
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
    case "azure":
      patch["azure"] = { apiKey };
      break;
    case "bytedance":
      patch.bytedance = { apiKey };
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
      ...(activeModal.id === "azure"
        ? image.length > 0
          ? { image }
          : { image: [] }
        : {}),
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
      return secrets["azure"]?.apiKey ?? null;
    case "google":
      return secrets.google?.apiKey ?? null;
    case "flux-bfl":
      return secrets["flux-bfl"]?.apiKey ?? null;
    case "bytedance":
      return secrets.bytedance?.apiKey ?? null;
    case "xai":
      return secrets.xai?.apiKey ?? null;
    default:
      return null;
  }
}

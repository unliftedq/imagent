import {
  IpcClientError,
  type MaskedSecrets,
  type ModelCatalogPayload,
  type ProviderSummary,
  type SecretsWrite,
} from "@imagine/ipc";
import {
  Button,
  Dialog,
  Icons,
  Input,
  type ProviderTestStatus,
  Select,
  Tooltip,
} from "@imagine/ui";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useConfigStore } from "../state/useConfigStore.js";
import { useUIStore } from "../state/useUIStore.js";

type ProviderIconComponent = React.ComponentType<{
  className?: string;
  weight?: "regular" | "bold" | "fill";
}>;

interface BuiltInProvider {
  id: string;
  name: string;
  description: string;
  icon: ProviderIconComponent;
  iconClassName?: string;
  endpointLabel?: string;
  endpointPlaceholder?: string;
  mappingLabel?: string;
}

const BUILT_IN_PROVIDERS: readonly BuiltInProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT Image models through the OpenAI API.",
    icon: Icons.OpenAiLogo,
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    description: "Azure deployments mapped to canonical image models.",
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

const BUILT_IN_IDS: ReadonlySet<string> = new Set(BUILT_IN_PROVIDERS.map((p) => p.id));
const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

interface MappingRowState {
  clientId: string;
  id: string;
  modelId: string;
  displayName: string;
}

interface ModalState {
  providerId: string;
  displayName: string;
  endpoint: string;
  baseUrl: string;
  apiKey: string;
  mappings: MappingRowState[];
}

type ActiveModal = { kind: "built-in"; id: string } | { kind: "custom"; id: string | null };

export function ProvidersPage() {
  const { summaries, secrets, testResults, testing, refresh, saveSecrets, testProvider } =
    useConfigStore();
  const pushToast = useUIStore((s) => s.pushToast);

  const [catalog, setCatalog] = useState<ModelCatalogPayload | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [form, setForm] = useState<ModalState>(() => emptyModalState());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
    void api["catalog.get"]().then(setCatalog);
  }, [refresh]);

  const summariesById = useMemo(() => new Map(summaries.map((s) => [s.id, s])), [summaries]);
  const imageModelOptions = useMemo(() => imageModelsForSelect(catalog), [catalog]);
  const customProviderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of Object.keys(catalog?.providers ?? {})) {
      if (!BUILT_IN_IDS.has(id)) ids.add(id);
    }
    for (const id of Object.keys(secrets.customOpenAI ?? {})) ids.add(id);
    return [...ids].sort();
  }, [catalog, secrets.customOpenAI]);

  function openBuiltIn(id: string) {
    const provider = BUILT_IN_PROVIDERS.find((p) => p.id === id);
    setForm(formFromProvider(id, provider?.name ?? id, catalog, secrets));
    setActiveModal({ kind: "built-in", id });
  }

  function openCustom(id: string | null) {
    setForm(formFromCustom(id, catalog, secrets));
    setActiveModal({ kind: "custom", id });
  }

  async function saveActiveModal() {
    if (!activeModal || !catalog) return;
    const validation = validateModal(activeModal, form, secrets);
    if (validation) {
      pushToast({
        title: "Provider config needs attention",
        description: validation,
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const secretsPatch = buildSecretsPatch(activeModal, form);
      if (Object.keys(secretsPatch).length > 0) {
        await saveSecrets(secretsPatch);
      }

      if (activeModal.id === "azure-openai" || activeModal.kind === "custom") {
        const nextCatalog = catalogWithMappings(catalog, activeModal, form);
        const saved = await api["catalog.set"](nextCatalog);
        setCatalog(saved);
        await refresh();
      }

      pushToast({
        title: activeModal.kind === "custom" ? "Custom provider saved" : "Provider saved",
        description: form.displayName || form.providerId,
        variant: "success",
      });
      setActiveModal(null);
      setForm(emptyModalState());
    } catch (err) {
      const msg =
        err instanceof IpcClientError ? err.message : ((err as Error)?.message ?? String(err));
      pushToast({ title: "Failed to save provider", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  function statusFor(id: string): ProviderTestStatus {
    if (testing[id]) return { kind: "testing" };
    const last = testResults[id]?.result;
    if (!last) return { kind: "idle" };
    if (last.ok) {
      return {
        kind: "ok",
        latencyMs: last.latencyMs,
        ...(last.sampleModelId ? { sampleModelId: last.sampleModelId } : {}),
      };
    }
    return {
      kind: "error",
      reason: last.reason,
      ...(last.status !== undefined ? { status: last.status } : {}),
    };
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-(length:--text-display-sm) font-display font-medium tracking-(--text-display-sm--letter-spacing) text-(--text)">
          Providers
        </h1>
        <p className="mt-2 max-w-2xl text-(length:--text-body-md) text-(--text-muted)">
          Connect generation providers, then map provider-facing model ids or deployments to the
          canonical catalog models they implement.
        </p>
      </header>

      <div className="flex flex-col overflow-hidden rounded-(--radius-lg) border border-(--border) bg-(--bg)">
        {BUILT_IN_PROVIDERS.map((provider) => (
          <ProviderListRow
            key={provider.id}
            icon={provider.icon}
            iconClassName={provider.iconClassName}
            name={summariesById.get(provider.id)?.displayName ?? provider.name}
            description={provider.description}
            summary={summariesById.get(provider.id)}
            status={statusFor(provider.id)}
            onConfigure={() => openBuiltIn(provider.id)}
            onTest={() => void testProvider(provider.id)}
          />
        ))}

        {customProviderIds.map((id) => (
          <ProviderListRow
            key={id}
            icon={Icons.Plug}
            name={catalog?.providers[id]?.displayName ?? summariesById.get(id)?.displayName ?? id}
            description="OpenAI Images API-compatible custom endpoint."
            summary={summariesById.get(id)}
            status={statusFor(id)}
            onConfigure={() => openCustom(id)}
            onTest={() => void testProvider(id)}
          />
        ))}

        <div className="flex items-center gap-4 border-t border-(--border-faint) px-5 py-4 text-left transition-colors duration-(--duration-fast) hover:bg-(--surface)">
          <ProviderIcon icon={Icons.Plus} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-(length:--text-title-sm) font-semibold text-(--text)">
              OpenAI compatible
            </span>
            <span className="text-(length:--text-body-sm) text-(--text-muted)">
              Add a custom provider with its own base URL and model mappings.
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leadingIcon={<Icons.Plus weight="bold" className="size-4" />}
            onClick={() => openCustom(null)}
          >
            Add
          </Button>
        </div>
      </div>

      <ProviderConfigModal
        activeModal={activeModal}
        form={form}
        setForm={setForm}
        catalogReady={catalog !== null}
        imageModelOptions={imageModelOptions}
        saving={saving}
        maskedApiKey={activeModal ? maskForModal(activeModal, form.providerId, secrets) : null}
        onClose={() => setActiveModal(null)}
        onSave={() => void saveActiveModal()}
      />
    </div>
  );
}

function ProviderListRow({
  icon,
  iconClassName,
  name,
  description,
  summary,
  status,
  onConfigure,
  onTest,
}: {
  icon: React.ComponentType<{ className?: string; weight?: "regular" | "bold" | "fill" }>;
  iconClassName?: string;
  name: string;
  description: string;
  summary?: ProviderSummary;
  status: ProviderTestStatus;
  onConfigure: () => void;
  onTest: () => void;
}) {
  const configured = summary?.configured ?? false;
  return (
    <div className="flex items-center gap-4 border-t border-(--border-faint) px-5 py-4 first:border-t-0">
      <ProviderIcon icon={icon} iconClassName={iconClassName} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-(length:--text-title-sm) font-semibold text-(--text)">{name}</h2>
          {summary && summary.kinds.length > 1 ? <KindsBadge text="Image + Video" /> : null}
          {configured ? <ConnectedPill /> : null}
        </div>
        <p className="mt-0.5 text-(length:--text-body-sm) text-(--text-muted)">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {configured ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onTest}
            disabled={status.kind === "testing"}
            leadingIcon={statusIcon(status)}
          >
            Test
          </Button>
        ) : null}
        <Button
          type="button"
          variant={configured ? "secondary" : "primary"}
          size="sm"
          onClick={onConfigure}
        >
          {configured ? "Update" : "Connect"}
        </Button>
      </div>
    </div>
  );
}

function ProviderConfigModal({
  activeModal,
  form,
  setForm,
  catalogReady,
  imageModelOptions,
  saving,
  maskedApiKey,
  onClose,
  onSave,
}: {
  activeModal: ActiveModal | null;
  form: ModalState;
  setForm: React.Dispatch<React.SetStateAction<ModalState>>;
  catalogReady: boolean;
  imageModelOptions: Array<{ id: string; label: string }>;
  saving: boolean;
  maskedApiKey: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const builtIn = activeModal?.kind === "built-in" ? providerDef(activeModal.id) : null;
  const customId = activeModal?.kind === "custom" ? activeModal.id : null;
  const isCustom = activeModal?.kind === "custom";
  const canEditProviderId = activeModal?.kind === "custom" && activeModal.id === null;
  const usesEndpoint = builtIn?.endpointLabel !== undefined;
  const usesMappings = activeModal?.id === "azure-openai" || isCustom;
  const title = isCustom
    ? customId
      ? "Update Custom Provider"
      : "Connect Custom Provider"
    : `Connect ${builtIn?.name ?? "Provider"}`;
  const description = isCustom
    ? "Use an OpenAI Images API-compatible endpoint and map its model ids to canonical catalog models."
    : (builtIn?.description ?? "Configure provider access.");

  return (
    <Dialog.Root open={activeModal !== null} onOpenChange={(open) => (!open ? onClose() : null)}>
      <Dialog.Content showClose className="max-h-[88vh] max-w-2xl overflow-y-auto p-0">
        <div className="border-b border-(--border-faint) px-6 py-5">
          <div className="mb-5 flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              aria-label="Back"
              onClick={onClose}
            >
              <Icons.CaretRight weight="bold" className="size-4 rotate-180" />
            </Button>
            <span className="text-(length:--text-caption-uppercase) tracking-[1.5px] text-(--text-muted)">
              Provider
            </span>
          </div>
          <div className="flex items-start gap-4 pr-10">
            <ProviderIcon
              icon={isCustom ? Icons.Plug : (builtIn?.icon ?? Icons.Plug)}
              iconClassName={builtIn?.iconClassName}
            />
            <div>
              <Dialog.Title className="text-(length:--text-title-lg) font-semibold text-(--text)">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-(length:--text-body-sm) text-(--text-muted)">
                {description}
              </Dialog.Description>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          {isCustom ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Provider ID"
                helperText="Lowercase letters, numbers, hyphens, and underscores."
              >
                <Input
                  value={form.providerId}
                  disabled={!canEditProviderId}
                  placeholder="my-provider"
                  onChange={(e) => setForm((s) => ({ ...s, providerId: e.target.value.trim() }))}
                />
              </Field>
              <Field label="Display name">
                <Input
                  value={form.displayName}
                  placeholder="My Provider"
                  onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
                />
              </Field>
            </div>
          ) : null}

          {usesEndpoint ? (
            <Field label={builtIn?.endpointLabel ?? "Endpoint"}>
              <Input
                value={form.endpoint}
                placeholder={builtIn?.endpointPlaceholder}
                onChange={(e) => setForm((s) => ({ ...s, endpoint: e.target.value.trim() }))}
              />
            </Field>
          ) : null}

          {isCustom ? (
            <Field
              label="Base URL"
              helperText="Include the OpenAI-compatible /v1 path when your provider requires it."
            >
              <Input
                value={form.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(e) => setForm((s) => ({ ...s, baseUrl: e.target.value.trim() }))}
              />
            </Field>
          ) : null}

          <SecretField
            label="API key"
            placeholder={maskedApiKey ?? (isCustom ? "optional" : "paste your key here")}
            value={form.apiKey}
            onChange={(apiKey) => setForm((s) => ({ ...s, apiKey }))}
            helperText={
              maskedApiKey
                ? `Stored: ${maskedApiKey}. Leave empty to keep it.`
                : isCustom
                  ? "Optional for endpoints that inject authentication upstream."
                  : "Required before this provider can be tested."
            }
          />

          {usesMappings ? (
            <MappingEditor
              label={activeModal?.id === "azure-openai" ? "Deployment mappings" : "Model mappings"}
              mappingLabel={builtIn?.mappingLabel ?? "Provider model"}
              rows={form.mappings}
              modelOptions={imageModelOptions}
              disabled={!catalogReady || imageModelOptions.length === 0}
              onChange={(mappings) => setForm((s) => ({ ...s, mappings }))}
            />
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-(--border-faint) px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onSave}
            disabled={saving}
            leadingIcon={
              saving ? <Icons.CircleNotch weight="bold" className="size-4 animate-spin" /> : null
            }
          >
            Continue
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function MappingEditor({
  label,
  mappingLabel,
  rows,
  modelOptions,
  disabled,
  onChange,
}: {
  label: string;
  mappingLabel: string;
  rows: MappingRowState[];
  modelOptions: Array<{ id: string; label: string }>;
  disabled: boolean;
  onChange: (rows: MappingRowState[]) => void;
}) {
  const defaultModelId = modelOptions[0]?.id ?? "";
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-(length:--text-title-sm) font-semibold text-(--text)">{label}</h3>
          <p className="mt-0.5 text-(length:--text-caption) text-(--text-muted)">
            Each provider-facing id inherits capabilities and defaults from the selected model.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          leadingIcon={<Icons.Plus weight="bold" className="size-4" />}
          onClick={() => onChange([...rows, mappingRow("", defaultModelId)])}
        >
          Add
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div
            key={row.clientId}
            className="grid gap-2 rounded-(--radius-md) border border-(--border-faint) bg-(--surface) p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <Field label={mappingLabel}>
              <Input
                value={row.id}
                placeholder={mappingLabel === "Deployment" ? "deployment-name" : "model-id"}
                onChange={(e) =>
                  updateMapping(rows, onChange, index, { id: e.target.value.trim() })
                }
              />
            </Field>
            <Field label="Canonical model">
              <Select.Root
                value={row.modelId}
                onValueChange={(modelId) => updateMapping(rows, onChange, index, { modelId })}
                disabled={disabled}
              >
                <Select.Trigger>
                  <Select.Value placeholder="Choose model" />
                </Select.Trigger>
                <Select.Content>
                  {modelOptions.map((model) => (
                    <Select.Item key={model.id} value={model.id}>
                      {model.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-11 p-0"
                aria-label="Remove mapping"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <Icons.X weight="bold" className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  helperText,
}: {
  label: string;
  children: React.ReactNode;
  helperText?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-(length:--text-caption-uppercase) tracking-[1.5px] text-(--text-muted)">
        {label}
      </span>
      {children}
      {helperText ? (
        <span className="text-(length:--text-caption) text-(--text-muted)">{helperText}</span>
      ) : null}
    </div>
  );
}

function SecretField({
  label,
  placeholder,
  value,
  onChange,
  helperText,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  helperText?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} helperText={helperText}>
      <div className="relative flex items-center">
        <Input
          type={show ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="pr-12"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={show ? "Hide key" : "Show key"}
          className="absolute right-1.5 size-8 p-0"
          onClick={() => setShow((v) => !v)}
        >
          {show ? (
            <Icons.EyeSlash weight="bold" className="size-4" />
          ) : (
            <Icons.Eye weight="bold" className="size-4" />
          )}
        </Button>
      </div>
    </Field>
  );
}

function ProviderIcon({
  icon: Icon,
  iconClassName,
}: {
  icon: React.ComponentType<{ className?: string; weight?: "regular" | "bold" | "fill" }>;
  iconClassName?: string;
}) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--surface-raised) text-(--text)">
      <Icon weight="bold" className={iconClassName ? `size-5 ${iconClassName}` : "size-5"} />
    </span>
  );
}

function ConnectedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-(--radius-pill) border border-(--success)/30 bg-(--success-soft)/60 px-2 py-0.5 text-(length:--text-caption) text-(--success)">
      <Icons.CheckCircle weight="fill" className="size-3.5 text-(--success)" />
      Connected
    </span>
  );
}

function KindsBadge({ text }: { text: string }) {
  return (
    <span className="rounded-(--radius-pill) bg-(--surface-raised) px-2 py-0.5 text-(length:--text-caption) text-(--text-muted)">
      {text}
    </span>
  );
}

function statusIcon(status: ProviderTestStatus) {
  if (status.kind === "testing") {
    return <Icons.CircleNotch weight="bold" className="size-4 animate-spin" />;
  }
  if (status.kind === "ok") {
    return (
      <Tooltip
        content={status.sampleModelId ? `Connected with ${status.sampleModelId}` : "Connected"}
      >
        <Icons.CheckCircle weight="fill" className="size-4 text-(--success)" />
      </Tooltip>
    );
  }
  if (status.kind === "error") {
    return (
      <Tooltip content={status.status ? `${status.reason} (HTTP ${status.status})` : status.reason}>
        <Icons.XCircle weight="fill" className="size-4 text-(--danger)" />
      </Tooltip>
    );
  }
  return <Icons.Plug weight="bold" className="size-4" />;
}

function AzureBrandIcon({
  className,
}: {
  className?: string;
  weight?: "regular" | "bold" | "fill";
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path d="M9.7 3.2 3.2 18.8h5.5L19.2 3.2H9.7Z" fill="currentColor" opacity="0.88" />
      <path d="M13.1 9.5 8.8 18.8h11.9L16 12.3l-2.9-2.8Z" fill="currentColor" />
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

function providerDef(id: string): BuiltInProvider | undefined {
  return BUILT_IN_PROVIDERS.find((p) => p.id === id);
}

function emptyModalState(): ModalState {
  return { providerId: "", displayName: "", endpoint: "", baseUrl: "", apiKey: "", mappings: [] };
}

function formFromProvider(
  id: string,
  displayName: string,
  catalog: ModelCatalogPayload | null,
  secrets: MaskedSecrets,
): ModalState {
  return {
    providerId: id,
    displayName,
    endpoint:
      id === "azure-openai"
        ? (secrets["azure-openai"]?.endpoint ?? "")
        : id === "bytedance"
          ? (secrets.bytedance?.endpoint ?? "")
          : "",
    baseUrl: "",
    apiKey: "",
    mappings: id === "azure-openai" ? mappingsFromCatalog(catalog, id) : [],
  };
}

function formFromCustom(
  id: string | null,
  catalog: ModelCatalogPayload | null,
  secrets: MaskedSecrets,
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
  return {
    providerId: id,
    displayName: catalog?.providers[id]?.displayName ?? id,
    endpoint: "",
    baseUrl: secrets.customOpenAI?.[id]?.baseUrl ?? "",
    apiKey: "",
    mappings: mappingsFromCatalog(catalog, id),
  };
}

function mappingsFromCatalog(
  catalog: ModelCatalogPayload | null,
  providerId: string,
): MappingRowState[] {
  const rows = catalog?.providers[providerId]?.image ?? [];
  if (rows.length === 0) return [mappingRow("", firstImageModelId(catalog))];
  return rows.map((row) => ({
    clientId: mappingClientId(),
    id: row.id,
    modelId: row.modelId,
    displayName: row.displayName ?? "",
  }));
}

function mappingRow(id: string, modelId: string, displayName = ""): MappingRowState {
  return { clientId: mappingClientId(), id, modelId, displayName };
}

function mappingClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function firstImageModelId(catalog: ModelCatalogPayload | null): string {
  return Object.keys(catalog?.models.image ?? {})[0] ?? "";
}

function imageModelsForSelect(catalog: ModelCatalogPayload | null) {
  return Object.entries(catalog?.models.image ?? {})
    .map(([id, model]) => ({ id, label: model.displayName ? `${model.displayName} (${id})` : id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function validateModal(
  activeModal: ActiveModal,
  form: ModalState,
  secrets: MaskedSecrets,
): string | null {
  if (activeModal.kind === "custom") {
    if (!PROVIDER_ID_RE.test(form.providerId)) {
      return "Provider ID must be lowercase letters, numbers, hyphens, or underscores.";
    }
    if (BUILT_IN_IDS.has(form.providerId))
      return "Custom provider ID cannot reuse a built-in provider.";
    if (!form.displayName.trim()) return "Display name is required.";
    if (!form.baseUrl.trim()) return "Base URL is required.";
  }

  if (activeModal.id === "azure-openai" && !form.endpoint.trim())
    return "Azure endpoint is required.";
  if (activeModal.id === "bytedance" && !form.endpoint.trim())
    return "ByteDance endpoint is required.";

  const masked = maskForModal(activeModal, form.providerId, secrets);
  const keyRequired = activeModal.kind !== "custom";
  if (keyRequired && !masked && !form.apiKey.trim()) return "API key is required.";

  if (activeModal.id === "azure-openai" || activeModal.kind === "custom") {
    const usable = form.mappings.filter((row) => row.id.trim() && row.modelId.trim());
    if (usable.length === 0) return "Add at least one model mapping.";
  }
  return null;
}

function buildSecretsPatch(activeModal: ActiveModal, form: ModalState): SecretsWrite {
  const patch: SecretsWrite = {};
  if (activeModal.kind === "custom") {
    patch.customOpenAI = {
      [form.providerId]: {
        baseUrl: form.baseUrl,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      },
    };
    return patch;
  }
  if (activeModal.id === "openai" && form.apiKey.trim())
    patch.openai = { apiKey: form.apiKey.trim() };
  if (activeModal.id === "google" && form.apiKey.trim())
    patch.google = { apiKey: form.apiKey.trim() };
  if (activeModal.id === "flux-bfl" && form.apiKey.trim()) {
    patch["flux-bfl"] = { apiKey: form.apiKey.trim() };
  }
  if (activeModal.id === "xai" && form.apiKey.trim()) patch.xai = { apiKey: form.apiKey.trim() };
  if (activeModal.id === "azure-openai") {
    patch["azure-openai"] = {
      endpoint: form.endpoint,
      ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
    };
  }
  if (activeModal.id === "bytedance") {
    patch.bytedance = {
      endpoint: form.endpoint,
      ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
    };
  }
  return patch;
}

function catalogWithMappings(
  catalog: ModelCatalogPayload,
  activeModal: ActiveModal,
  form: ModalState,
): ModelCatalogPayload {
  const next = JSON.parse(JSON.stringify(catalog)) as ModelCatalogPayload;
  const providerId = activeModal.kind === "custom" ? form.providerId : activeModal.id;
  const image = form.mappings
    .filter((row) => row.id.trim() && row.modelId.trim())
    .map((row) => ({
      id: row.id.trim(),
      modelId: row.modelId,
      ...(row.displayName.trim() ? { displayName: row.displayName.trim() } : {}),
    }));
  next.providers[providerId] = {
    ...(next.providers[providerId] ?? {}),
    ...(activeModal.kind === "custom" ? { displayName: form.displayName.trim() } : {}),
    image,
  };
  return next;
}

function updateMapping(
  rows: MappingRowState[],
  onChange: (rows: MappingRowState[]) => void,
  index: number,
  patch: Partial<MappingRowState>,
) {
  onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
}

function maskForModal(
  activeModal: ActiveModal,
  providerId: string,
  secrets: MaskedSecrets,
): string | null {
  if (activeModal.kind === "custom") return secrets.customOpenAI?.[providerId]?.apiKey ?? null;
  switch (activeModal.id) {
    case "openai":
      return secrets.openai?.apiKey ?? null;
    case "azure-openai":
      return secrets["azure-openai"]?.apiKey ?? null;
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

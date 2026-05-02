import type { ProviderSummary } from "@imagine/ipc";
import {
  Button,
  Dialog,
  Icons,
  Input,
  type ProviderTestStatus,
  Select,
  Tooltip,
} from "@imagine/ui";
import { useState } from "react";
import {
  mappingRow,
  providerDef,
  updateMapping,
  type ActiveModal,
  type MappingRowState,
  type ModalState,
} from "./definitions.js";

export function ProviderListRow({
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

export function ProviderConfigModal({
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
                onChange={(e) => updateMapping(rows, onChange, index, { id: e.target.value.trim() })}
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

export function ProviderIcon({
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
      <Tooltip content={status.sampleModelId ? `Connected with ${status.sampleModelId}` : "Connected"}>
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

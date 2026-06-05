import type { ProviderSummary } from "@imagent/ipc";
import { Button, Icons, Input, type ProviderTestStatus, Select, Tooltip } from "@imagent/ui";
import { useState } from "react";
import { type MessageKey, useT } from "../../i18n/index.js";
import {
  type ActiveModal,
  type MappingRowState,
  type ModalState,
  mappingRow,
  providerDef,
  providerDescription,
  providerDisplayName,
  updateMapping,
} from "./definitions.js";

export function ProviderListRow({
  iconSrc,
  iconAlt,
  fallbackIcon,
  name,
  description,
  summary,
  status,
  onConfigure,
  onTest,
}: {
  iconSrc?: string;
  iconAlt?: string;
  fallbackIcon?: React.ComponentType<{
    className?: string;
    weight?: "regular" | "bold" | "fill";
  }>;
  name: string;
  description: string;
  summary?: ProviderSummary;
  status: ProviderTestStatus;
  onConfigure: () => void;
  onTest: () => void;
}) {
  const t = useT();
  const configured = summary?.configured ?? false;
  return (
    <div className="flex items-center gap-4 border-t border-(--border-faint) px-5 py-4 first:border-t-0">
      <ProviderIcon iconSrc={iconSrc} iconAlt={iconAlt} fallbackIcon={fallbackIcon} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-(length:--text-title-sm) font-semibold text-(--text)">{name}</h2>
          {summary && (summary.kinds.length > 1 || summary.kinds.includes("audio")) ? (
            <KindsBadge text={providerKindsLabel(summary.kinds, t)} />
          ) : null}
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
            leadingIcon={statusIcon(status, t)}
          >
            {t("providers.test")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={configured ? "secondary" : "primary"}
          size="sm"
          onClick={onConfigure}
        >
          {configured ? t("common.update") : t("common.connect")}
        </Button>
      </div>
    </div>
  );
}

function providerKindsLabel(kinds: ProviderSummary["kinds"], t: ReturnType<typeof useT>): string {
  const hasImage = kinds.includes("image");
  const hasVideo = kinds.includes("video");
  const hasAudio = kinds.includes("audio");
  if (hasImage && hasVideo && hasAudio) return t("common.imagePlusVideoPlusAudio");
  if (hasImage && hasVideo) return t("common.imagePlusVideo");
  if (hasImage && hasAudio) return t("common.imagePlusAudio");
  if (hasVideo && hasAudio) return t("common.videoPlusAudio");
  if (hasAudio) return t("common.audio");
  if (hasVideo) return t("common.video");
  return t("common.image");
}

/**
 * Provider configuration panel — rendered inline inside the Settings dialog
 * (no nested Dialog). The caller is responsible for surfacing the title /
 * back affordance via the Settings dialog's title bar (see
 * `useSettingsSubpage`). This component renders the form body + the
 * primary action footer only.
 */
export function ProviderConfigPanel({
  activeModal,
  form,
  setForm,
  catalogReady,
  imageModelOptions,
  saving,
  maskedApiKey,
  onCancel,
  onSave,
}: {
  activeModal: ActiveModal;
  form: ModalState;
  setForm: React.Dispatch<React.SetStateAction<ModalState>>;
  catalogReady: boolean;
  imageModelOptions: Array<{ id: string; label: string }>;
  saving: boolean;
  maskedApiKey: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const builtIn = activeModal.kind === "built-in" ? providerDef(activeModal.id) : null;
  const isCustom = activeModal.kind === "custom";
  const canEditProviderId = activeModal.kind === "custom" && activeModal.id === null;
  const usesEndpoint = builtIn?.endpointLabel !== undefined;
  const groupIdField = builtIn?.groupIdField;
  const usesMappings = activeModal.id === "azure" || isCustom;
  const isDeploymentMapping = builtIn?.mappingLabel === "Deployment";
  const description = isCustom
    ? t("providers.customDialogDescription")
    : activeModal.kind === "built-in"
      ? providerDescription(activeModal.id, t)
      : t("providers.configureAccess");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex items-start gap-4 border-b border-(--border-faint) pb-5">
          <ProviderIcon
            iconSrc={isCustom ? undefined : builtIn?.iconSrc}
            iconAlt={isCustom ? undefined : builtIn?.iconAlt}
            fallbackIcon={Icons.Plug}
          />
          <p className="mt-1 text-(length:--text-body-sm) text-(--text-muted)">{description}</p>
        </div>

        <div className="flex flex-col gap-5 pt-5">
          {isCustom ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("providers.providerId")}
                helperText={t("providers.providerId.helper")}
              >
                <Input
                  value={form.providerId}
                  disabled={!canEditProviderId}
                  placeholder="my-provider"
                  onChange={(e) => setForm((s) => ({ ...s, providerId: e.target.value.trim() }))}
                />
              </Field>
              <Field label={t("providers.displayName")}>
                <Input
                  value={form.displayName}
                  placeholder={t("providers.displayName.placeholder")}
                  onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
                />
              </Field>
            </div>
          ) : null}

          {usesEndpoint ? (
            <Field label={t("providers.endpoint")}>
              <Input
                value={form.endpoint}
                placeholder={builtIn?.endpointPlaceholder}
                onChange={(e) => setForm((s) => ({ ...s, endpoint: e.target.value.trim() }))}
              />
            </Field>
          ) : null}

          {groupIdField ? (
            <Field label={t(groupIdField.label)} helperText={t(groupIdField.helperText)}>
              <Input
                value={form.groupId}
                placeholder="Group ID"
                onChange={(e) => setForm((s) => ({ ...s, groupId: e.target.value.trim() }))}
              />
            </Field>
          ) : null}

          {isCustom ? (
            <Field label={t("providers.baseUrl")} helperText={t("providers.baseUrl.helper")}>
              <Input
                value={form.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(e) => setForm((s) => ({ ...s, baseUrl: e.target.value.trim() }))}
              />
            </Field>
          ) : null}

          <SecretField
            label={t("providers.apiKey")}
            placeholder={
              maskedApiKey ??
              (isCustom ? t("common.optional") : t("providers.apiKey.placeholderPaste"))
            }
            value={form.apiKey}
            onChange={(apiKey) => setForm((s) => ({ ...s, apiKey }))}
            helperText={
              maskedApiKey
                ? t("providers.apiKey.stored", { masked: maskedApiKey })
                : isCustom
                  ? t("providers.apiKey.helperCustom")
                  : t("providers.apiKey.helperRequired")
            }
          />

          {usesMappings ? (
            <MappingEditor
              label={
                activeModal.id === "azure"
                  ? t("providers.deploymentMappings")
                  : t("providers.modelMappings")
              }
              mappingLabel={
                isDeploymentMapping
                  ? t("providers.mappings.deployment")
                  : t("providers.mappings.providerModel")
              }
              isDeployment={isDeploymentMapping}
              rows={form.mappings}
              modelOptions={imageModelOptions}
              disabled={!catalogReady || imageModelOptions.length === 0}
              onChange={(mappings) => setForm((s) => ({ ...s, mappings }))}
            />
          ) : null}
        </div>
      </div>

      {/* Pinned action footer — flush with the dialog content area's bottom. */}
      <div className="shrink-0 border-t border-(--border-faint) bg-(--bg) px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
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
            {t("common.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Build the i18n'd panel title for a given active modal — used by the
 * Settings dialog title bar when this panel is the active subpage.
 */
export function providerConfigPanelTitle(
  activeModal: ActiveModal,
  t: ReturnType<typeof useT>,
): string {
  if (activeModal.kind === "custom") {
    return activeModal.id ? t("providers.customUpdate") : t("providers.customConnect");
  }
  return t("providers.connect", {
    name: providerDisplayName(activeModal.id, t),
  });
}

function MappingEditor({
  label,
  mappingLabel,
  isDeployment,
  rows,
  modelOptions,
  disabled,
  onChange,
}: {
  label: string;
  mappingLabel: string;
  isDeployment: boolean;
  rows: MappingRowState[];
  modelOptions: Array<{ id: string; label: string }>;
  disabled: boolean;
  onChange: (rows: MappingRowState[]) => void;
}) {
  const t = useT();
  const defaultModelId = modelOptions[0]?.id ?? "";
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-(length:--text-title-sm) font-semibold text-(--text)">{label}</h3>
          <p className="mt-0.5 text-(length:--text-caption) text-(--text-muted)">
            {t("providers.mappings.subtitle")}
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
          {t("common.add")}
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
                placeholder={
                  isDeployment
                    ? t("providers.mappings.deploymentPlaceholder")
                    : t("providers.mappings.modelIdPlaceholder")
                }
                onChange={(e) =>
                  updateMapping(rows, onChange, index, { id: e.target.value.trim() })
                }
              />
            </Field>
            <Field label={t("providers.mappings.canonicalModel")}>
              <Select.Root
                value={row.modelId}
                onValueChange={(modelId) => updateMapping(rows, onChange, index, { modelId })}
                disabled={disabled}
              >
                <Select.Trigger>
                  <Select.Value placeholder={t("providers.mappings.chooseModel")} />
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
                aria-label={t("providers.mappings.removeMapping")}
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
  iconSrc,
  iconAlt,
  fallbackIcon: Fallback,
}: {
  iconSrc?: string;
  iconAlt?: string;
  fallbackIcon?: React.ComponentType<{
    className?: string;
    weight?: "regular" | "bold" | "fill";
  }>;
}) {
  if (iconSrc) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) border border-(--border) bg-white">
        <img src={iconSrc} alt={iconAlt ?? ""} className="size-5" draggable={false} />
      </span>
    );
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--surface-raised) text-(--text)">
      {Fallback ? <Fallback weight="bold" className="size-5" /> : null}
    </span>
  );
}

function ConnectedPill() {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded-(--radius-pill) border border-(--success)/30 bg-(--success-soft)/60 px-2 py-0.5 text-(length:--text-caption) text-(--success)">
      <Icons.CheckCircle weight="fill" className="size-3.5 text-(--success)" />
      {t("common.connected")}
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

function statusIcon(
  status: ProviderTestStatus,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
) {
  if (status.kind === "testing") {
    return <Icons.CircleNotch weight="bold" className="size-4 animate-spin" />;
  }
  if (status.kind === "ok") {
    return (
      <Tooltip
        content={
          status.sampleModelId
            ? t("providers.connectedWith", { model: status.sampleModelId })
            : t("common.connected")
        }
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

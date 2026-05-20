import type { ImageModelDef, VideoModelDef } from "@imagent/core";
import type { AppPreferencesPayload, ProviderId, ProviderSummary } from "@imagent/ipc";
import { Button, Icons, Input, type ThemePref } from "@imagent/ui";
import type * as React from "react";
import { useMemo } from "react";
import type { LocalePref } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import {
  createUnifiedModelOptions,
  ProviderModelPicker,
} from "../Studio/modelPicker.js";

export function SubGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function Field({
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

type DefaultModelValue = NonNullable<AppPreferencesPayload["defaultImageModel"]>;

export function DefaultModelPicker({
  mode,
  providers,
  modelsByProvider,
  value,
  favoriteKeys,
  onToggleFavorite,
  onChange,
  noProvidersLabel,
}: {
  mode: "image" | "video";
  providers: ProviderSummary[];
  modelsByProvider: Record<string, Array<ImageModelDef | VideoModelDef>>;
  value: DefaultModelValue | null;
  favoriteKeys: Set<string>;
  onToggleFavorite: Parameters<typeof ProviderModelPicker>[0]["onToggleFavorite"];
  onChange: (value: DefaultModelValue) => void;
  noProvidersLabel: string;
}) {
  const options = useMemo(
    () => createUnifiedModelOptions(providers, modelsByProvider),
    [providers, modelsByProvider],
  );
  const first = options[0];
  const providerId = value?.providerId ?? first?.providerId ?? "";
  const modelId = value?.modelId ?? first?.modelId ?? "";

  if (providers.length === 0) {
    return <p className="text-(length:--text-body-sm) text-(--text-muted)">{noProvidersLabel}</p>;
  }

  return (
    <ProviderModelPicker
      mode={mode}
      options={options}
      providerId={providerId}
      modelId={modelId}
      favoriteKeys={favoriteKeys}
      onToggleFavorite={onToggleFavorite}
      onChange={(next) => onChange({ providerId: next.providerId, modelId: next.modelId })}
    />
  );
}

export async function loadModels<T extends ImageModelDef | VideoModelDef>(
  providers: ProviderSummary[],
  mode: "image" | "video",
): Promise<Record<string, T[]>> {
  if (providers.length === 0) {
    return {};
  }
  const nextModels: Record<string, T[]> = {};
  await Promise.all(
    providers.map(async (provider) => {
      try {
        const response =
          mode === "image"
            ? await api["image.models"]({ providerId: provider.id as ProviderId })
            : await api["video.models"]({ providerId: provider.id as ProviderId });
        nextModels[provider.id] = response.models as T[];
      } catch {
        // Keep successfully loaded providers available if one provider fails.
      }
    }),
  );
  return nextModels;
}

export function SegmentedTheme({
  value,
  onChange,
  labels,
}: {
  value: ThemePref;
  onChange: (v: ThemePref) => void;
  labels: { light: string; dark: string; system: string };
}) {
  const opts: Array<{ id: ThemePref; label: string; icon: React.ReactNode }> = [
    {
      id: "system",
      label: labels.system,
      icon: <Icons.Gear weight="duotone" className="size-4" />,
    },
    { id: "light", label: labels.light, icon: <Icons.Sun weight="duotone" className="size-4" /> },
    { id: "dark", label: labels.dark, icon: <Icons.Moon weight="duotone" className="size-4" /> },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--surface) p-1">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={
              "inline-flex items-center gap-2 rounded-(--radius-pill) px-3 py-1.5 text-(length:--text-nav-link) transition-colors duration-(--duration-fast) " +
              (active
                ? "bg-(--bg) text-(--text) shadow-[0_0_0_1px_var(--border)]"
                : "text-(--text-muted) hover:text-(--text)")
            }
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedLanguage({
  value,
  onChange,
  labels,
}: {
  value: LocalePref;
  onChange: (v: LocalePref) => void;
  labels: { system: string; en: string; zh: string };
}) {
  const opts: Array<{ id: LocalePref; label: string; icon: React.ReactNode }> = [
    {
      id: "system",
      label: labels.system,
      icon: <Icons.Gear weight="duotone" className="size-4" />,
    },
    {
      id: "en",
      label: labels.en,
      icon: <Icons.Translate weight="duotone" className="size-4" />,
    },
    {
      id: "zh",
      label: labels.zh,
      icon: <Icons.Translate weight="duotone" className="size-4" />,
    },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--surface) p-1">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={
              "inline-flex items-center gap-2 rounded-(--radius-pill) px-3 py-1.5 text-(length:--text-nav-link) transition-colors duration-(--duration-fast) " +
              (active
                ? "bg-(--bg) text-(--text) shadow-[0_0_0_1px_var(--border)]"
                : "text-(--text-muted) hover:text-(--text)")
            }
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function DefaultOutputDirField({
  label,
  helperText,
  value,
  chooseLabel,
  resetLabel,
  placeholder,
  onChoose,
  onReset,
}: {
  label: string;
  helperText: string;
  value: string | null;
  chooseLabel: string;
  resetLabel: string;
  placeholder: string;
  onChoose: () => void;
  onReset: () => void;
}) {
  return (
    <Field label={label} helperText={helperText}>
      <div className="flex gap-2">
        <Input value={value ?? ""} placeholder={placeholder} readOnly className="flex-1" />
        <Button variant="secondary" size="md" onClick={onChoose}>
          {chooseLabel}
        </Button>
        {value ? (
          <Button variant="ghost" size="md" onClick={onReset}>
            {resetLabel}
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

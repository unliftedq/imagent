import type { SpeechModelDef, ImageModelDef, VideoModelDef } from "@imagent/core";
import type { ProviderId, ProviderSummary } from "@imagent/ipc";
import { Icons, Popover } from "@imagent/ui";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useT } from "../../i18n/index.js";
import type { StudioMode } from "../../state/useUIStore.js";
import { MODEL_FAVORITES_LS_KEY, type ModelFavoriteKey, type UnifiedModelOption } from "./types.js";

export function ProviderModelPicker({
  mode,
  options,
  providerId,
  modelId,
  favoriteKeys,
  onToggleFavorite,
  onChange,
}: {
  mode: StudioMode;
  options: UnifiedModelOption[];
  providerId: string;
  modelId: string;
  favoriteKeys: Set<string>;
  onToggleFavorite: (key: ModelFavoriteKey) => void;
  onChange: (next: { providerId: ProviderId; modelId: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const current = options.find(
    (option) => option.providerId === providerId && option.modelId === modelId,
  );
  const favorites = options.filter((option) => favoriteKeys.has(modelFavoriteKey(mode, option)));
  const providers = uniqueProviders(options);
  const triggerLabel = current?.displayName ?? t("studio.chooseModel");

  const choose = (option: UnifiedModelOption): void => {
    onChange({ providerId: option.providerId, modelId: option.modelId });
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={
            "inline-flex h-8 max-w-[240px] items-center gap-2 rounded-(--radius-pill) " +
            "border border-(--border) bg-(--bg) px-3 text-[12px] text-(--text) " +
            "transition-colors duration-(--motion-fast) hover:border-(--text) " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
          }
          title={triggerLabel}
        >
          <Icons.MagicWand weight="duotone" className="size-3.5 shrink-0 text-(--text-muted)" />
          <span className="min-w-0 truncate font-semibold">{triggerLabel}</span>
        </button>
      </Popover.Trigger>
      <Popover.Content className="w-[420px] p-2">
        <div className="flex flex-col gap-2">
          {favorites.length > 0 ? (
            <ModelPickerSection title={t("gallery.favorites")}>
              {favorites.map((option) => (
                <ModelPickerRow
                  key={`fav:${option.providerId}:${option.modelId}`}
                  mode={mode}
                  option={option}
                  active={option.providerId === providerId && option.modelId === modelId}
                  favorite={favoriteKeys.has(modelFavoriteKey(mode, option))}
                  onChoose={() => choose(option)}
                  onToggleFavorite={onToggleFavorite}
                  showProvider
                />
              ))}
            </ModelPickerSection>
          ) : null}

          {providers.map((provider) => {
            const providerOptions = options.filter((option) => option.providerId === provider.id);
            return (
              <ModelPickerSection key={provider.id} title={provider.name}>
                {providerOptions.map((option) => (
                  <ModelPickerRow
                    key={`${option.providerId}:${option.modelId}`}
                    mode={mode}
                    option={option}
                    active={option.providerId === providerId && option.modelId === modelId}
                    favorite={favoriteKeys.has(modelFavoriteKey(mode, option))}
                    onChoose={() => choose(option)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </ModelPickerSection>
            );
          })}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function ModelPickerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-2 pt-1 text-[11px] font-semibold text-(--text-muted)">{title}</h3>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function ModelPickerRow({
  mode,
  option,
  active,
  favorite,
  showProvider,
  onChoose,
  onToggleFavorite,
}: {
  mode: StudioMode;
  option: UnifiedModelOption;
  active: boolean;
  favorite: boolean;
  showProvider?: boolean;
  onChoose: () => void;
  onToggleFavorite: (key: ModelFavoriteKey) => void;
}) {
  const t = useT();
  const favoriteKey = modelFavoriteKey(mode, option);

  return (
    <div
      className={
        "group flex w-full items-center gap-3 rounded-(--radius-sm) px-2 py-2 text-left " +
        "transition-colors duration-(--motion-fast) hover:bg-(--surface) " +
        (active ? "bg-(--accent-soft)" : "")
      }
    >
      <button
        type="button"
        onClick={onChoose}
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none"
      >
        <span className="truncate text-[12px] font-semibold text-(--text)">
          {option.displayName}
        </span>
        <span className="truncate text-[11px] text-(--text-faint)">
          {showProvider ? `${option.providerName} · ${option.modelId}` : option.modelId}
        </span>
      </button>
      <button
        type="button"
        aria-label={
          favorite ? t("studio.modelPicker.unfavorite") : t("studio.modelPicker.favorite")
        }
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite(favoriteKey);
        }}
        className={
          "inline-flex size-7 shrink-0 items-center justify-center rounded-(--radius-sm) " +
          "text-(--text-faint) transition-colors duration-(--motion-fast) " +
          "hover:bg-(--bg) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-(--focus-ring) " +
          (favorite ? "text-(--accent)" : "")
        }
      >
        <Icons.Star weight={favorite ? "fill" : "regular"} className="size-4" />
      </button>
    </div>
  );
}

export function useModelFavorites(): {
  favoriteKeys: Set<string>;
  toggleFavorite: (key: ModelFavoriteKey) => void;
} {
  const [favoriteList, setFavoriteList] = useState<ModelFavoriteKey[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(MODEL_FAVORITES_LS_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isModelFavoriteKey) : [];
    } catch {
      return [];
    }
  });

  const favoriteKeys = useMemo(() => new Set<string>(favoriteList), [favoriteList]);
  const toggleFavorite = (key: ModelFavoriteKey): void => {
    setFavoriteList((prev) => {
      const next = prev.includes(key) ? prev.filter((value) => value !== key) : [key, ...prev];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(MODEL_FAVORITES_LS_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  return { favoriteKeys, toggleFavorite };
}

export function createUnifiedModelOptions(
  providers: ProviderSummary[],
  modelsByProvider: Record<string, Array<ImageModelDef | VideoModelDef | SpeechModelDef>>,
): UnifiedModelOption[] {
  return providers.flatMap((provider) =>
    (modelsByProvider[provider.id] ?? []).map((model) => ({
      providerId: provider.id,
      providerName: provider.displayName,
      modelId: model.id,
      displayName: model.displayName ?? model.id,
      capabilities: model.capabilities,
    })),
  );
}

function modelFavoriteKey(mode: StudioMode, option: UnifiedModelOption): ModelFavoriteKey {
  return `${mode}:${option.providerId}:${option.modelId}`;
}

function isModelFavoriteKey(value: unknown): value is ModelFavoriteKey {
  return typeof value === "string" && /^(image|video|speech):[^:]+:.+$/.test(value);
}

function uniqueProviders(options: UnifiedModelOption[]): Array<{ id: ProviderId; name: string }> {
  const seen = new Set<string>();
  const providers: Array<{ id: ProviderId; name: string }> = [];
  for (const option of options) {
    if (seen.has(option.providerId)) continue;
    seen.add(option.providerId);
    providers.push({ id: option.providerId, name: option.providerName });
  }
  return providers;
}

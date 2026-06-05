import type { ProviderId } from "@imagent/ipc";
import { Icons } from "@imagent/ui";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useUIStore } from "../../state/useUIStore.js";
import { pickModelLogo } from "./modelLogo.js";

interface ProviderEntry {
  providerId: ProviderId;
  modelId: string;
  displayName: string;
  configured: boolean;
}

interface ModelRow {
  id: string;
  displayName: string | null;
  providers: ProviderEntry[];
}

interface ModelList {
  image: ModelRow[];
  video: ModelRow[];
  audio: ModelRow[];
}

type Tab = "image" | "video" | "audio";

/**
 * Models settings section. Catalogue of known models, grouped by kind,
 * with the providers that can serve each. Rendered inside `SettingsDialog`;
 * the section heading is provided by the dialog chrome.
 */
export function ModelsSection() {
  const t = useT();
  const setSettingsSection = useUIStore((s) => s.setSettingsSection);
  const pushToast = useUIStore((s) => s.pushToast);
  const [tab, setTab] = useState<Tab>("image");
  const [list, setList] = useState<ModelList | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const out = await api["models.list"]();
        setList(out);
      } catch (err) {
        pushToast({
          title: t("models.failedToLoad"),
          description: (err as Error)?.message ?? String(err),
          variant: "error",
        });
      }
    })();
  }, [pushToast, t]);

  const rows = useMemo(() => {
    if (!list) return [];
    if (tab === "image") return list.image;
    if (tab === "video") return list.video;
    return list.audio;
  }, [list, tab]);

  const totals = useMemo(() => {
    if (!list) return { image: 0, video: 0, audio: 0 };
    return { image: list.image.length, video: list.video.length, audio: list.audio.length };
  }, [list]);

  return (
    <>
      <div className="mb-4 inline-flex rounded-(--radius-md) border border-(--border) bg-(--surface) p-1">
        <TabButton active={tab === "image"} onClick={() => setTab("image")}>
          {t("common.image")} · {totals.image}
        </TabButton>
        <TabButton active={tab === "video"} onClick={() => setTab("video")}>
          {t("common.video")} · {totals.video}
        </TabButton>
        <TabButton active={tab === "audio"} onClick={() => setTab("audio")}>
          {t("common.audio")} · {totals.audio}
        </TabButton>
      </div>

      {!list ? (
        <p className="text-(length:--text-body-sm) text-(--text-muted)">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-(--radius-md) border border-dashed border-(--border) p-8 text-center">
          <Icons.Brain weight="duotone" className="mx-auto size-8 text-(--text-muted)" />
          <p className="mt-2 text-(length:--text-body-sm) text-(--text-muted)">
            {tab === "image"
              ? t("models.noImageModels")
              : tab === "video"
                ? t("models.noVideoModels")
                : t("models.noAudioModels")}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <ModelRowView
              key={`${tab}:${row.id}`}
              row={row}
              onConfigureProvider={() => setSettingsSection("providers")}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function ModelRowView({
  row,
  onConfigureProvider,
}: {
  row: ModelRow;
  onConfigureProvider: () => void;
}) {
  const t = useT();
  const anyConfigured = row.providers.some((p) => p.configured);
  const logo = pickModelLogo(row.id);
  return (
    <li
      className={`flex flex-col gap-3 rounded-(--radius-lg) border border-(--border) bg-(--bg) p-5 ${
        anyConfigured ? "" : "opacity-80"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={
              "flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) " +
              "border border-(--border) bg-white"
            }
          >
            {logo ? (
              <img src={logo.src} alt={logo.alt} className="size-5" draggable={false} />
            ) : (
              <Icons.Brain weight="duotone" className="size-5 text-(--text-muted)" />
            )}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-(length:--text-title-sm) font-semibold text-(--text)">
              {row.displayName ?? row.id}
            </span>
            {row.displayName ? (
              <code className="font-(family-name:--font-mono) text-(length:--text-caption) text-(--text-muted)">
                {row.id}
              </code>
            ) : null}
          </div>
        </div>
        {!anyConfigured ? (
          <button
            type="button"
            onClick={onConfigureProvider}
            className="text-(length:--text-caption) text-(--accent) underline-offset-2 hover:underline"
          >
            {t("models.configureProvider")}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {row.providers.length > 0 ? (
          row.providers.map((p) => (
            <ProviderBadge key={`${p.providerId}:${p.modelId}`} provider={p} rowId={row.id} />
          ))
        ) : (
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-(--radius-pill) " +
              "bg-(--surface) px-2.5 py-0.5 text-(length:--text-caption) " +
              "text-(--text-muted) border border-(--border)"
            }
          >
            <span className="size-1.5 rounded-(--radius-full) bg-(--text-faint)" />
            {t("models.addProviderMapping")}
          </span>
        )}
      </div>
    </li>
  );
}

function ProviderBadge({ provider, rowId }: { provider: ProviderEntry; rowId: string }) {
  const label =
    provider.modelId === rowId
      ? provider.displayName
      : `${provider.displayName}: ${provider.modelId}`;
  if (provider.configured) {
    return (
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-(--radius-pill) " +
          "bg-(--success-soft)/40 px-2.5 py-0.5 text-(length:--text-caption) " +
          "text-(--success) border border-(--success)/30"
        }
      >
        <span className="size-1.5 rounded-(--radius-full) bg-(--success)" />
        {label}
      </span>
    );
  }
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-(--radius-pill) " +
        "bg-(--surface) px-2.5 py-0.5 text-(length:--text-caption) " +
        "text-(--text-muted) border border-(--border)"
      }
    >
      <span className="size-1.5 rounded-(--radius-full) bg-(--text-faint)" />
      {label}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-(--radius-sm) px-3 py-1.5 text-(length:--text-body-sm) ${
        active
          ? "bg-(--bg) font-semibold text-(--text) shadow-sm"
          : "text-(--text-muted) hover:text-(--text)"
      }`}
    >
      {children}
    </button>
  );
}

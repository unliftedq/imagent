import { useEffect, useMemo, useState } from "react";
import { Icons } from "@imagent/ui";
import type { ProviderId } from "@imagent/ipc";
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
}

type Tab = "image" | "video";

export function ModelsPage() {
  const navigate = useUIStore((s) => s.navigate);
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
          title: "Failed to load models",
          description: (err as Error)?.message ?? String(err),
          variant: "error",
        });
      }
    })();
  }, [pushToast]);

  const rows = useMemo(() => {
    if (!list) return [];
    return tab === "image" ? list.image : list.video;
  }, [list, tab]);

  const totals = useMemo(() => {
    if (!list) return { image: 0, video: 0 };
    return { image: list.image.length, video: list.video.length };
  }, [list]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-(length:--text-display-sm) font-display font-medium tracking-(--text-display-sm--letter-spacing) text-(--text)">
            Models
          </h1>
          <p className="mt-2 text-(length:--text-body-md) text-(--text)">
            Catalog of every model the studio knows about, grouped by id. Green badges mark
            providers whose auth is saved; gray badges mark providers where the same model would
            work once you configure them.
          </p>
        </div>
      </header>

      <div className="mb-4 inline-flex rounded-(--radius-md) border border-(--border) bg-(--surface) p-1">
        <TabButton active={tab === "image"} onClick={() => setTab("image")}>
          Image · {totals.image}
        </TabButton>
        <TabButton active={tab === "video"} onClick={() => setTab("video")}>
          Video · {totals.video}
        </TabButton>
      </div>

      {!list ? (
        <p className="text-(length:--text-body-sm) text-(--text-muted)">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-(--radius-md) border border-dashed border-(--border) p-8 text-center">
          <Icons.Brain weight="duotone" className="mx-auto size-8 text-(--text-muted)" />
          <p className="mt-2 text-(length:--text-body-sm) text-(--text-muted)">
            No {tab} models in the catalog.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <ModelRowView
              key={`${tab}:${row.id}`}
              row={row}
              onConfigureProvider={() => navigate("providers")}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ModelRowView({
  row,
  onConfigureProvider,
}: {
  row: ModelRow;
  onConfigureProvider: () => void;
}) {
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
              <img
                src={logo.src}
                alt={logo.alt}
                className="size-5"
                draggable={false}
              />
            ) : (
              <Icons.Brain
                weight="duotone"
                className="size-5 text-(--text-muted)"
              />
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
            Configure provider
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
            Add provider mapping
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

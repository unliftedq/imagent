import type { Asset } from "@imagent/core";
import { IpcClientError } from "@imagent/ipc";
import { AssetCard, Button, Icons, Tabs, Tooltip } from "@imagent/ui";
import { useEffect, useMemo, useState } from "react";
import { useT, type MessageKey } from "../../i18n/index.js";
import { useAssetsStore } from "../../state/useAssetsStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { ArchivedAssetRow } from "./ArchivedAssetRow.js";
import { AssetDrawer } from "./AssetDrawer.js";
import { AssetSearchInput } from "./AssetSearchInput.js";
import { CreateAssetDialog } from "./CreateAssetDialog.js";
import { ACTIVE_TAB_LS_KEY, type AssetsTab, KINDS, TRASH_TAB } from "./constants.js";
import { resolveAssetThumbnailUrl } from "./utils.js";

const KIND_PLURAL_KEYS: Record<(typeof KINDS)[number], MessageKey> = {
  character: "assets.kind.characters",
  object: "assets.kind.objects",
  background: "assets.kind.backgrounds",
  style: "assets.kind.styles",
};

const KIND_SINGULAR_KEYS: Record<(typeof KINDS)[number], MessageKey> = {
  character: "assets.kind.character",
  object: "assets.kind.object",
  background: "assets.kind.background",
  style: "assets.kind.style",
};

export { resolveAssetThumbnailUrl } from "./utils.js";

export function AssetsPage() {
  const t = useT();
  const byKind = useAssetsStore((s) => s.byKind);
  const archived = useAssetsStore((s) => s.archived);
  const refresh = useAssetsStore((s) => s.refresh);
  const refreshArchived = useAssetsStore((s) => s.refreshArchived);
  const setSearch = useAssetsStore((s) => s.setSearch);
  const archiveAsset = useAssetsStore((s) => s.archive);
  const restoreAsset = useAssetsStore((s) => s.restore);
  const permanentlyDelete = useAssetsStore((s) => s.permanentlyDelete);
  const updateAsset = useAssetsStore((s) => s.update);
  const pushToast = useUIStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<AssetsTab>(() => {
    if (typeof window === "undefined") return "character";
    const stored = window.localStorage.getItem(ACTIVE_TAB_LS_KEY);
    if (stored === TRASH_TAB) return TRASH_TAB;
    if (stored && KINDS.includes(stored as (typeof KINDS)[number])) {
      return stored as (typeof KINDS)[number];
    }
    return "character";
  });
  const [search, setSearchInput] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<(typeof KINDS)[number]>("character");
  const [drawerId, setDrawerId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    void refreshArchived();
  }, [refresh, refreshArchived]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACTIVE_TAB_LS_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(search.trim() || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, setSearch]);

  const drawerAsset = useMemo(() => {
    if (!drawerId) return null;
    for (const k of KINDS) {
      const hit = byKind[k].find((a) => a.id === drawerId);
      if (hit) return hit;
    }
    const arch = archived.find((a) => a.id === drawerId);
    return arch ?? null;
  }, [byKind, archived, drawerId]);

  const onCreated = (created: Asset): void => {
    setCreateOpen(false);
    setActiveTab(created.kind);
    setDrawerId(created.id);
  };

  const hasSearch = search.trim().length > 0;

  const onArchive = async (id: string): Promise<void> => {
    try {
      await archiveAsset(id);
      setDrawerId(null);
      pushToast({
        title: t("assets.toast.movedToTrash"),
        description: t("assets.toast.movedToTrashDesc"),
        variant: "success",
      });
    } catch (err) {
      pushToast({
        title: t("assets.toast.archiveFailed"),
        description: err instanceof IpcClientError ? err.message : (err as Error)?.message,
        variant: "error",
      });
    }
  };

  const onRestore = async (id: string): Promise<void> => {
    try {
      await restoreAsset(id);
      pushToast({ title: t("assets.toast.restored"), variant: "success" });
    } catch (err) {
      pushToast({
        title: t("assets.toast.restoreFailed"),
        description: err instanceof IpcClientError ? err.message : (err as Error)?.message,
        variant: "error",
      });
    }
  };

  const onPermanentlyDelete = async (id: string): Promise<void> => {
    try {
      await permanentlyDelete(id);
      setDrawerId(null);
    } catch (err) {
      pushToast({
        title: t("assets.toast.deleteFailed"),
        description: err instanceof IpcClientError ? err.message : (err as Error)?.message,
        variant: "error",
      });
    }
  };

  const onEmptyTrash = async (): Promise<void> => {
    if (archived.length === 0) return;
    if (
      !window.confirm(
        archived.length === 1
          ? t("assets.emptyTrashConfirmOne", { count: archived.length })
          : t("assets.emptyTrashConfirmMany", { count: archived.length }),
      )
    ) {
      return;
    }
    let failures = 0;
    for (const a of archived) {
      try {
        await permanentlyDelete(a.id);
      } catch {
        failures += 1;
      }
    }
    pushToast({
      title:
        failures === 0
          ? t("assets.toast.trashEmptied")
          : t("assets.toast.trashEmptiedWithFailed", { failures }),
      variant: failures === 0 ? "success" : "warning",
    });
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 px-8 py-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-(length:--text-display-sm) font-(family-name:--font-display) text-(--text)">
            {t("assets.title")}
          </h1>
          <p className="text-(length:--text-body-sm) text-(--text-muted)">
            {t("assets.subtitle")}
          </p>
        </div>
        <Button
          leadingIcon={<Icons.Plus weight="bold" className="size-4" />}
          onClick={() => {
            setCreateKind(activeTab === TRASH_TAB ? "character" : activeTab);
            setCreateOpen(true);
          }}
        >
          {t("assets.new")}
        </Button>
      </header>

      <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as AssetsTab)}>
        <Tabs.List>
          {KINDS.map((k) => (
            <Tabs.Trigger key={k} value={k}>
              {t(KIND_PLURAL_KEYS[k])}
              <span className="ml-2 rounded-(--radius-pill) bg-(--surface) px-1.5 text-[10px] font-semibold text-(--text-muted) [font-variant-numeric:tabular-nums]">
                {byKind[k]?.length ?? 0}
              </span>
            </Tabs.Trigger>
          ))}
          <Tabs.Trigger value={TRASH_TAB}>
            <Icons.Trash weight="duotone" className="mr-1 size-4" />
            {t("assets.trash")}
            <span className="ml-2 rounded-(--radius-pill) bg-(--surface) px-1.5 text-[10px] font-semibold text-(--text-muted) [font-variant-numeric:tabular-nums]">
              {archived.length}
            </span>
          </Tabs.Trigger>
        </Tabs.List>

        {KINDS.map((k) => (
          <Tabs.Content key={k} value={k} className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <AssetSearchInput
                placeholder={t("assets.searchKindPlaceholder", {
                  kind: t(KIND_PLURAL_KEYS[k]).toLowerCase(),
                })}
                value={search}
                onChange={setSearchInput}
              />
              <Tooltip content={t("assets.searchHelper")}>
                <button
                  type="button"
                  aria-label={t("toast.searchHelp")}
                  className={
                    "inline-flex size-7 items-center justify-center rounded-(--radius-pill) " +
                    "text-(--text-muted) transition-colors duration-(--duration-fast) " +
                    "hover:bg-(--surface) hover:text-(--text)"
                  }
                >
                  <Icons.Info weight="duotone" className="size-4" />
                </button>
              </Tooltip>
              {hasSearch ? (
                <span className="text-(length:--text-caption) text-(--text-muted)">
                  {(byKind[k]?.length ?? 0) === 1
                    ? t("assets.match", { count: byKind[k]?.length ?? 0 })
                    : t("assets.matches", { count: byKind[k]?.length ?? 0 })}
                </span>
              ) : null}
            </div>

            {(byKind[k]?.length ?? 0) === 0 ? (
              <AssetsEmptyState
                kind={k}
                hasSearch={hasSearch}
                onClearSearch={() => setSearchInput("")}
                onCreate={() => {
                  setCreateKind(k);
                  setCreateOpen(true);
                }}
              />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,260px))] justify-start gap-4">
                {(byKind[k] ?? []).map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    thumbnailUrl={resolveAssetThumbnailUrl(a)}
                    onClick={() => setDrawerId(a.id)}
                  />
                ))}
              </div>
            )}
          </Tabs.Content>
        ))}

        <Tabs.Content value={TRASH_TAB} className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <AssetSearchInput
              placeholder={t("assets.searchTrashPlaceholder")}
              value={search}
              onChange={setSearchInput}
            />
            <div className="flex items-center gap-3">
              {hasSearch ? (
                <span className="text-(length:--text-caption) text-(--text-muted)">
                  {archived.length === 1
                    ? t("assets.match", { count: archived.length })
                    : t("assets.matches", { count: archived.length })}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onEmptyTrash()}
                disabled={archived.length === 0}
                leadingIcon={<Icons.Trash weight="bold" className="size-4" />}
              >
                {t("assets.emptyTrash")}
              </Button>
            </div>
          </div>
          {archived.length === 0 ? (
            <TrashEmptyState hasSearch={hasSearch} onClearSearch={() => setSearchInput("")} />
          ) : (
            <ul className="flex flex-col gap-1">
              {archived.map((a) => (
                <ArchivedAssetRow
                  key={a.id}
                  asset={a}
                  onOpen={() => setDrawerId(a.id)}
                  onRestore={() => void onRestore(a.id)}
                  onPermanentlyDelete={() => {
                    if (window.confirm(t("assets.deleteConfirm", { name: a.name }))) {
                      void onPermanentlyDelete(a.id);
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </Tabs.Content>
      </Tabs.Root>

      <CreateAssetDialog
        open={createOpen}
        kind={createKind}
        onKindChange={setCreateKind}
        onClose={() => setCreateOpen(false)}
        onCreated={onCreated}
      />

      <AssetDrawer
        asset={drawerAsset}
        onClose={() => setDrawerId(null)}
        onArchive={onArchive}
        onPermanentlyDelete={onPermanentlyDelete}
        onRestore={onRestore}
        onSave={async (patch) => {
          if (!drawerAsset) return;
          await updateAsset({ id: drawerAsset.id, ...patch });
        }}
      />
    </div>
  );
}

function AssetsEmptyState({
  kind,
  hasSearch,
  onClearSearch,
  onCreate,
}: {
  kind: (typeof KINDS)[number];
  hasSearch: boolean;
  onClearSearch: () => void;
  onCreate: () => void;
}) {
  const t = useT();
  if (hasSearch) {
    return (
      <div className="mx-auto mt-16 flex w-full max-w-[420px] flex-col items-center text-center">
        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-(--radius-pill) bg-(--surface)">
          <Icons.MagnifyingGlass weight="duotone" className="size-6 text-(--text-muted)" />
        </div>
        <h2 className="text-(length:--text-title) font-semibold tracking-[-0.01em] text-(--text)">
          {t("assets.empty.noMatches")}
        </h2>
        <p className="mt-1.5 max-w-[320px] text-(length:--text-body-sm) leading-5 text-(--text-muted)">
          {t("assets.empty.noMatchesBody")}
        </p>
        <Button variant="secondary" size="sm" className="mt-5" onClick={onClearSearch}>
          {t("common.clearSearch")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-20 flex w-full max-w-[420px] flex-col items-center text-center">
      <div className="relative mb-5 flex size-20 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-(--radius-pill) bg-(--accent)/8"
        />
        <span
          aria-hidden="true"
          className="absolute inset-2 rounded-(--radius-pill) bg-(--accent)/12"
        />
        <AssetKindIcon kind={kind} className="relative size-9 text-(--accent)" />
      </div>
      <h2 className="text-(length:--text-display) font-semibold tracking-[-0.01em] text-(--text)">
        {t("assets.empty.noKindYet", { kind: t(KIND_PLURAL_KEYS[kind]).toLowerCase() })}
      </h2>
      <p className="mt-2 max-w-[340px] text-(length:--text-body-sm) leading-5 text-(--text-muted)">
        {kind === "style"
          ? t("assets.empty.styleBody")
          : t("assets.empty.kindBody", { kind: t(KIND_PLURAL_KEYS[kind]).toLowerCase() })}
      </p>
      <div className="mt-6 inline-flex items-center gap-2">
        <Button onClick={onCreate} leadingIcon={<Icons.Plus weight="bold" className="size-4" />}>
          {t("assets.empty.newKind", { kind: t(KIND_SINGULAR_KEYS[kind]).toLowerCase() })}
        </Button>
      </div>
    </div>
  );
}

function TrashEmptyState({
  hasSearch,
  onClearSearch,
}: {
  hasSearch: boolean;
  onClearSearch: () => void;
}) {
  const t = useT();
  if (hasSearch) {
    return (
      <div className="mx-auto mt-16 flex w-full max-w-[420px] flex-col items-center text-center">
        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-(--radius-pill) bg-(--surface)">
          <Icons.MagnifyingGlass weight="duotone" className="size-6 text-(--text-muted)" />
        </div>
        <h2 className="text-(length:--text-title) font-semibold tracking-[-0.01em] text-(--text)">
          {t("assets.empty.noMatches")}
        </h2>
        <p className="mt-1.5 max-w-[320px] text-(length:--text-body-sm) leading-5 text-(--text-muted)">
          {t("assets.empty.trashNoMatchBody")}
        </p>
        <Button variant="secondary" size="sm" className="mt-5" onClick={onClearSearch}>
          {t("common.clearSearch")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-20 flex w-full max-w-[420px] flex-col items-center text-center">
      <div className="mb-4 inline-flex size-14 items-center justify-center rounded-(--radius-pill) bg-(--surface)">
        <Icons.Trash weight="duotone" className="size-6 text-(--text-muted)" />
      </div>
      <h2 className="text-(length:--text-title) font-semibold tracking-[-0.01em] text-(--text)">
        {t("assets.empty.trashIsEmpty")}
      </h2>
      <p className="mt-1.5 max-w-[320px] text-(length:--text-body-sm) leading-5 text-(--text-muted)">
        {t("assets.empty.trashIsEmptyBody")}
      </p>
    </div>
  );
}

function AssetKindIcon({ kind, className }: { kind: (typeof KINDS)[number]; className?: string }) {
  if (kind === "character") return <Icons.UserCircle weight="duotone" className={className} />;
  if (kind === "object") return <Icons.Cube weight="duotone" className={className} />;
  if (kind === "background") return <Icons.Mountains weight="duotone" className={className} />;
  return <Icons.Palette weight="duotone" className={className} />;
}

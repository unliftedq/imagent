import type { Asset } from "@imagine/core";
import { IpcClientError } from "@imagine/ipc";
import { AssetCard, Button, EmptyState, Icons, Tabs } from "@imagine/ui";
import { useEffect, useMemo, useState } from "react";
import { CreateAssetDialog } from "./CreateAssetDialog.js";
import { AssetDrawer } from "./AssetDrawer.js";
import { ArchivedAssetRow } from "./ArchivedAssetRow.js";
import { AssetSearchInput } from "./AssetSearchInput.js";
import {
  ACTIVE_TAB_LS_KEY,
  KINDS,
  KIND_LABEL,
  TRASH_TAB,
  type AssetsTab,
} from "./constants.js";
import { useAssetsStore } from "../../state/useAssetsStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { resolveAssetThumbnailUrl } from "./utils.js";
export { resolveAssetThumbnailUrl } from "./utils.js";

export function AssetsPage() {
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
    const t = setTimeout(() => {
      setSearch(search.trim() || undefined);
    }, 300);
    return () => clearTimeout(t);
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

  const onArchive = async (id: string): Promise<void> => {
    try {
      await archiveAsset(id);
      setDrawerId(null);
      pushToast({
        title: "Moved to Trash",
        description: "Restore from the Trash tab.",
        variant: "success",
      });
    } catch (err) {
      pushToast({
        title: "Archive failed",
        description: err instanceof IpcClientError ? err.message : (err as Error)?.message,
        variant: "error",
      });
    }
  };

  const onRestore = async (id: string): Promise<void> => {
    try {
      await restoreAsset(id);
      pushToast({ title: "Restored", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Restore failed",
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
        title: "Delete failed",
        description: err instanceof IpcClientError ? err.message : (err as Error)?.message,
        variant: "error",
      });
    }
  };

  const onEmptyTrash = async (): Promise<void> => {
    if (archived.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${archived.length} asset${
          archived.length === 1 ? "" : "s"
        }? This removes the files on disk and cannot be undone.`,
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
          ? "Trash emptied"
          : `Trash emptied (${failures} failed)`,
      variant: failures === 0 ? "success" : "warning",
    });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-(length:--text-display-sm) font-(family-name:--font-display) text-(--text)">
            Assets
          </h1>
          <p className="text-(length:--text-body-sm) text-(--text-muted)">
            Reusable characters, objects, backgrounds, and styles for your generations.
          </p>
        </div>
        <Button
          leadingIcon={<Icons.Plus weight="bold" className="size-4" />}
          onClick={() => {
            setCreateKind(activeTab === TRASH_TAB ? "character" : activeTab);
            setCreateOpen(true);
          }}
        >
          New
        </Button>
      </header>

      <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as AssetsTab)}>
        <Tabs.List>
          {KINDS.map((k) => (
            <Tabs.Trigger key={k} value={k}>
              {KIND_LABEL[k]}
              <span className="ml-2 rounded-(--radius-pill) bg-(--surface) px-1.5 text-[10px] font-semibold text-(--text-muted) [font-variant-numeric:tabular-nums]">
                {byKind[k]?.length ?? 0}
              </span>
            </Tabs.Trigger>
          ))}
          <Tabs.Trigger value={TRASH_TAB}>
            <Icons.Trash weight="duotone" className="mr-1 size-4" />
            Trash
            <span className="ml-2 rounded-(--radius-pill) bg-(--surface) px-1.5 text-[10px] font-semibold text-(--text-muted) [font-variant-numeric:tabular-nums]">
              {archived.length}
            </span>
          </Tabs.Trigger>
        </Tabs.List>

        {KINDS.map((k) => (
          <Tabs.Content key={k} value={k} className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <AssetSearchInput
                placeholder={`Search ${KIND_LABEL[k].toLowerCase()}…`}
                value={search}
                onChange={setSearchInput}
              />
            </div>

            {(byKind[k]?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Icons.Folder weight="duotone" className="size-10" />}
                title={`No ${KIND_LABEL[k].toLowerCase()} yet`}
                description={
                  k === "style"
                    ? "Styles can be a reference image, a prompt snippet, or both."
                    : `Add a ${k} with one or more reference images.`
                }
                action={
                  <Button
                    leadingIcon={<Icons.Plus weight="bold" className="size-4" />}
                    onClick={() => {
                      setCreateKind(k);
                      setCreateOpen(true);
                    }}
                  >
                    New {k}
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
          <div className="flex items-center justify-between gap-2">
            <SearchInput
              placeholder="Search trash…"
              value={search}
              onChange={setSearchInput}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onEmptyTrash()}
              disabled={archived.length === 0}
              leadingIcon={<Icons.Trash weight="bold" className="size-4" />}
            >
              Empty Trash
            </Button>
          </div>
          {archived.length === 0 ? (
            <EmptyState
              icon={<Icons.Trash weight="duotone" className="size-10" />}
              title="Trash is empty"
              description="Archived assets land here and can be restored at any time."
            />
          ) : (
            <ul className="flex flex-col gap-1">
              {archived.map((a) => (
                    <ArchivedAssetRow
                      key={a.id}
                      asset={a}
                      onOpen={() => setDrawerId(a.id)}
                  onRestore={() => void onRestore(a.id)}
                  onPermanentlyDelete={() => {
                    if (
                      window.confirm(
                        `Permanently delete '${a.name}'? Files on disk will be removed.`,
                      )
                    ) {
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

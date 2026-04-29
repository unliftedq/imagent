import { useEffect, useMemo, useState } from "react";
import {
  AssetCard,
  Button,
  Dialog,
  EmptyState,
  Icons,
  Input,
  Tabs,
  Textarea,
} from "@imagine/ui";
import type { Asset, AssetKind } from "@imagine/core";
import { IpcClientError } from "@imagine/ipc";
import { api } from "../lib/api.js";
import { useAssetsStore } from "../state/useAssetsStore.js";
import { useUIStore } from "../state/useUIStore.js";

const KINDS: AssetKind[] = ["character", "object", "background", "style"];
const KIND_LABEL: Record<AssetKind, string> = {
  character: "Characters",
  object: "Objects",
  background: "Backgrounds",
  style: "Styles",
};
/**
 * The Trash tab (M8) joins Characters / Objects / Backgrounds / Styles to
 * give us five tab values total. It's a top-level value (not a kind) because
 * it cuts across all four kinds.
 */
const TRASH_TAB = "__trash__" as const;
type AssetsTab = AssetKind | typeof TRASH_TAB;
const ACTIVE_TAB_LS_KEY = "imagine.activeAssetTab.v1";
const MAX_UPLOADS = 10;

/**
 * Assets page (M6) — four-kind CRUD per design.md §11; M8 adds the Trash
 * tab and the archive-first soft-delete flow. Permanent delete is the
 * second-step destructive action on the drawer + every Trash row.
 */
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
    if (stored && KINDS.includes(stored as AssetKind)) {
      return stored as AssetKind;
    }
    return "character";
  });
  const [search, setSearchInput] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<AssetKind>("character");
  const [drawerId, setDrawerId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    void refreshArchived();
  }, [refresh, refreshArchived]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACTIVE_TAB_LS_KEY, activeTab);
  }, [activeTab]);

  // Debounce the search → store query.
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
            // From the Trash tab, default the new-asset dialog to character
            // (the Trash tab is not a kind).
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
              <SearchInput
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
                <TrashRow
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

// ---------------------------------------------------------------------------
// CreateAssetDialog
// ---------------------------------------------------------------------------

interface CreateDialogProps {
  open: boolean;
  kind: AssetKind;
  onKindChange: (k: AssetKind) => void;
  onClose: () => void;
  onCreated: (asset: Asset) => void;
}

interface PendingFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  bytes: ArrayBuffer;
  previewUrl: string;
}

function CreateAssetDialog({
  open,
  kind,
  onKindChange,
  onClose,
  onCreated,
}: CreateDialogProps) {
  const create = useAssetsStore((s) => s.create);
  const pushToast = useUIStore((s) => s.pushToast);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptSnippet, setPromptSnippet] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setPromptSnippet("");
      setFiles((prev) => {
        for (const f of prev) URL.revokeObjectURL(f.previewUrl);
        return [];
      });
      setError(null);
      setDragOver(false);
      setSubmitting(false);
    }
  }, [open]);

  const addFiles = async (incoming: FileList | File[]): Promise<void> => {
    const arr = Array.from(incoming);
    const next: PendingFile[] = [];
    for (const f of arr) {
      if (files.length + next.length >= MAX_UPLOADS) {
        pushToast({
          title: "Upload cap",
          description: `Up to ${MAX_UPLOADS} reference images per asset. Extras dropped.`,
          variant: "warning",
        });
        break;
      }
      const buf = await f.arrayBuffer();
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: f.name,
        mimeType: f.type || "application/octet-stream",
        size: f.size,
        bytes: buf,
        previewUrl: URL.createObjectURL(f),
      });
    }
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (id: string): void => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (kind !== "style" && files.length === 0) {
      setError(`${kind} assets require at least one reference image.`);
      return;
    }
    if (kind === "style" && files.length === 0 && !promptSnippet.trim()) {
      setError("Style assets require at least one reference OR a prompt snippet.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await create({
        kind,
        name: name.trim(),
        description: description.trim() || null,
        promptSnippet: promptSnippet.trim() || null,
        fileUploads: files.map((f) => ({
          bytes: new Uint8Array(f.bytes),
          originalName: f.name,
          mimeType: f.mimeType,
        })),
      });
      onCreated(created);
    } catch (err) {
      setError(
        err instanceof IpcClientError
          ? err.message
          : (err as Error)?.message ?? String(err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await addFiles(e.dataTransfer.files);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <Dialog.Content className="max-w-2xl">
        <Dialog.Title className="text-(length:--text-title-lg) font-semibold text-(--text)">
          New asset
        </Dialog.Title>
        <Dialog.Description className="mt-1 text-(length:--text-body-sm) text-(--text-muted)">
          Create a reusable {kind === "style" ? "style" : kind} that can be picked from any
          generation.
        </Dialog.Description>

        <div className="mt-4 flex flex-col gap-4">
          <Field label="Kind">
            <div className="flex gap-1 rounded-(--radius-pill) bg-(--surface) p-1">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onKindChange(k)}
                  className={
                    "flex-1 rounded-(--radius-pill) px-3 py-1.5 text-(length:--text-caption) " +
                    "capitalize transition-colors duration-(--duration-fast) " +
                    (kind === k
                      ? "bg-(--bg) text-(--text) shadow-[0_0_0_1px_var(--border)]"
                      : "text-(--text-muted) hover:text-(--text)")
                  }
                >
                  {k}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "character" ? "Alice" : kind === "style" ? "Studio Ghibli" : ""}
              autoFocus
            />
          </Field>

          <Field label="Description (optional)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about this asset…"
              rows={2}
            />
          </Field>

          {kind === "style" ? (
            <Field label="Prompt snippet (style only)">
              <Textarea
                value={promptSnippet}
                onChange={(e) => setPromptSnippet(e.target.value)}
                placeholder="e.g. soft pastel watercolor, hand-drawn lines"
                rows={2}
              />
              <span className="text-(length:--text-caption) text-(--text-faint)">
                Used when the model lacks reference support. Reference image takes precedence.
              </span>
            </Field>
          ) : null}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => void onDrop(e)}
            className={
              "rounded-(--radius-md) border border-dashed px-4 py-6 text-center " +
              "transition-colors duration-(--duration-fast) " +
              (dragOver
                ? "border-(--text) bg-(--surface-raised)"
                : "border-(--border) bg-(--surface)")
            }
          >
            <p className="text-(length:--text-caption) text-(--text-muted)">
              Drag reference images here, or
              <label className="ml-1 cursor-pointer text-(--text) underline underline-offset-2">
                browse
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      void addFiles(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </p>
            <p className="mt-1 text-(length:--text-caption) text-(--text-faint)">
              Up to {MAX_UPLOADS} per asset. {files.length} attached.
            </p>
          </div>

          {files.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="relative size-16 overflow-hidden rounded-(--radius-sm) border border-(--border)"
                >
                  {/* biome-ignore lint/a11y/useAltText: filename caption below */}
                  <img
                    src={f.previewUrl}
                    alt={f.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className={
                      "absolute right-0.5 top-0.5 inline-flex size-5 items-center justify-center " +
                      "rounded-full bg-(--bg) text-(--text) " +
                      "transition-colors duration-(--duration-fast) " +
                      "hover:bg-(--danger) hover:text-(--accent-fg)"
                    }
                    aria-label={`Remove ${f.name}`}
                  >
                    <Icons.X weight="bold" className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-(--radius-md) border border-(--danger)/40 bg-(--danger)/10 px-3 py-2 text-(length:--text-caption) text-(--danger)">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Saving…" : "Create asset"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

interface DrawerProps {
  asset: Asset | null;
  onClose: () => void;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onPermanentlyDelete: (id: string) => Promise<void>;
  onSave: (patch: {
    name?: string;
    description?: string | null;
    promptSnippet?: string | null;
  }) => Promise<void>;
}

function AssetDrawer({
  asset,
  onClose,
  onArchive,
  onRestore,
  onPermanentlyDelete,
  onSave,
}: DrawerProps) {
  const pushToast = useUIStore((s) => s.pushToast);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptSnippet, setPromptSnippet] = useState("");
  const [confirmHardDelete, setConfirmHardDelete] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setName(asset.name);
    setDescription(asset.description ?? "");
    setPromptSnippet(asset.promptSnippet ?? "");
    setConfirmHardDelete(false);
  }, [asset]);

  const dirty =
    asset !== null &&
    (asset.name !== name ||
      (asset.description ?? "") !== description ||
      (asset.promptSnippet ?? "") !== promptSnippet);

  const save = async (): Promise<void> => {
    if (!asset || !dirty) return;
    try {
      await onSave({
        name: name.trim() || asset.name,
        description: description.trim() || null,
        ...(asset.kind === "style"
          ? { promptSnippet: promptSnippet.trim() || null }
          : {}),
      });
      pushToast({ title: "Saved", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Save failed",
        description: err instanceof IpcClientError ? err.message : (err as Error)?.message,
        variant: "error",
      });
    }
  };

  const openFolder = async (): Promise<void> => {
    if (!asset) return;
    try {
      await api["system.openPath"]({ path: `assets/${asset.id}` });
    } catch (err) {
      pushToast({
        title: "Could not open folder",
        description: (err as Error)?.message,
        variant: "error",
      });
    }
  };

  const refs = asset?.files.filter((f) => f.role === "reference") ?? [];

  return (
    <Dialog.Root open={asset !== null} onOpenChange={(v) => (v ? null : onClose())}>
      <Dialog.Sheet>
        {asset ? (
          <div className="flex h-full flex-col gap-4">
            <Dialog.Title className="text-(length:--text-title-lg) font-semibold text-(--text)">
              {asset.name}
            </Dialog.Title>
            <span
              className={
                "inline-flex w-fit items-center rounded-(--radius-pill) bg-(--surface-raised) " +
                "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1.5px] text-(--text)"
              }
            >
              {asset.kind}
            </span>

            {refs.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {refs.map((f) => (
                  <a
                    key={f.id}
                    href={resolveDataUrl(f.relPath)}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square overflow-hidden rounded-(--radius-sm) border border-(--border)"
                  >
                    {/* biome-ignore lint/a11y/useAltText: covered by hover title below */}
                    <img
                      src={resolveDataUrl(f.relPath)}
                      alt={f.relPath}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : asset.kind === "style" ? (
              <p className="text-(length:--text-caption) text-(--text-muted)">
                No reference images — this style relies on the prompt snippet below.
              </p>
            ) : null}

            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </Field>
            {asset.kind === "style" ? (
              <Field label="Prompt snippet">
                <Textarea
                  value={promptSnippet}
                  onChange={(e) => setPromptSnippet(e.target.value)}
                  rows={2}
                />
                <span className="text-(length:--text-caption) text-(--text-faint)">
                  Reference is preferred when the model supports refs; otherwise this snippet is
                  appended to the prompt.
                </span>
              </Field>
            ) : null}

            <div className="mt-auto flex flex-col gap-2 border-t border-(--border-faint) pt-4">
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => void openFolder()}>
                  Open folder
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={!dirty}>
                  Save
                </Button>
              </div>
              <div className="flex items-center justify-end gap-2">
                {asset.archivedAt !== null ? (
                  // Archived asset: drawer surfaces Restore + permanent delete.
                  confirmHardDelete ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmHardDelete(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void onPermanentlyDelete(asset.id)}
                      >
                        Confirm permanent delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={
                          <Icons.ArrowCounterClockwise
                            weight="bold"
                            className="size-4"
                          />
                        }
                        onClick={() => void onRestore(asset.id)}
                      >
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmHardDelete(true)}
                      >
                        Delete permanently
                      </Button>
                    </>
                  )
                ) : confirmHardDelete ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmHardDelete(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void onPermanentlyDelete(asset.id)}
                    >
                      Confirm permanent delete
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmHardDelete(true)}
                    >
                      Delete permanently
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Icons.Trash weight="bold" className="size-4" />}
                      onClick={() => void onArchive(asset.id)}
                    >
                      Archive
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Dialog.Sheet>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-(length:--text-caption) font-semibold text-(--text-muted)">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Search input with the Phosphor MagnifyingGlass prefix and a Clear affordance.
 * 300ms debounce lives at the call site so the input still tracks keystrokes
 * for snappy typing.
 */
function SearchInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <Icons.MagnifyingGlass
        weight="bold"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--text-muted)"
      />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-8"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className={
            "absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center " +
            "justify-center rounded-(--radius-pill) text-(--text-muted) " +
            "transition-colors duration-(--duration-fast) hover:bg-(--surface) hover:text-(--text)"
          }
        >
          <Icons.X weight="bold" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function TrashRow({
  asset,
  onOpen,
  onRestore,
  onPermanentlyDelete,
}: {
  asset: Asset;
  onOpen: () => void;
  onRestore: () => void;
  onPermanentlyDelete: () => void;
}) {
  const thumb = resolveAssetThumbnailUrl(asset);
  return (
    <li
      className={
        "flex items-center gap-3 rounded-(--radius-md) border border-(--border) " +
        "bg-(--bg) px-3 py-2"
      }
    >
      <button
        type="button"
        onClick={onOpen}
        className="size-10 shrink-0 overflow-hidden rounded-(--radius-sm) bg-(--surface)"
        aria-label={`Open ${asset.name}`}
      >
        {thumb ? (
          // biome-ignore lint/a11y/useAltText: alt provided via aria-label on button
          <img src={thumb} alt={asset.name} className="block h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-(--text-muted)">
            <Icons.Folder weight="duotone" className="size-5" />
          </div>
        )}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
      >
        <span className="truncate text-(length:--text-body-sm) font-semibold text-(--text)">
          {asset.name}
        </span>
        <span className="text-(length:--text-caption) text-(--text-muted)">
          {asset.archivedAt
            ? `Archived ${new Date(asset.archivedAt).toLocaleDateString()}`
            : "Archived"}
        </span>
      </button>
      <span
        className={
          "shrink-0 inline-flex items-center rounded-(--radius-pill) bg-(--surface-raised) " +
          "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1.5px] text-(--text)"
        }
      >
        {asset.kind}
      </span>
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<Icons.ArrowCounterClockwise weight="bold" className="size-4" />}
        onClick={onRestore}
      >
        Restore
      </Button>
      <Button variant="ghost" size="sm" onClick={onPermanentlyDelete}>
        Delete permanently
      </Button>
    </li>
  );
}

function resolveDataUrl(relPath: string): string {
  const w = window as unknown as { __imagineDataDir__?: string };
  const dataDir = w.__imagineDataDir__ ?? "";
  if (!dataDir) return relPath;
  const norm = relPath.replace(/\\/g, "/");
  const root = dataDir.replace(/\\/g, "/");
  return `file:///${root}/${norm}`.replace(/\/+/g, "/").replace("file:/", "file:///");
}

export function resolveAssetThumbnailUrl(asset: Asset): string | null {
  const thumb = asset.files.find((f) => f.role === "thumbnail");
  const ref = asset.files.find((f) => f.role === "reference");
  const target = thumb ?? ref;
  return target ? resolveDataUrl(target.relPath) : null;
}

import type { Asset } from "@imagine/core";
import { IpcClientError } from "@imagine/ipc";
import { Button, Dialog, Icons, Input, Textarea } from "@imagine/ui";
import { useEffect, useState } from "react";
import { useUIStore } from "../../state/useUIStore.js";
import { AssetField } from "./AssetField.js";
import { resolveDataUrl } from "./utils.js";

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

export function AssetDrawer({
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
        ...(asset.kind === "style" ? { promptSnippet: promptSnippet.trim() || null } : {}),
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

  const reference = asset?.files.find((f) => f.role === "reference") ?? null;
  const isArchived = asset?.archivedAt != null;

  return (
    <Dialog.Root open={asset !== null} onOpenChange={(v) => (v ? null : onClose())}>
      <Dialog.Sheet
        className="overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {asset ? (
          <div className="flex h-full min-h-0 flex-col">
            <header className="shrink-0 border-b border-(--border-faint) px-6 py-5 pr-14">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--surface) text-(--text-muted)">
                  {asset.kind === "style" ? (
                    <Icons.Palette weight="duotone" className="size-5" />
                  ) : asset.kind === "background" ? (
                    <Icons.Mountains weight="duotone" className="size-5" />
                  ) : asset.kind === "object" ? (
                    <Icons.Cube weight="duotone" className="size-5" />
                  ) : (
                    <Icons.UserCircle weight="duotone" className="size-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="break-words text-(length:--text-title-lg) font-semibold leading-tight text-(--text)">
                    {asset.name}
                  </Dialog.Title>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={
                        "inline-flex w-fit items-center rounded-(--radius-pill) bg-(--surface-raised) " +
                        "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1.5px] text-(--text)"
                      }
                    >
                      {assetKindLabel(asset.kind)}
                    </span>
                    {isArchived ? (
                      <span className="text-(length:--text-caption) text-(--text-muted)">
                        Archived {new Date(asset.archivedAt!).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
              <section className="flex flex-col gap-3">
                <div className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
                  Reference
                </div>
                {reference ? (
                  <div className="overflow-hidden rounded-(--radius-md) border border-(--border) bg-(--surface-sunken)">
                    <img
                      src={resolveDataUrl(reference.relPath)}
                      alt={reference.relPath}
                      className="block max-h-[360px] w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-(--radius-md) border border-dashed border-(--border) bg-(--surface) px-4 py-8 text-center">
                    <Icons.FileImage weight="duotone" className="size-8 text-(--text-faint)" />
                    <p className="text-(length:--text-caption) text-(--text-muted)">
                      {asset.kind === "style"
                        ? "No reference image. This style can rely on the prompt snippet below."
                        : "No reference image attached."}
                    </p>
                  </div>
                )}
                {reference ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-(length:--text-caption) text-(--text-muted)">
                    {reference.width && reference.height ? (
                      <span>
                        {reference.width} x {reference.height}
                      </span>
                    ) : null}
                    <span>{reference.mimeType}</span>
                    <span>{formatBytes(reference.bytes)}</span>
                  </div>
                ) : null}
              </section>

              <section className="flex flex-col gap-4 border-t border-(--border-faint) pt-5">
                <div className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
                  Details
                </div>
                <AssetField label="Name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </AssetField>
                <AssetField label="Description">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </AssetField>
                {asset.kind === "style" ? (
                  <AssetField label="Prompt snippet">
                    <Textarea
                      value={promptSnippet}
                      onChange={(e) => setPromptSnippet(e.target.value)}
                      rows={3}
                    />
                    <span className="text-(length:--text-caption) text-(--text-faint)">
                      Reference is preferred when the model supports refs; otherwise this snippet is
                      appended to the prompt.
                    </span>
                  </AssetField>
                ) : null}
              </section>
            </div>

            <footer className="shrink-0 border-t border-(--border-faint) px-6 py-4">
              {confirmHardDelete ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-(length:--text-caption) text-(--danger)">
                    Delete this asset permanently?
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmHardDelete(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void onPermanentlyDelete(asset.id)}
                    >
                      Confirm delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-(--danger) hover:bg-(--danger-soft)"
                    onClick={() => setConfirmHardDelete(true)}
                  >
                    Delete permanently
                  </Button>
                  <div className="flex shrink-0 items-center gap-2">
                    {isArchived ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={
                          <Icons.ArrowCounterClockwise weight="bold" className="size-4" />
                        }
                        onClick={() => void onRestore(asset.id)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Icons.Trash weight="bold" className="size-4" />}
                        onClick={() => void onArchive(asset.id)}
                      >
                        Archive
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void save()} disabled={!dirty}>
                      Save changes
                    </Button>
                  </div>
                </div>
              )}
            </footer>
          </div>
        ) : null}
      </Dialog.Sheet>
    </Dialog.Root>
  );
}

function assetKindLabel(kind: Asset["kind"]): string {
  switch (kind) {
    case "character":
      return "Character";
    case "object":
      return "Object";
    case "background":
      return "Background";
    case "style":
      return "Style";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

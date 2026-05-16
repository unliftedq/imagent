import type { Asset } from "@imagent/core";
import { IpcClientError } from "@imagent/ipc";
import { Button, Dialog, Icons, Input, Textarea } from "@imagent/ui";
import { useEffect, useState } from "react";
import { type MessageKey, useT } from "../../i18n/index.js";
import { useUIStore } from "../../state/useUIStore.js";
import { AssetField } from "./AssetField.js";
import { resolveDataUrl } from "./utils.js";

const KIND_SINGULAR_KEYS: Record<Asset["kind"], MessageKey> = {
  character: "assets.kind.character",
  object: "assets.kind.object",
  background: "assets.kind.background",
  style: "assets.kind.style",
};

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
  const t = useT();
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
      pushToast({ title: t("assets.toast.saved"), variant: "success" });
    } catch (err) {
      pushToast({
        title: t("assets.toast.saveFailed"),
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
                      {t(KIND_SINGULAR_KEYS[asset.kind])}
                    </span>
                    {isArchived ? (
                      <span className="text-(length:--text-caption) text-(--text-muted)">
                        {t("assets.archivedOn", {
                          date: new Date(asset.archivedAt!).toLocaleDateString(),
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
              <section className="flex flex-col gap-3">
                <div className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
                  {t("assets.drawer.reference")}
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
                        ? t("studio.noReferenceImageStyle")
                        : t("studio.noReferenceImage")}
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
                  {t("assets.drawer.details")}
                </div>
                <AssetField label={t("assets.name")}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </AssetField>
                <AssetField label={t("assets.descriptionLabel")}>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </AssetField>
                {asset.kind === "style" ? (
                  <AssetField label={t("assets.promptSnippet")}>
                    <Textarea
                      value={promptSnippet}
                      onChange={(e) => setPromptSnippet(e.target.value)}
                      rows={3}
                    />
                    <span className="text-(length:--text-caption) text-(--text-faint)">
                      {t("assets.promptSnippetDrawerHint")}
                    </span>
                  </AssetField>
                ) : null}
              </section>
            </div>

            <footer className="shrink-0 border-t border-(--border-faint) px-6 py-4">
              {confirmHardDelete ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-(length:--text-caption) text-(--danger)">
                    {t("assets.deletePermConfirm")}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmHardDelete(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void onPermanentlyDelete(asset.id)}
                    >
                      {t("assets.confirmDelete")}
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
                    {t("assets.deletePermanently")}
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
                        {t("assets.restore")}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Icons.Trash weight="bold" className="size-4" />}
                        onClick={() => void onArchive(asset.id)}
                      >
                        {t("assets.archive")}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void save()} disabled={!dirty}>
                      {t("assets.saveChanges")}
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

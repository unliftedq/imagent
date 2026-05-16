import type { Asset, AssetKind, GalleryItem } from "@imagent/core";
import { IpcClientError } from "@imagent/ipc";
import { Button, Dialog, Icons, Input, Textarea } from "@imagent/ui";
import { useEffect, useState } from "react";
import { type MessageKey, useT } from "../../i18n/index.js";
import { useAssetsStore } from "../../state/useAssetsStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { AssetField } from "./AssetField.js";
import { KINDS } from "./constants.js";

const KIND_SINGULAR_KEYS: Record<AssetKind, MessageKey> = {
  character: "assets.kind.character",
  object: "assets.kind.object",
  background: "assets.kind.background",
  style: "assets.kind.style",
};

interface CreateDialogProps {
  open: boolean;
  kind: AssetKind;
  onKindChange: (k: AssetKind) => void;
  onClose: () => void;
  onCreated: (asset: Asset) => void;
  gallerySource?: GalleryAssetSource | null;
}

export interface GalleryAssetSource {
  itemId: string;
  itemKind: GalleryItem["kind"];
  prompt: string;
  previewUrl: string;
  relPath: string;
}

interface PendingFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  bytes: ArrayBuffer;
  previewUrl: string;
}

export function CreateAssetDialog({
  open,
  kind,
  onKindChange,
  onClose,
  onCreated,
  gallerySource = null,
}: CreateDialogProps) {
  const t = useT();
  const create = useAssetsStore((s) => s.create);
  const createFromGalleryItem = useAssetsStore((s) => s.createFromGalleryItem);
  const pushToast = useUIStore((s) => s.pushToast);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptSnippet, setPromptSnippet] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  useEffect(() => {
    if (!open || !gallerySource) return;
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
  }, [open, gallerySource]);

  const addFiles = async (incoming: FileList | File[]): Promise<void> => {
    const [file, ...extras] = Array.from(incoming);
    if (!file) return;
    if (extras.length > 0) {
      pushToast({
        title: t("studio.oneReferenceAllowed"),
        description: t("studio.onlyFirstAttached"),
        variant: "warning",
      });
    }
    const buf = await file.arrayBuffer();
    const next: PendingFile = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      bytes: buf,
      previewUrl: URL.createObjectURL(file),
    };
    setFiles((prev) => {
      for (const f of prev) URL.revokeObjectURL(f.previewUrl);
      return [next];
    });
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
      setError(t("assets.validation.nameRequired"));
      return;
    }
    const usingGallerySource = Boolean(gallerySource) && files.length === 0;
    if (kind !== "style" && files.length === 0 && !usingGallerySource) {
      setError(t("assets.validation.kindNeedsReference", { kind: t(KIND_SINGULAR_KEYS[kind]) }));
      return;
    }
    if (kind === "style" && files.length === 0 && !usingGallerySource && !promptSnippet.trim()) {
      setError(t("assets.validation.styleNeedsReference"));
      return;
    }

    setSubmitting(true);
    try {
      const created = usingGallerySource
        ? await createFromGalleryItem({
            // `usingGallerySource` was set only when `gallerySource` exists, so
            // the non-null assertion is safe here.
            itemId: (gallerySource as NonNullable<typeof gallerySource>).itemId,
            kind,
            name: name.trim(),
            description: description.trim() || null,
            promptSnippet: promptSnippet.trim() || null,
          })
        : await create({
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
        err instanceof IpcClientError ? err.message : ((err as Error)?.message ?? String(err)),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDrop = async (e: React.DragEvent<HTMLLabelElement>): Promise<void> => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await addFiles(e.dataTransfer.files);
    }
  };

  const attachedFile = files[0] ?? null;
  const attachedGallerySource = attachedFile ? null : gallerySource;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <Dialog.Content className="max-w-2xl">
        <Dialog.Title className="text-(length:--text-title-lg) font-semibold text-(--text)">
          {t("assets.newAssetTitle")}
        </Dialog.Title>
        <Dialog.Description className="mt-1 text-(length:--text-body-sm) text-(--text-muted)">
          {gallerySource
            ? t("assets.dialog.galleryDesc")
            : t("assets.dialog.createDesc", { kind: t(KIND_SINGULAR_KEYS[kind]).toLowerCase() })}
        </Dialog.Description>

        <div className="mt-4 flex flex-col gap-4">
          <AssetField label={t("assets.kind")}>
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
                  {t(KIND_SINGULAR_KEYS[k])}
                </button>
              ))}
            </div>
          </AssetField>

          <AssetField label={t("assets.name")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "character" ? "Alice" : kind === "style" ? "Studio Ghibli" : ""}
              autoFocus
            />
          </AssetField>

          <AssetField label={t("assets.description")}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("assets.notes")}
              rows={2}
            />
          </AssetField>

          {kind === "style" ? (
            <AssetField label={t("assets.promptSnippetOptional")}>
              <Textarea
                value={promptSnippet}
                onChange={(e) => setPromptSnippet(e.target.value)}
                placeholder={t("assets.promptSnippetPlaceholder")}
                rows={2}
              />
              <span className="text-(length:--text-caption) text-(--text-faint)">
                {t("assets.promptSnippetHint")}
              </span>
            </AssetField>
          ) : null}

          <div className="relative">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => void onDrop(e)}
              className={
                "block cursor-pointer rounded-(--radius-md) border border-dashed text-center " +
                "transition-colors duration-(--duration-fast) " +
                (files.length > 0 ? "p-2" : "px-4 py-6") +
                " " +
                (dragOver
                  ? "border-(--text) bg-(--surface-raised)"
                  : "border-(--border) bg-(--surface)")
              }
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              {attachedFile ? (
                <div className="flex items-center gap-3 text-left">
                  <div className="size-20 shrink-0 overflow-hidden rounded-(--radius-sm) border border-(--border)">
                    <img
                      src={attachedFile.previewUrl}
                      alt={attachedFile.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 pr-8">
                    <div className="truncate text-(length:--text-body-sm) font-semibold text-(--text)">
                      {attachedFile.name}
                    </div>
                    <div className="text-(length:--text-caption) text-(--text-muted)">
                      {t("assets.referenceAttached")}
                    </div>
                  </div>
                </div>
              ) : attachedGallerySource ? (
                <div className="flex items-center gap-3 text-left">
                  <div className="size-20 shrink-0 overflow-hidden rounded-(--radius-sm) border border-(--border)">
                    <img
                      src={attachedGallerySource.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 pr-8">
                    <div className="truncate text-(length:--text-body-sm) font-semibold text-(--text)">
                      {attachedGallerySource.relPath}
                    </div>
                    <div className="text-(length:--text-caption) text-(--text-muted)">
                      {t("assets.galleryReferenceAttached")}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-(length:--text-caption) text-(--text-muted)">
                    {t("assets.dragHere")}
                    <span className="ml-1 text-(--text) underline underline-offset-2">
                      {t("assets.browse")}
                    </span>
                  </p>
                  <p className="mt-1 text-(length:--text-caption) text-(--text-faint)">
                    {t("assets.noReferenceAttached")}
                  </p>
                </>
              )}
            </label>
            {attachedFile ? (
              <button
                type="button"
                onClick={() => removeFile(attachedFile.id)}
                className={
                  "absolute right-3 top-3 inline-flex size-6 items-center justify-center " +
                  "rounded-full bg-(--bg) text-(--text) shadow-[0_0_0_1px_var(--border)] " +
                  "transition-colors duration-(--duration-fast) " +
                  "hover:bg-(--danger) hover:text-(--accent-fg)"
                }
                aria-label={`Remove ${attachedFile.name}`}
              >
                <Icons.X weight="bold" className="size-3.5" />
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-(--radius-md) border border-(--danger)/40 bg-(--danger)/10 px-3 py-2 text-(length:--text-caption) text-(--danger)">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? t("common.saving") : t("assets.createAsset")}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

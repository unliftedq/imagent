import type { Asset, AssetKind } from "@imagine/core";
import { IpcClientError } from "@imagine/ipc";
import { Button, Dialog, Icons, Input, Textarea } from "@imagine/ui";
import { useEffect, useState } from "react";
import { useAssetsStore } from "../../state/useAssetsStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { KINDS, MAX_UPLOADS } from "./constants.js";
import { Field } from "./components.js";

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

export function CreateAssetDialog({
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
                  <img src={f.previewUrl} alt={f.name} className="h-full w-full object-cover" />
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

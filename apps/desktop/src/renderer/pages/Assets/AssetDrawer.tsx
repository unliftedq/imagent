import type { Asset } from "@imagine/core";
import { IpcClientError } from "@imagine/ipc";
import { Button, Dialog, Icons, Input, Textarea } from "@imagine/ui";
import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { useUIStore } from "../../state/useUIStore.js";
import { Field } from "./components.js";
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
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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
                          <Icons.ArrowCounterClockwise weight="bold" className="size-4" />
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

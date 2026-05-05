import type { Asset } from "@imagent/core";
import { Button, Icons } from "@imagent/ui";
import { resolveAssetThumbnailUrl } from "./utils.js";

export function ArchivedAssetRow({
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

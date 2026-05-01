import type { Asset } from "@imagine/core";
import { Button, Icons, Input } from "@imagine/ui";
import { resolveAssetThumbnailUrl } from "./utils.js";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-(length:--text-caption) font-semibold text-(--text-muted)">
        {label}
      </span>
      {children}
    </label>
  );
}

export function SearchInput({
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

export function TrashRow({
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

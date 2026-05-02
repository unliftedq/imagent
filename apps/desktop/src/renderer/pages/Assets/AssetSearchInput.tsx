import { Icons, Input } from "@imagine/ui";

export function AssetSearchInput({
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

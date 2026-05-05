import type { GalleryItem } from "@imagent/core";
import { Button, Icons, Popover } from "@imagent/ui";
import type { DragEvent } from "react";
import { resolveGalleryUrl } from "./utils.js";

export function FirstFrameToolbarPicker({
  value,
  onChange,
  recentFrames,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  recentFrames: GalleryItem[];
}) {
  const onDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const path = (file as File & { path?: string }).path;
    if (typeof path === "string" && path.length > 0) onChange(path);
  };

  const label = value ? (value.split(/[\\/]/).pop() ?? value) : "First frame";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={
            "inline-flex h-8 max-w-[152px] items-center gap-2 rounded-(--radius-pill) " +
            "border border-(--border) bg-(--bg) px-3 text-[11px] text-(--text) " +
            "transition-colors duration-(--motion-fast) hover:border-(--text) " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
          }
        >
          <Icons.ImageSquare weight="duotone" className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </Popover.Trigger>
      <Popover.Content className="w-[340px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-(--text)">First frame</span>
            {value ? (
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                Clear
              </Button>
            ) : null}
          </div>
          <button
            type="button"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className={
              "flex min-h-16 w-full items-center justify-center rounded-(--radius-md) " +
              "border border-dashed border-(--border) bg-(--surface-sunken) " +
              "px-3 py-3 text-center text-[12px] text-(--text-muted)"
            }
          >
            {value ? <span className="truncate">{label}</span> : <span>Drop image here</span>}
          </button>
          {recentFrames.length === 0 ? (
            <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-4 text-center text-[12px] text-(--text-muted)">
              No recent images.
            </div>
          ) : (
            <div className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto">
              {recentFrames.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange(item.relPath)}
                  title={item.prompt}
                  className={
                    "block aspect-square overflow-hidden rounded-(--radius-xs) " +
                    "border border-(--border) bg-(--surface-sunken) hover:border-(--border-strong) " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
                  }
                >
                  <img
                    src={resolveGalleryUrl(item.relPath)}
                    alt={item.prompt}
                    className="block h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

import type { GalleryItem } from "@imagent/core";
import { Button, Icons, Popover } from "@imagent/ui";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { resolveGalleryAbsolutePath, resolveGalleryUrl } from "./utils.js";
import { IMAGE_FILE_FILTERS } from "./types.js";

export type FrameKind = "first" | "last";

export function FrameToolbarPicker({
  kind,
  value,
  onChange,
  recentFrames,
  onError,
}: {
  kind: FrameKind;
  value: string | null;
  onChange: (value: string | null) => void;
  recentFrames: GalleryItem[];
  onError: (message: string) => void;
}) {
  const t = useT();

  const titleLabel = kind === "first" ? t("studio.firstFrame") : t("studio.lastFrame");
  const buttonLabel = value ? (value.split(/[\\/]/).pop() ?? value) : titleLabel;

  const chooseLocalImage = async (): Promise<void> => {
    try {
      const result = await api["system.chooseFiles"]({
        multiple: false,
        filters: IMAGE_FILE_FILTERS,
      });
      const picked = result.paths[0];
      if (picked) onChange(picked);
    } catch (err) {
      onError((err as Error)?.message ?? String(err));
    }
  };

  const pickFromGallery = async (item: GalleryItem): Promise<void> => {
    try {
      const absPath = await resolveGalleryAbsolutePath(item.relPath);
      onChange(absPath);
    } catch (err) {
      onError((err as Error)?.message ?? String(err));
    }
  };

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
          <span className="truncate">{buttonLabel}</span>
        </button>
      </Popover.Trigger>
      <Popover.Content className="w-[340px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-(--text)">{titleLabel}</span>
            {value ? (
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                {t("common.clear")}
              </Button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void chooseLocalImage()}
            className={
              "flex h-10 items-center justify-center gap-2 rounded-(--radius-md) border border-dashed " +
              "border-(--border) bg-(--surface) text-[12px] text-(--text) transition-colors " +
              "duration-(--motion-fast) hover:border-(--text)"
            }
          >
            <Icons.FolderOpen weight="duotone" className="size-4 text-(--text-muted)" />
            {t("studio.uploadLocalImage")}
          </button>
          {recentFrames.length === 0 ? (
            <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-4 text-center text-[12px] text-(--text-muted)">
              {t("studio.noRecentImages")}
            </div>
          ) : (
            <div className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto">
              {recentFrames.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void pickFromGallery(item)}
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

import type { GalleryItem } from "@imagent/core";
import { Button, Icons, Popover } from "@imagent/ui";
import { useEffect, useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { resolveGalleryAbsolutePath, resolveGalleryUrl } from "./utils.js";
import { IMAGE_FILE_FILTERS } from "./types.js";

export type FrameKind = "first" | "last";

export function FrameToolbarPicker({
  kind,
  value,
  onChange,
  onError,
}: {
  kind: FrameKind;
  value: string | null;
  onChange: (value: string | null) => void;
  onError: (message: string) => void;
}) {
  const t = useT();
  const PAGE_SIZE = 120;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const titleLabel = kind === "first" ? t("studio.firstFrame") : t("studio.lastFrame");
  const buttonLabel = value ? (value.split(/[\\/]/).pop() ?? value) : titleLabel;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await api["gallery.query"]({
          kind: "image",
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
      } catch (err) {
        if (cancelled) return;
        onError((err as Error)?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, onError]);

  const loadMore = async (): Promise<void> => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api["gallery.query"]({
        kind: "image",
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it.id));
        const merged = [...prev];
        for (const item of result.items) {
          if (!seen.has(item.id)) merged.push(item);
        }
        return merged;
      });
      setTotal(result.total);
    } catch (err) {
      onError((err as Error)?.message ?? String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const chooseLocalImage = async (): Promise<void> => {
    try {
      const result = await api["system.chooseFiles"]({
        multiple: false,
        filters: IMAGE_FILE_FILTERS,
      });
      const picked = result.paths[0];
      if (picked) {
        onChange(picked);
        setOpen(false);
      }
    } catch (err) {
      onError((err as Error)?.message ?? String(err));
    }
  };

  const pickFromGallery = async (item: GalleryItem): Promise<void> => {
    try {
      const absPath = await resolveGalleryAbsolutePath(item.relPath);
      onChange(absPath);
      setOpen(false);
    } catch (err) {
      onError((err as Error)?.message ?? String(err));
    }
  };

  const hasMore = total !== null && items.length < total;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
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
          {loading && items.length === 0 ? (
            <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-4 text-center text-[12px] text-(--text-muted)">
              {t("common.loading")}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-4 text-center text-[12px] text-(--text-muted)">
              {t("studio.noRecentImages")}
            </div>
          ) : (
            <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
              <div className="grid grid-cols-4 gap-1.5">
                {items.map((item) => (
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
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className={
                    "mt-1 inline-flex h-8 items-center justify-center rounded-(--radius-sm) border " +
                    "border-(--border) bg-(--surface) text-[11px] text-(--text-muted) " +
                    "hover:border-(--border-strong) hover:text-(--text) disabled:opacity-60"
                  }
                >
                  {loadingMore
                    ? t("common.loading")
                    : t("gallery.loadMore", {
                        remaining: String((total ?? items.length) - items.length),
                      })}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

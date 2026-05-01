import { GalleryRail, type GalleryRailItem } from "@imagine/ui";
import { useEffect, useMemo, useState } from "react";
import type { StudioMode } from "../../state/useUIStore.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { resolveGalleryUrl } from "./utils.js";

export function StudioGalleryRail({
  mode,
  onViewAll,
}: {
  mode: StudioMode;
  onViewAll: () => void;
}) {
  const items = useGalleryStore((state) => state.items);
  const refresh = useGalleryStore((state) => state.refresh);
  const [filter, setFilter] = useState<"all" | "newest">("all");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const ofMode = items.filter((item) => item.kind === mode);
    if (filter === "newest") return ofMode.slice(0, 12);
    return ofMode.slice(0, 30);
  }, [items, mode, filter]);

  const railItems = useMemo<GalleryRailItem[]>(
    () =>
      filtered.map((item) => ({
        id: item.id,
        src:
          item.kind === "video"
            ? item.thumbPath
              ? resolveGalleryUrl(item.thumbPath)
              : ""
            : resolveGalleryUrl(item.relPath),
        ...(item.prompt ? { caption: item.prompt } : {}),
        kind: item.kind,
        favorited: item.favorited,
      })),
    [filtered],
  );

  return (
    <GalleryRail
      items={railItems}
      filter={filter}
      onFilterChange={setFilter}
      onItemClick={(id) => {
        window.dispatchEvent(
          new CustomEvent<{ id: string }>("imagine:canvas-pin", {
            detail: { id },
          }),
        );
      }}
      onViewAll={onViewAll}
    />
  );
}

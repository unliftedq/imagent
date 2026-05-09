import {
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface MasonryItemBase {
  id: string;
}

export interface MasonryGridProps<T extends MasonryItemBase> {
  items: ReadonlyArray<T>;
  /** Target column width in px; used to compute column count from container width. */
  columnWidth?: number;
  /** Gap between columns and rows in px. */
  gap?: number;
  /**
   * Returns the height-to-width ratio (height / width) for an item. Used to
   * pick which column is shortest. Should mirror the aspect ratio the rendered
   * card actually uses, otherwise placement will drift from the visual layout.
   */
  getAspect: (item: T) => number;
  renderItem: (item: T, columnWidth: number) => ReactNode;
}

/**
 * Xiaohongshu-style natural waterfall layout.
 *
 * Items are placed greedily into the currently-shortest column, so the visual
 * reading order is left → right, then top → bottom (matching the input order
 * which is newest-first). Unlike CSS multi-column (`columns: …`), rows are not
 * height-aligned; each card sits flush below its column predecessor, producing
 * the irregular cascade.
 *
 * Wrapped items are absolutely-positioned with only `width` fixed — height
 * comes from the card's own `aspect-ratio`, so a slight mismatch between the
 * card's intrinsic aspect and `getAspect` only affects column-balance, not
 * layout correctness.
 */
export function MasonryGrid<T extends MasonryItemBase>({
  items,
  columnWidth = 240,
  gap = 12,
  getAspect,
  renderItem,
}: MasonryGridProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (): void => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columnCount =
    containerWidth <= 0
      ? 1
      : Math.max(1, Math.floor((containerWidth + gap) / (columnWidth + gap)));
  const actualColumnWidth =
    containerWidth > 0
      ? (containerWidth - gap * (columnCount - 1)) / columnCount
      : columnWidth;

  const columnHeights = new Array<number>(columnCount).fill(0);
  const placements = items.map((item) => {
    let col = 0;
    let min = columnHeights[0] ?? 0;
    for (let i = 1; i < columnCount; i++) {
      const h = columnHeights[i] ?? 0;
      if (h < min) {
        min = h;
        col = i;
      }
    }
    const aspect = Math.max(0.1, getAspect(item));
    const itemHeight = actualColumnWidth * aspect;
    const top = columnHeights[col] ?? 0;
    const left = col * (actualColumnWidth + gap);
    columnHeights[col] = top + itemHeight + gap;
    return { left, top };
  });

  const totalHeight = columnHeights.length
    ? Math.max(...columnHeights) - gap
    : 0;
  const ready = containerWidth > 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: ready ? Math.max(0, totalHeight) : undefined }}
    >
      {ready
        ? items.map((item, i) => {
            const p = placements[i];
            if (!p) return null;
            return (
              <div
                key={item.id}
                style={{
                  position: "absolute",
                  left: p.left,
                  top: p.top,
                  width: actualColumnWidth,
                }}
              >
                {renderItem(item, actualColumnWidth)}
              </div>
            );
          })
        : null}
    </div>
  );
}

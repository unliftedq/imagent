import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { BoardSidebarItem, Icons } from "@imagent/ui";
import type { Board, GalleryItem } from "@imagent/core";
import { api } from "../../lib/api.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { resolveGalleryUrl } from "../Studio";

export function BoardRow({
  board,
  count,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  board: Board;
  count: number;
  active: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(board.name);
  const [menuOpen, setMenuOpen] = useState(false);

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          autoFocus
          className={
            "flex-1 rounded-(--radius-sm) border border-(--border) " +
            "bg-(--bg) px-2 py-1 text-(length:--text-body-sm) text-(--text) " +
            "focus:outline-none focus:border-(--text)"
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (draft.trim() && draft.trim() !== board.name) onRename(draft.trim());
              setEditing(false);
            }
            if (e.key === "Escape") {
              setEditing(false);
              setDraft(board.name);
            }
          }}
          onBlur={() => {
            if (draft.trim() && draft.trim() !== board.name) onRename(draft.trim());
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <BoardSidebarItem
        id={board.id}
        label={board.name}
        count={count}
        active={active}
        onClick={onClick}
        trailing={
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={
                "rounded-(--radius-sm) p-0.5 text-(--text-muted) " +
                "opacity-0 transition-opacity duration-(--duration-fast) " +
                "hover:bg-(--surface-raised) group-hover:opacity-100"
              }
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(true);
              }}
              aria-label="Board actions"
            >
              <Icons.Gear weight="bold" className="size-3.5" />
            </button>
          </DropdownMenu.Trigger>
        }
      />
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={
            "z-50 min-w-[176px] overflow-hidden rounded-(--radius-md) " +
            "border border-(--border) bg-(--bg) p-1 " +
            "shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08)] " +
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 " +
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          }
        >
          <DropdownMenu.Item
            onSelect={() => {
              setEditing(true);
              setDraft(board.name);
            }}
            className={
              "group flex cursor-pointer select-none items-center gap-2.5 " +
              "rounded-(--radius-sm) px-2.5 py-1.5 text-(length:--text-body-sm) text-(--text) " +
              "outline-none transition-colors duration-(--duration-fast) " +
              "data-[highlighted]:bg-(--surface)"
            }
          >
            <span className="inline-flex size-4 shrink-0 items-center justify-center text-(--text-muted)">
              <Icons.Pencil weight="bold" className="size-4" />
            </span>
            Rename
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-(--border-faint)" />
          <DropdownMenu.Item
            onSelect={() => onDelete()}
            className={
              "group flex cursor-pointer select-none items-center gap-2.5 " +
              "rounded-(--radius-sm) px-2.5 py-1.5 text-(length:--text-body-sm) text-(--danger) " +
              "outline-none transition-colors duration-(--duration-fast) " +
              "data-[highlighted]:bg-(--danger-soft)"
            }
          >
            <span className="inline-flex size-4 shrink-0 items-center justify-center text-(--danger)">
              <Icons.Trash weight="bold" className="size-4" />
            </span>
            Delete board
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function LightboxPreview({
  itemId,
  onClose,
  onRemix,
  onSaveAsAsset,
}: {
  itemId: string;
  onClose: () => void;
  onRemix: (id: string) => void;
  onSaveAsAsset: (item: GalleryItem) => void;
}) {
  const [data, setData] = useState<{
    item: GalleryItem;
    parent: GalleryItem | null;
    children: GalleryItem[];
    siblings: GalleryItem[];
    assets: Array<{
      assetId: string;
      role: string;
      name: string | null;
      kind: "character" | "object" | "background" | "style" | null;
    }>;
  } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [copied, setCopied] = useState(false);
  const removeItem = useGalleryStore((s) => s.remove);
  const toggleFav = useGalleryStore((s) => s.toggleFavorite);
  const cachedItem = useGalleryStore((s) =>
    s.items.find((it) => it.id === itemId) ?? null,
  );
  const mediaPreviewStyle = data ? getMediaPreviewStyle(data.item) : undefined;

  // Show the cached row from the store immediately so the lightbox never
  // flashes "Loading…" — gallery.show() then enriches with lineage + assets.
  useEffect(() => {
    if (cachedItem && !data) {
      setData({
        item: cachedItem,
        parent: null,
        children: [],
        siblings: [],
        assets: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedItem]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await api["gallery.show"]({ id: itemId });
        if (!cancelled) {
          setData({
            item: r.item,
            parent: r.parent ?? null,
            children: r.children,
            siblings: r.siblings,
            assets: r.assets ?? [],
          });
        }
      } catch {
        // Stay open with whatever we have from the store; lineage / assets
        // panel will simply remain empty until the next refresh.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const copyPrompt = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={
            "fixed inset-0 z-40 bg-black/72 backdrop-blur-[2px] " +
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 " +
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          }
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={
            "fixed inset-0 z-50 flex flex-col outline-none " +
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 " +
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          }
          onClick={(e) => {
            // Click outside the media closes the lightbox.
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <Dialog.Title className="sr-only">Gallery item preview</Dialog.Title>
          {/* Close button — top-right. */}
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className={
              "absolute right-4 top-4 z-10 inline-flex size-9 items-center justify-center " +
              "rounded-(--radius-pill) bg-white/8 text-white backdrop-blur-md " +
              "transition-colors duration-(--duration-fast) hover:bg-white/16"
            }
          >
            <Icons.X weight="bold" className="size-4" />
          </button>

          {data ? (
            <>
              {/*
                Padding budget — pt-16 keeps the close button (top-4, ~36px)
                from sitting on top of the media; pb-24 reserves room for the
                floating action bar (bottom-6, ~40px tall) so large images
                never get clipped at the bottom edge. The inner wrapper has
                `overflow-hidden` so the zoomed image is clipped to the
                content region instead of bleeding into the chrome.
              */}
              <div
                className="relative flex min-h-0 flex-1 px-6 pb-24 pt-16 sm:px-12"
                onClick={(e) => {
                  if (e.target === e.currentTarget) onClose();
                }}
              >
                <div
                  className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) onClose();
                  }}
                >
                  {data.item.kind === "video" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={resolveGalleryUrl(data.item.relPath)}
                      controls
                      autoPlay
                      preload="metadata"
                      width={data.item.width || undefined}
                      height={data.item.height || undefined}
                      style={mediaPreviewStyle}
                      className="block h-auto max-h-full w-auto max-w-full rounded-(--radius-md) bg-black object-contain shadow-[0_24px_64px_-16px_rgba(0,0,0,0.65)]"
                    />
                  ) : (
                    <ZoomablePreviewImage
                      itemId={data.item.id}
                      src={resolveGalleryUrl(data.item.relPath)}
                      alt={data.item.prompt}
                      width={data.item.width}
                      height={data.item.height}
                      baseStyle={mediaPreviewStyle}
                    />
                  )}
                </div>
              </div>

              {/* Bottom action bar — floats over the dimmed overlay. */}
              <div
                className={
                  "pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center"
                }
              >
                <div
                  className={
                    "pointer-events-auto inline-flex items-center gap-1 rounded-(--radius-pill) " +
                    "border border-white/10 bg-black/55 p-1 text-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] " +
                    "backdrop-blur-xl"
                  }
                >
                  <LightboxAction
                    icon={
                      <Icons.MagicWand weight="bold" className="size-4" />
                    }
                    label="Remix"
                    onClick={() => onRemix(data.item.id)}
                  />
                  <LightboxAction
                    icon={
                      <Icons.Heart
                        weight={data.item.favorited ? "fill" : "regular"}
                        className={
                          data.item.favorited
                            ? "size-4 text-(--danger)"
                            : "size-4"
                        }
                      />
                    }
                    label={data.item.favorited ? "Unfavorite" : "Favorite"}
                    onClick={() => void toggleFav(data.item.id)}
                  />
                  <LightboxAction
                    icon={<Icons.StackPlus weight="bold" className="size-4" />}
                    label="Save as asset"
                    onClick={() => onSaveAsAsset(data.item)}
                  />
                  <LightboxAction
                    icon={
                      copied ? (
                        <Icons.Check weight="bold" className="size-4" />
                      ) : (
                        <Icons.Paperclip weight="bold" className="size-4" />
                      )
                    }
                    label={copied ? "Copied!" : "Copy prompt"}
                    onClick={() => void copyPrompt(data.item.prompt)}
                  />
                  <LightboxAction
                    icon={<Icons.Folder weight="bold" className="size-4" />}
                    label="Reveal"
                    onClick={() => {
                      void api["system.openPath"]({ path: data.item.relPath });
                    }}
                  />
                  <span className="mx-0.5 h-5 w-px bg-white/12" aria-hidden="true" />
                  <LightboxAction
                    icon={<Icons.Info weight="bold" className="size-4" />}
                    label={showInfo ? "Hide info" : "Info"}
                    onClick={() => setShowInfo((v) => !v)}
                    active={showInfo}
                  />
                  <LightboxAction
                    icon={<Icons.Trash weight="bold" className="size-4" />}
                    label="Delete"
                    danger
                    onClick={() => {
                      if (window.confirm("Delete this item?")) {
                        void removeItem(data.item.id);
                        onClose();
                      }
                    }}
                  />
                </div>
              </div>

              {/* Slide-up info panel — left side. */}
              {showInfo ? (
                <aside
                  className={
                    "absolute right-4 top-16 bottom-24 z-10 w-[340px] overflow-y-auto " +
                    "rounded-(--radius-md) border border-white/10 bg-black/65 p-4 text-white " +
                    "shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                  }
                >
                  <div className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-white/55">
                    Prompt
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-(length:--text-body-sm) leading-5">
                    {data.item.prompt}
                  </p>
                  <dl className="mt-4 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-(length:--text-body-sm)">
                    <dt className="text-white/55">Provider</dt>
                    <dd className="text-white">{data.item.providerId}</dd>
                    <dt className="text-white/55">Model</dt>
                    <dd className="text-white">{data.item.model}</dd>
                    <dt className="text-white/55">File</dt>
                    <dd className="break-all font-(family-name:--font-mono) text-(length:--text-caption) text-white/85">
                      {data.item.relPath}
                    </dd>
                    <dt className="text-white/55">Params</dt>
                    <dd className="break-all font-(family-name:--font-mono) text-(length:--text-caption) text-white/70">
                      {data.item.paramsJson}
                    </dd>
                  </dl>
                  {data.assets.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-white/55">
                        Used assets
                      </div>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {data.assets.map((a) => (
                          <li
                            key={a.assetId}
                            className={
                              "inline-flex items-center gap-1 rounded-(--radius-pill) " +
                              "border border-white/10 bg-white/8 px-2 py-0.5 text-(length:--text-caption)"
                            }
                          >
                            <span className="font-semibold">
                              {a.name ?? a.assetId.slice(0, 8)}
                            </span>
                            <span className="text-white/55">({a.role})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {data.parent || data.children.length > 0 || data.siblings.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-white/55">
                        Lineage
                      </div>
                      {data.parent ? (
                        <div className="mt-2">
                          <div className="text-(length:--text-caption) text-white/55">parent</div>
                          <LineageTile item={data.parent} />
                        </div>
                      ) : null}
                      {data.siblings.length > 0 ? (
                        <div className="mt-2">
                          <div className="text-(length:--text-caption) text-white/55">
                            siblings
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {data.siblings.map((s) => (
                              <LineageTile key={s.id} item={s} />
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {data.children.length > 0 ? (
                        <div className="mt-2">
                          <div className="text-(length:--text-caption) text-white/55">
                            children
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {data.children.map((c) => (
                              <LineageTile key={c.id} item={c} />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </aside>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-(length:--text-body-sm) text-white/70">
              Loading…
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function getMediaPreviewStyle(item: GalleryItem): CSSProperties {
  // Cap at the asset's natural size so small images don't get blurry when
  // upscaled. The `min(100%, …)` form also caps at the parent, since inline
  // `max-width` overrides the Tailwind `max-w-full` class. Combined with
  // `w-auto h-auto object-contain` on the element, the browser scales the
  // media to fit within the box while preserving aspect ratio.
  return {
    maxWidth: getMediaPreviewMaxSize(item.width),
    maxHeight: getMediaPreviewMaxSize(item.height),
  };
}

function getMediaPreviewMaxSize(size: number | null | undefined): string {
  return typeof size === "number" && size > 0 ? `min(100%, ${size}px)` : "100%";
}

/**
 * Image preview with wheel-zoom (toward cursor), drag-to-pan when zoomed,
 * and double-click to toggle fit ↔ 2×. Pan is clamped so the image edges
 * cannot fly past the visible content area. Reset whenever `itemId` changes.
 *
 * The wheel listener is attached imperatively because React's synthetic
 * `onWheel` is registered as passive at the root and cannot
 * `preventDefault()` the page-scroll.
 */
function ZoomablePreviewImage({
  itemId,
  src,
  alt,
  width,
  height,
  baseStyle,
}: {
  itemId: string;
  src: string;
  alt: string;
  width: number | null | undefined;
  height: number | null | undefined;
  baseStyle: CSSProperties | undefined;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseTx: number;
    baseTy: number;
  } | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [panning, setPanning] = useState(false);

  // Reset zoom whenever the displayed item changes.
  useEffect(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
  }, [itemId]);

  const clampPan = (s: number, x: number, y: number): { x: number; y: number } => {
    const c = containerRef.current;
    const img = imgRef.current;
    if (!c || !img) return { x, y };
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    // offsetWidth/Height are pre-transform layout dimensions, so they reflect
    // the "fit" size set by max-w-full / max-h-full / object-contain.
    const mw = img.offsetWidth * s;
    const mh = img.offsetHeight * s;
    const maxX = Math.max(0, (mw - cw) / 2);
    const maxY = Math.max(0, (mh - ch) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  // Wheel-to-zoom centered at the cursor. Attach a non-passive native listener
  // so `preventDefault()` actually suppresses page scroll inside the lightbox.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Cursor relative to the container's center, which is also where the
      // image's transform-origin sits at scale = 1.
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      // Smooth exponential zoom; trackpads send small deltaY, mice send larger.
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((prev) => {
        const next = Math.min(8, Math.max(1, prev.scale * factor));
        if (next === prev.scale) return prev;
        if (next <= 1.001) return { scale: 1, tx: 0, ty: 0 };
        // Keep the image-space point under the cursor stationary across
        // the zoom: solve (cx - tx) / s == (cx - tx') / s' for tx'.
        const nextTx = cx - ((cx - prev.tx) * next) / prev.scale;
        const nextTy = cy - ((cy - prev.ty) * next) / prev.scale;
        const clamped = clampPan(next, nextTx, nextTy);
        return { scale: next, tx: clamped.x, ty: clamped.y };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLImageElement>): void => {
    if (view.scale <= 1) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseTx: view.tx,
      baseTy: view.ty,
    };
    setPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLImageElement>): void => {
    const ps = panRef.current;
    if (!ps) return;
    const dx = e.clientX - ps.startX;
    const dy = e.clientY - ps.startY;
    setView((prev) => {
      const clamped = clampPan(prev.scale, ps.baseTx + dx, ps.baseTy + dy);
      return { ...prev, tx: clamped.x, ty: clamped.y };
    });
  };
  const endPan = (e: React.PointerEvent<HTMLImageElement>): void => {
    if (!panRef.current) return;
    panRef.current = null;
    setPanning(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLImageElement>): void => {
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    setView((prev) => {
      if (prev.scale > 1) return { scale: 1, tx: 0, ty: 0 };
      const next = 2;
      const nextTx = cx - cx * next; // prev.tx === 0, prev.scale === 1
      const nextTy = cy - cy * next;
      const clamped = clampPan(next, nextTx, nextTy);
      return { scale: next, tx: clamped.x, ty: clamped.y };
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center"
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={width || undefined}
        height={height || undefined}
        draggable={false}
        style={{
          ...baseStyle,
          transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.scale})`,
          transformOrigin: "center center",
          transition: panning ? "none" : "transform 120ms ease-out",
          cursor: view.scale > 1 ? (panning ? "grabbing" : "grab") : "default",
          touchAction: "none",
          willChange: "transform",
        }}
        className="block h-auto max-h-full w-auto max-w-full rounded-(--radius-md) object-contain shadow-[0_24px_64px_-16px_rgba(0,0,0,0.65)] select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}

function LightboxAction({
  icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        "inline-flex h-8 items-center gap-1.5 rounded-(--radius-pill) px-3 " +
        "text-(length:--text-caption) font-medium transition-colors duration-(--motion-fast) " +
        (danger
          ? "text-white/85 hover:bg-(--danger)/85 hover:text-white "
          : active
            ? "bg-white/16 text-white "
            : "text-white/85 hover:bg-white/12 hover:text-white ")
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function LineageTile({ item }: { item: GalleryItem }) {
  const isVideo = item.kind === "video";
  const src = isVideo
    ? item.thumbPath
      ? resolveGalleryUrl(item.thumbPath)
      : ""
    : resolveGalleryUrl(item.relPath);
  return (
    <div
      title={item.prompt}
      className="relative aspect-square overflow-hidden rounded-(--radius-sm) border border-(--border)"
    >
      {src ? (
        <img
          src={src}
          alt={item.prompt}
          className="block h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-(--surface) text-(--text-muted)">
          <Icons.FilmReel weight="duotone" className="size-5" />
        </div>
      )}
      {isVideo ? (
        <span className="pointer-events-none absolute bottom-1 left-1 inline-flex size-4 items-center justify-center rounded-(--radius-pill) bg-black/60 text-white">
          <Icons.Play weight="fill" className="size-2.5" />
        </span>
      ) : null}
    </div>
  );
}

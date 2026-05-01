import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import { BoardSidebarItem, Button, IconButton, Icons } from "@imagine/ui";
import type { Board, GalleryItem } from "@imagine/core";
import { api } from "../../lib/api.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { resolveGalleryUrl } from "../Studio.js";

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
          align="start"
          sideOffset={4}
          className={
            "z-50 min-w-[160px] overflow-hidden rounded-(--radius-md) " +
            "border border-(--border) bg-(--bg) p-1 " +
            "shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)]"
          }
        >
          <DropdownMenu.Item
            onSelect={() => {
              setEditing(true);
              setDraft(board.name);
            }}
            className={
              "flex cursor-pointer select-none items-center rounded-(--radius-sm) " +
              "px-3 py-2 text-(length:--text-body-sm) outline-none " +
              "data-[highlighted]:bg-(--surface)"
            }
          >
            Rename
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled
            className="px-3 py-2 text-(length:--text-body-sm) text-(--text-faint)"
          >
            Set cover (coming soon)
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => onDelete()}
            className={
              "flex cursor-pointer select-none items-center rounded-(--radius-sm) " +
              "px-3 py-2 text-(length:--text-body-sm) text-(--danger) outline-none " +
              "data-[highlighted]:bg-(--danger)/10"
            }
          >
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function DetailDrawer({
  itemId,
  onClose,
  onRemix,
}: {
  itemId: string;
  onClose: () => void;
  onRemix: (id: string) => void;
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
  const removeItem = useGalleryStore((s) => s.remove);
  const toggleFav = useGalleryStore((s) => s.toggleFavorite);

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
        if (!cancelled) onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, onClose]);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          className={
            "fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col " +
            "border-l border-(--border) bg-(--bg) shadow-2xl"
          }
        >
          <header className="flex items-center justify-between border-b border-(--border) p-4">
            <Dialog.Title className="text-(length:--text-title-md) font-semibold text-(--text)">
              Item details
            </Dialog.Title>
            <IconButton
              icon={<Icons.X weight="bold" className="size-4" />}
              aria-label="Close"
              size="sm"
              onClick={onClose}
            />
          </header>
          {data ? (
            <div className="flex-1 overflow-y-auto p-4">
              {data.item.kind === "video" ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={resolveGalleryUrl(data.item.relPath)}
                  controls
                  preload="metadata"
                  className="block w-full rounded-(--radius-md) border border-(--border) bg-black"
                />
              ) : (
                <img
                  src={resolveGalleryUrl(data.item.relPath)}
                  alt={data.item.prompt}
                  className="block w-full rounded-(--radius-md) border border-(--border)"
                />
              )}
              <dl className="mt-4 grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-1 text-(length:--text-body-sm)">
                <dt className="text-(--text-muted)">prompt</dt>
                <dd className="text-(--text) whitespace-pre-wrap">{data.item.prompt}</dd>
                <dt className="text-(--text-muted)">provider</dt>
                <dd className="text-(--text)">{data.item.providerId}</dd>
                <dt className="text-(--text-muted)">model</dt>
                <dd className="text-(--text)">{data.item.model}</dd>
                <dt className="text-(--text-muted)">file</dt>
                <dd className="text-(--text) break-all">{data.item.relPath}</dd>
                <dt className="text-(--text-muted)">params</dt>
                <dd className="font-(family-name:--font-mono) text-(length:--text-caption) text-(--text-muted) break-all">
                  {data.item.paramsJson}
                </dd>
              </dl>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => onRemix(data.item.id)}>
                  Remix
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void toggleFav(data.item.id)}
                >
                  {data.item.favorited ? "Unfavorite" : "Favorite"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void api["system.openPath"]({ path: data.item.relPath });
                  }}
                >
                  Open file location
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (window.confirm("Delete this item?")) {
                      void removeItem(data.item.id);
                      onClose();
                    }
                  }}
                >
                  Delete
                </Button>
              </div>

              {data.assets.length > 0 ? (
                <div className="mt-6">
                  <h3 className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
                    Used assets
                  </h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {data.assets.map((a) => (
                      <li
                        key={a.assetId}
                        className={
                          "inline-flex items-center gap-1 rounded-(--radius-pill) " +
                          "bg-(--surface-raised) px-2 py-1 text-(length:--text-caption) text-(--text)"
                        }
                      >
                        <span className="font-semibold">{a.name ?? a.assetId.slice(0, 8)}</span>
                        <span className="text-(--text-muted)">({a.role})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {(data.parent || data.children.length > 0 || data.siblings.length > 0) ? (
                <div className="mt-6">
                  <h3 className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
                    Lineage
                  </h3>
                  {data.parent ? (
                    <div className="mt-2">
                      <div className="text-(length:--text-caption) text-(--text-muted)">parent</div>
                      <LineageTile item={data.parent} />
                    </div>
                  ) : null}
                  {data.siblings.length > 0 ? (
                    <div className="mt-2">
                      <div className="text-(length:--text-caption) text-(--text-muted)">
                        siblings (up to 3)
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
                      <div className="text-(length:--text-caption) text-(--text-muted)">
                        children (up to 3)
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
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-(length:--text-body-sm) text-(--text-muted)">
              Loading…
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

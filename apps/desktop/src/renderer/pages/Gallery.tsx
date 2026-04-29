import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import {
  BoardSidebarItem,
  Button,
  GalleryItemCard,
  IconButton,
  Icons,
  Input,
  Tooltip,
} from "@imagine/ui";
import type { Board, GalleryItem } from "@imagine/core";
import { api } from "../lib/api.js";
import { useBoardsStore } from "../state/useBoardsStore.js";
import { useGalleryStore } from "../state/useGalleryStore.js";
import { useUIStore } from "../state/useUIStore.js";
import { resolveGalleryUrl } from "./Studio.js";

const BOARD_ALL = "__all__";
const BOARD_FAVORITES = "__favorites__";

export function GalleryPage() {
  const items = useGalleryStore((s) => s.items);
  const total = useGalleryStore((s) => s.total);
  const query = useGalleryStore((s) => s.query);
  const setQuery = useGalleryStore((s) => s.setQuery);
  const refresh = useGalleryStore((s) => s.refresh);
  const removeItem = useGalleryStore((s) => s.remove);
  const toggleFav = useGalleryStore((s) => s.toggleFavorite);

  const boards = useBoardsStore((s) => s.boards);
  const counts = useBoardsStore((s) => s.counts);
  const refreshBoards = useBoardsStore((s) => s.refresh);
  const createBoard = useBoardsStore((s) => s.create);
  const renameBoard = useBoardsStore((s) => s.rename);
  const removeBoard = useBoardsStore((s) => s.remove);
  const addItem = useBoardsStore((s) => s.addItem);

  const applyRemix = useUIStore((s) => s.applyRemix);
  const pushToast = useUIStore((s) => s.pushToast);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>(BOARD_ALL);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  // Local search buffer; debounced into useGalleryStore.setQuery (M8).
  const [searchInput, setSearchInput] = useState<string>(query.search ?? "");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Initial load.
  useEffect(() => {
    void refresh();
    void refreshBoards();
  }, [refresh, refreshBoards]);

  // Apply the active board / favorites filter. M7: gallery now mixes image
  // + video kinds (kind filter dropped).
  useEffect(() => {
    if (activeFilter === BOARD_ALL) {
      setQuery({ kind: undefined, boardId: undefined, favoritedOnly: undefined });
    } else if (activeFilter === BOARD_FAVORITES) {
      setQuery({ kind: undefined, boardId: undefined, favoritedOnly: true });
    } else {
      setQuery({ kind: undefined, boardId: activeFilter, favoritedOnly: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  // M8: debounce search input → gallery query → backend FTS5 MATCH.
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = searchInput.trim();
      setQuery({ search: trimmed.length > 0 ? trimmed : undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const onDragEnd = async (e: DragEndEvent): Promise<void> => {
    if (!e.over) return;
    const overId = String(e.over.id);
    const activeId = String(e.active.id);
    if (!overId.startsWith("board-drop:")) return;
    if (!activeId.startsWith("gallery-item:")) return;
    const boardSentinel = overId.slice("board-drop:".length);
    const itemId = activeId.slice("gallery-item:".length);
    if (boardSentinel === BOARD_ALL || boardSentinel === BOARD_FAVORITES) {
      // Dropping onto the virtual rows is a no-op (you can't "remove from all").
      return;
    }
    try {
      await addItem(boardSentinel, itemId);
      pushToast({
        title: "Added to board",
        variant: "success",
      });
    } catch (err) {
      pushToast({
        title: "Could not add to board",
        description: (err as Error)?.message ?? String(err),
        variant: "error",
      });
    }
  };

  const handleRemix = async (id: string): Promise<void> => {
    try {
      const result = await api["gallery.remix"]({ itemId: id });
      if (result.kind === "video") {
        applyRemix({
          kind: "video",
          parentId: id,
          request: {
            prompt: result.request.prompt,
            providerId: result.request.providerId,
            model: result.request.model,
            ...(typeof result.request.durationSec === "number"
              ? { durationSec: result.request.durationSec }
              : {}),
            ...(typeof result.request.fps === "number"
              ? { fps: result.request.fps }
              : {}),
            ...(typeof result.request.resolution === "string"
              ? { resolution: result.request.resolution }
              : {}),
            ...(typeof result.request.aspectRatio === "string"
              ? { aspectRatio: result.request.aspectRatio }
              : {}),
            references: result.request.references.map((r) => ({ path: r.path })),
          },
        });
        return;
      }
      applyRemix({
        kind: "image",
        parentId: id,
        request: {
          prompt: result.request.prompt,
          providerId: result.request.providerId,
          model: result.request.model,
          count: result.request.count,
          ...(result.request.size !== undefined ? { size: result.request.size } : {}),
          ...(result.request.aspectRatio !== undefined
            ? { aspectRatio: result.request.aspectRatio }
            : {}),
          references: result.request.references.map((r) => ({ path: r.path })),
        },
      });
    } catch (err) {
      pushToast({
        title: "Remix failed",
        description: (err as Error)?.message ?? String(err),
        variant: "error",
      });
    }
  };

  const handleCreateBoard = async (): Promise<void> => {
    const name = newBoardName.trim();
    if (!name) return;
    try {
      await createBoard({ name });
      setNewBoardName("");
      setCreatingBoard(false);
    } catch (err) {
      pushToast({
        title: "Could not create board",
        description: (err as Error)?.message ?? String(err),
        variant: "error",
      });
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid h-full grid-cols-[220px_minmax(0,1fr)] gap-0">
        <aside className="flex flex-col gap-1 border-r border-(--border) bg-(--bg) p-3">
          <div className="px-2 pb-2 pt-1 text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
            Library
          </div>
          <BoardSidebarItem
            id={BOARD_ALL}
            label="All"
            count={total}
            active={activeFilter === BOARD_ALL}
            acceptsDrop={false}
            onClick={() => setActiveFilter(BOARD_ALL)}
          />
          <BoardSidebarItem
            id={BOARD_FAVORITES}
            label="Favorites"
            active={activeFilter === BOARD_FAVORITES}
            acceptsDrop={false}
            onClick={() => setActiveFilter(BOARD_FAVORITES)}
          />
          <div className="my-2 h-px bg-(--border-faint)" />
          <div className="px-2 pb-1 text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
            Boards
          </div>
          {boards.map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              count={counts[b.id] ?? 0}
              active={activeFilter === b.id}
              onClick={() => setActiveFilter(b.id)}
              onRename={(name) => void renameBoard(b.id, name)}
              onDelete={() => void removeBoard(b.id)}
            />
          ))}
          {creatingBoard ? (
            <div className="flex items-center gap-1 px-2 py-1">
              <input
                autoFocus
                className={
                  "flex-1 rounded-(--radius-sm) border border-(--border) " +
                  "bg-(--bg) px-2 py-1 text-(length:--text-body-sm) text-(--text) " +
                  "focus:outline-none focus:border-(--text)"
                }
                value={newBoardName}
                placeholder="Board name"
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateBoard();
                  if (e.key === "Escape") {
                    setCreatingBoard(false);
                    setNewBoardName("");
                  }
                }}
                onBlur={() => {
                  if (newBoardName.trim()) void handleCreateBoard();
                  else setCreatingBoard(false);
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingBoard(true)}
              className={
                "flex w-full items-center gap-2 rounded-(--radius-sm) px-3 py-2 " +
                "text-left text-(length:--text-body-sm) text-(--text-muted) " +
                "transition-colors duration-(--duration-fast) hover:bg-(--surface) hover:text-(--text)"
              }
            >
              <Icons.Plus weight="bold" className="size-4" />
              New board
            </button>
          )}
        </aside>

        <section className="flex-1 overflow-y-auto px-6 py-4">
          {/* M8: FTS5-backed search bar. `prompt:foo` matches only the prompt column. */}
          <div className="mb-4 flex items-center gap-3">
            <div className="relative w-full max-w-md">
              <Icons.MagnifyingGlass
                weight="bold"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--text-muted)"
              />
              <Input
                placeholder="Search prompts…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 pr-8"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
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
            <Tooltip content="Use 'prompt:foo' to match only the prompt column. FTS5 supports AND/OR/NEAR.">
              <button
                type="button"
                aria-label="Search syntax help"
                className={
                  "inline-flex size-7 items-center justify-center rounded-(--radius-pill) " +
                  "text-(--text-muted) transition-colors duration-(--duration-fast) " +
                  "hover:bg-(--surface) hover:text-(--text)"
                }
              >
                <Icons.Info weight="duotone" className="size-4" />
              </button>
            </Tooltip>
            {query.search ? (
              <span className="text-(length:--text-caption) text-(--text-muted)">
                {total} match{total === 1 ? "" : "es"}
              </span>
            ) : null}
          </div>
          {items.length === 0 ? (
            <div className="mx-auto mt-12 max-w-md text-center">
              <Icons.Folder
                weight="duotone"
                className="mx-auto size-10 text-(--text-muted)"
              />
              <p className="mt-3 text-(length:--text-body-sm) text-(--text-muted)">
                Nothing here yet — head to Studio and generate something.
              </p>
            </div>
          ) : (
            <div
              style={{ columnWidth: 240, columnGap: 12 }}
              className="w-full"
            >
              {items.map((it) => {
                const isVideo = it.kind === "video";
                const src = isVideo
                  ? it.thumbPath
                    ? resolveGalleryUrl(it.thumbPath)
                    : ""
                  : resolveGalleryUrl(it.relPath);
                return (
                  <GalleryItemCard
                    key={it.id}
                    id={it.id}
                    kind={it.kind}
                    src={src}
                    caption={it.prompt}
                    width={it.width ?? null}
                    height={it.height ?? null}
                    durationMs={it.durationMs ?? null}
                    favorited={it.favorited}
                    selected={selectedId === it.id}
                    boards={boards.map((b) => ({ id: b.id, name: b.name }))}
                    onSelect={() => setSelectedId(it.id)}
                    onOpen={() => setDrawerId(it.id)}
                    onRemix={() => void handleRemix(it.id)}
                    onToggleFavorite={() => void toggleFav(it.id)}
                    onAddToBoard={(boardId) => void addItem(boardId, it.id)}
                    onOpenFileLocation={() => {
                      void api["system.openPath"]({ path: it.relPath });
                    }}
                    onDelete={() => void removeItem(it.id)}
                  />
                );
              })}
            </div>
          )}

          {items.length < total ? (
            <div className="mt-6 flex items-center justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setQuery({ limit: query.limit + 60 })
                }
              >
                Load more ({total - items.length} remaining)
              </Button>
            </div>
          ) : null}
        </section>

        {drawerId ? (
          <DetailDrawer
            itemId={drawerId}
            onClose={() => setDrawerId(null)}
            onRemix={(id) => {
              setDrawerId(null);
              void handleRemix(id);
            }}
          />
        ) : null}
      </div>
    </DndContext>
  );
}

function BoardRow({
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

function DetailDrawer({
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

              {/* Used assets (M6) */}
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

              {/* Lineage */}
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

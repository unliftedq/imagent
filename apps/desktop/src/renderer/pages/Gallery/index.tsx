import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { BoardSidebarItem, Button, GalleryItemCard, Icons, Input, Tooltip } from "@imagine/ui";
import { api } from "../../lib/api.js";
import { useBoardsStore } from "../../state/useBoardsStore.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { resolveGalleryUrl } from "../Studio";
import { BoardRow, DetailDrawer } from "./components.js";
import { BOARD_ALL, BOARD_FAVORITES } from "./constants.js";

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
  const [searchInput, setSearchInput] = useState<string>(query.search ?? "");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    void refresh();
    void refreshBoards();
  }, [refresh, refreshBoards]);

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
            ...(typeof result.request.fps === "number" ? { fps: result.request.fps } : {}),
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
            <div style={{ columnWidth: 240, columnGap: 12 }} className="w-full">
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
              <Button variant="secondary" size="sm" onClick={() => setQuery({ limit: query.limit + 60 })}>
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

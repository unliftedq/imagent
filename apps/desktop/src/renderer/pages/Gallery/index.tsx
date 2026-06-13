import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { Asset, AssetKind, GalleryItem } from "@imagent/core";
import { BoardSidebarItem, Button, GalleryItemCard, Icons, Input, Tooltip } from "@imagent/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useBoardsStore } from "../../state/useBoardsStore.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { CreateAssetDialog } from "../Assets/CreateAssetDialog.js";
import { resolveGalleryUrl } from "../Studio";
import { BoardRow, LightboxPreview } from "./components.js";
import {
  BOARD_ALL,
  BOARD_FAVORITES,
  FILTER_AUDIO,
  FILTER_IMAGE,
  FILTER_VIDEO,
} from "./constants.js";
import { MasonryGrid } from "./MasonryGrid.js";

export function GalleryPage() {
  const items = useGalleryStore((s) => s.items);
  const total = useGalleryStore((s) => s.total);
  const allTotal = useGalleryStore((s) => s.allTotal);
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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>(BOARD_ALL);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [searchInput, setSearchInput] = useState<string>(query.search ?? "");
  const [assetDialogItem, setAssetDialogItem] = useState<GalleryItem | null>(null);
  const [assetDialogKind, setAssetDialogKind] = useState<AssetKind>("character");

  const scrollRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const navigate = useUIStore((s) => s.navigate);

  const t = useT();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    void refresh();
    void refreshBoards();
  }, [refresh, refreshBoards]);

  useEffect(() => {
    if (activeFilter === BOARD_ALL) {
      setQuery({ kind: undefined, boardId: undefined, favoritedOnly: undefined });
    } else if (activeFilter === BOARD_FAVORITES) {
      setQuery({ kind: undefined, boardId: undefined, favoritedOnly: true });
    } else if (activeFilter === FILTER_IMAGE) {
      setQuery({ kind: "image", boardId: undefined, favoritedOnly: undefined });
    } else if (activeFilter === FILTER_VIDEO) {
      setQuery({ kind: "video", boardId: undefined, favoritedOnly: undefined });
    } else if (activeFilter === FILTER_AUDIO) {
      setQuery({ kind: "speech", boardId: undefined, favoritedOnly: undefined });
    } else {
      setQuery({ kind: undefined, boardId: activeFilter, favoritedOnly: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      setQuery({ search: trimmed.length > 0 ? trimmed : undefined });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Auto-load more when the sentinel near the bottom scrolls into view.
  useEffect(() => {
    if (items.length >= total) return;
    loadingMoreRef.current = false;
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loadingMoreRef.current) return;
        if (items.length >= total) return;
        loadingMoreRef.current = true;
        setQuery({ limit: query.limit + 60 });
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, total, query.limit, setQuery]);

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
        title: t("gallery.toast.addedToBoard"),
        variant: "success",
      });
    } catch (err) {
      pushToast({
        title: t("gallery.toast.couldNotAddToBoard"),
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
      if (result.kind === "speech") {
        applyRemix({
          kind: "speech",
          parentId: id,
          request: {
            prompt: result.request.prompt,
            providerId: result.request.providerId,
            model: result.request.model,
            ...(typeof result.request.voice === "string" ? { voice: result.request.voice } : {}),
            ...(typeof result.request.speed === "number" ? { speed: result.request.speed } : {}),
            ...(typeof result.request.codec === "string" ? { codec: result.request.codec } : {}),
            ...(typeof result.request.formatQuality === "string"
              ? { formatQuality: result.request.formatQuality }
              : {}),
            ...(result.request.raw ? { raw: result.request.raw } : {}),
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
        title: t("gallery.toast.remixFailed"),
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
        title: t("gallery.toast.couldNotCreateBoard"),
        description: (err as Error)?.message ?? String(err),
        variant: "error",
      });
    }
  };

  const openSaveAsAssetDialog = (item: GalleryItem): void => {
    if (item.kind === "speech") {
      pushToast({
        title: t("gallery.toast.speechAssetUnsupported"),
        description: t("gallery.toast.speechAssetUnsupportedDesc"),
        variant: "warning",
      });
      return;
    }
    if (item.kind === "video" && !item.thumbPath) {
      pushToast({
        title: t("gallery.toast.thumbnailUnavailable"),
        description: t("gallery.toast.thumbnailUnavailableDesc"),
        variant: "warning",
      });
      return;
    }
    setAssetDialogItem(item);
  };

  const onAssetCreated = (asset: Asset): void => {
    setAssetDialogItem(null);
    pushToast({
      title: t("gallery.toast.assetSaved"),
      description: t("gallery.toast.assetSavedDesc", { name: asset.name }),
      variant: "success",
    });
  };

  const assetDialogSource = useMemo(() => {
    if (!assetDialogItem) return null;
    const relPath =
      assetDialogItem.kind === "video"
        ? (assetDialogItem.thumbPath ?? assetDialogItem.relPath)
        : assetDialogItem.relPath;
    return {
      itemId: assetDialogItem.id,
      itemKind: assetDialogItem.kind,
      prompt: assetDialogItem.prompt,
      previewUrl: resolveGalleryUrl(relPath),
      relPath,
    };
  }, [assetDialogItem]);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid h-full grid-cols-[220px_minmax(0,1fr)] gap-0">
        <aside className="flex flex-col gap-1 border-r border-(--border) bg-(--bg) p-3">
          <div className="px-2 pb-2 pt-1 text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
            {t("gallery.library")}
          </div>
          <BoardSidebarItem
            id={BOARD_ALL}
            label={t("gallery.all")}
            count={allTotal}
            active={activeFilter === BOARD_ALL}
            acceptsDrop={false}
            onClick={() => setActiveFilter(BOARD_ALL)}
          />
          <BoardSidebarItem
            id={BOARD_FAVORITES}
            label={t("gallery.favorites")}
            active={activeFilter === BOARD_FAVORITES}
            acceptsDrop={false}
            onClick={() => setActiveFilter(BOARD_FAVORITES)}
          />
          <BoardSidebarItem
            id={FILTER_IMAGE}
            label={t("gallery.filter.image")}
            active={activeFilter === FILTER_IMAGE}
            acceptsDrop={false}
            onClick={() => setActiveFilter(FILTER_IMAGE)}
          />
          <BoardSidebarItem
            id={FILTER_VIDEO}
            label={t("gallery.filter.video")}
            active={activeFilter === FILTER_VIDEO}
            acceptsDrop={false}
            onClick={() => setActiveFilter(FILTER_VIDEO)}
          />
          <BoardSidebarItem
            id={FILTER_AUDIO}
            label={t("gallery.filter.speech")}
            active={activeFilter === FILTER_AUDIO}
            acceptsDrop={false}
            onClick={() => setActiveFilter(FILTER_AUDIO)}
          />
          <div className="my-2 h-px bg-(--border-faint)" />
          <div className="px-2 pb-1 text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
            {t("gallery.boards")}
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
                className={
                  "flex-1 rounded-(--radius-sm) border border-(--border) " +
                  "bg-(--bg) px-2 py-1 text-(length:--text-body-sm) text-(--text) " +
                  "focus:outline-none focus:border-(--text)"
                }
                value={newBoardName}
                placeholder={t("gallery.boardName.placeholder")}
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
              {t("gallery.newBoard")}
            </button>
          )}
        </aside>

        <section ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="relative w-full max-w-[640px]">
              <Icons.MagnifyingGlass
                weight="bold"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--text-muted)"
              />
              <Input
                placeholder={t("gallery.search.placeholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-10 pl-9 pr-9 text-(length:--text-body)"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  aria-label={t("common.clearSearch")}
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
            <Tooltip content={t("gallery.search.helpTooltip")}>
              <button
                type="button"
                aria-label={t("gallery.search.syntaxHelp")}
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
                {t(total === 1 ? "gallery.match" : "gallery.matches", { count: total })}
              </span>
            ) : null}
          </div>
          {items.length === 0 ? (
            <GalleryEmptyState
              hasSearch={Boolean(query.search)}
              activeFilter={activeFilter}
              onClearSearch={() => setSearchInput("")}
              onResetFilter={() => setActiveFilter(BOARD_ALL)}
              onGoToStudio={() => navigate("studio")}
            />
          ) : (
            <MasonryGrid
              items={items}
              columnWidth={240}
              gap={12}
              getAspect={(it) => {
                if (it.width && it.height && it.width > 0 && it.height > 0) {
                  return it.height / it.width;
                }
                // Fallbacks mirror GalleryItemCard's defaults: 1:1 for images,
                // 16:9 for videos. height / width.
                return it.kind === "video" ? 9 / 16 : 1;
              }}
              renderItem={(it) => {
                const isVideo = it.kind === "video";
                const src = isVideo
                  ? it.thumbPath
                    ? resolveGalleryUrl(it.thumbPath)
                    : ""
                  : resolveGalleryUrl(it.relPath);
                return (
                  <GalleryItemCard
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
                    onSelect={() => {
                      setSelectedId(it.id);
                      setPreviewId(it.id);
                    }}
                    onOpen={() => setPreviewId(it.id)}
                    onRemix={() => void handleRemix(it.id)}
                    onSaveAsAsset={it.kind === "speech" ? undefined : () => openSaveAsAssetDialog(it)}
                    onToggleFavorite={() => void toggleFav(it.id)}
                    onAddToBoard={(boardId) => void addItem(boardId, it.id)}
                    onOpenFileLocation={() => {
                      void api["system.openPath"]({ path: it.relPath });
                    }}
                    onDelete={() => void removeItem(it.id)}
                  />
                );
              }}
            />
          )}

          {items.length < total ? (
            <div ref={sentinelRef} aria-hidden className="h-8" />
          ) : null}
        </section>

        {previewId ? (
          <LightboxPreview
            itemId={previewId}
            onClose={() => setPreviewId(null)}
            onRemix={(id) => {
              setPreviewId(null);
              void handleRemix(id);
            }}
            onSaveAsAsset={(item) => {
              setPreviewId(null);
              openSaveAsAssetDialog(item);
            }}
            onNavigate={(id) => {
              setPreviewId(id);
              setSelectedId(id);
            }}
          />
        ) : null}

        <CreateAssetDialog
          open={Boolean(assetDialogItem)}
          kind={assetDialogKind}
          onKindChange={setAssetDialogKind}
          onClose={() => setAssetDialogItem(null)}
          onCreated={onAssetCreated}
          gallerySource={assetDialogSource}
        />
      </div>
    </DndContext>
  );
}

function GalleryEmptyState({
  hasSearch,
  activeFilter,
  onClearSearch,
  onResetFilter,
  onGoToStudio,
}: {
  hasSearch: boolean;
  activeFilter: string;
  onClearSearch: () => void;
  onResetFilter: () => void;
  onGoToStudio: () => void;
}) {
  const t = useT();
  if (hasSearch) {
    return (
      <div className="mx-auto mt-16 flex w-full max-w-[420px] flex-col items-center text-center">
        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-(--radius-pill) bg-(--surface)">
          <Icons.MagnifyingGlass weight="duotone" className="size-6 text-(--text-muted)" />
        </div>
        <h2 className="text-(length:--text-title) font-semibold tracking-[-0.01em] text-(--text)">
          {t("gallery.empty.search.title")}
        </h2>
        <p className="mt-1.5 max-w-[320px] text-(length:--text-body-sm) leading-5 text-(--text-muted)">
          {t("gallery.empty.search.body")}
        </p>
        <Button variant="secondary" size="sm" className="mt-5" onClick={onClearSearch}>
          {t("common.clearSearch")}
        </Button>
      </div>
    );
  }

  if (activeFilter !== BOARD_ALL) {
    return (
      <div className="mx-auto mt-16 flex w-full max-w-[420px] flex-col items-center text-center">
        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-(--radius-pill) bg-(--surface)">
          <Icons.Folder weight="duotone" className="size-6 text-(--text-muted)" />
        </div>
        <h2 className="text-(length:--text-title) font-semibold tracking-[-0.01em] text-(--text)">
          {activeFilter === BOARD_FAVORITES
            ? t("gallery.empty.favorites.title")
            : t("gallery.empty.board.title")}
        </h2>
        <p className="mt-1.5 max-w-[320px] text-(length:--text-body-sm) leading-5 text-(--text-muted)">
          {activeFilter === BOARD_FAVORITES
            ? t("gallery.empty.favorites.body")
            : t("gallery.empty.board.body")}
        </p>
        <Button variant="secondary" size="sm" className="mt-5" onClick={onResetFilter}>
          {t("gallery.empty.showAll")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-20 flex w-full max-w-[420px] flex-col items-center text-center">
      <div className="relative mb-5 flex size-20 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-(--radius-pill) bg-(--accent)/8"
        />
        <span
          aria-hidden="true"
          className="absolute inset-2 rounded-(--radius-pill) bg-(--accent)/12"
        />
        <Icons.ImageSquare weight="duotone" className="relative size-9 text-(--accent)" />
      </div>
      <h2 className="text-(length:--text-display) font-semibold tracking-[-0.01em] text-(--text)">
        {t("gallery.empty.all.title")}
      </h2>
      <p className="mt-2 max-w-[340px] text-(length:--text-body-sm) leading-5 text-(--text-muted)">
        {t("gallery.empty.all.body")}
      </p>
      <div className="mt-6 inline-flex items-center gap-2">
        <Button
          onClick={onGoToStudio}
          leadingIcon={<Icons.MagicWand weight="bold" className="size-4" />}
        >
          {t("gallery.empty.openStudio")}
        </Button>
      </div>
    </div>
  );
}

import type { DragEvent } from "react";
import { useState } from "react";
import { useT } from "../../i18n/index.js";
import type { StudioMode } from "../../state/useUIStore.js";
import { type StudioReferenceRole, useUIStore } from "../../state/useUIStore.js";
import { CanvasArea } from "./canvas.js";
import { StudioModeSwitch } from "./composer.js";
import {
  readStudioReferenceDragData,
  StudioGalleryRail,
  type StudioReferenceDragData,
} from "./galleryRail.js";
import { ImageRail } from "./imageRail.js";
import { ASSET_REFERENCE_KINDS } from "./types.js";
import { uniqueStrings } from "./utils.js";
import { VideoRail } from "./videoRail.js";

export function StudioPage() {
  const studioMode = useUIStore((state) => state.studioMode);
  const setStudioMode = useUIStore((state) => state.setStudioMode);
  const navigate = useUIStore((state) => state.navigate);
  const pushToast = useUIStore((state) => state.pushToast);
  const imageDraft = useUIStore((state) => state.studioDraft.image);
  const videoDraft = useUIStore((state) => state.studioDraft.video);
  const setImageDraft = useUIStore((state) => state.setImageDraft);
  const setVideoDraft = useUIStore((state) => state.setVideoDraft);
  const [galleryCollapsed, setGalleryCollapsed] = useState(false);
  const [pendingGalleryReference, setPendingGalleryReference] = useState<Extract<
    StudioReferenceDragData,
    { source: "gallery" }
  > | null>(null);
  const t = useT();

  const draft = studioMode === "image" ? imageDraft : videoDraft;
  const setDraft = studioMode === "image" ? setImageDraft : setVideoDraft;

  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes("application/x-imagent-studio-reference")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: DragEvent<HTMLElement>): void => {
    const data = readStudioReferenceDragData(event.dataTransfer);
    if (!data) return;
    event.preventDefault();

    if (data.source === "asset") {
      const kind = data.kind as keyof typeof draft.assetIds;
      const current = draft.assetIds[kind] ?? [];
      if (current.includes(data.id)) {
        pushToast({ title: t("studio.referenceAlreadyAdded"), variant: "info" });
        return;
      }
      setDraft({
        assetIds: {
          ...draft.assetIds,
          [kind]: [...current, data.id],
        },
      });
      pushToast({ title: t("studio.referenceAddedAs", { kind: roleLabel(data.kind, t) }), variant: "success" });
      return;
    }

    setPendingGalleryReference(data);
  };

  const addGalleryReference = (role: StudioReferenceRole): void => {
    if (!pendingGalleryReference) return;
    setDraft({
      references: uniqueStrings([...draft.references, pendingGalleryReference.relPath]),
      referenceRoles: {
        ...draft.referenceRoles,
        [pendingGalleryReference.relPath]: role,
      },
    });
    setPendingGalleryReference(null);
    pushToast({
      title: t("studio.galleryReferenceAddedAs", { kind: roleLabel(role, t) }),
      variant: "success",
    });
  };

  return (
    <div
      className="grid h-full min-h-0 w-full overflow-hidden"
      style={{
        gridTemplateColumns: galleryCollapsed
          ? "minmax(0, 1fr) 44px"
          : "minmax(0, 1fr) var(--rail-gallery, 300px)",
      }}
    >
      <section
        aria-label={t("studio.dropArea")}
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--bg)"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <StudioModeSwitch mode={studioMode} onModeChange={setStudioMode} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <CanvasArea key={studioMode} mode={studioMode} />
        </div>
        <StudioComposerDock mode={studioMode} />
      </section>
      <StudioGalleryRail
        mode={studioMode}
        collapsed={galleryCollapsed}
        onCollapsedChange={setGalleryCollapsed}
        onViewAll={() => navigate("gallery")}
        onViewAssets={() => navigate("assets")}
      />
      <GalleryReferenceRoleDialog
        open={pendingGalleryReference !== null}
        onSelect={addGalleryReference}
        onCancel={() => setPendingGalleryReference(null)}
      />
    </div>
  );
}

function StudioComposerDock({ mode }: { mode: StudioMode }) {
  return (
    <div className="shrink-0 bg-(--bg)">{mode === "image" ? <ImageRail /> : <VideoRail />}</div>
  );
}

export { resolveGalleryUrl } from "./utils.js";

function GalleryReferenceRoleDialog({
  open,
  onSelect,
  onCancel,
}: {
  open: boolean;
  onSelect: (role: StudioReferenceRole) => void;
  onCancel: () => void;
}) {
  const t = useT();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-(--text)/30 px-4 backdrop-blur-[1px]">
      <div className="w-full max-w-[360px] rounded-(--radius-lg) border border-(--border) bg-(--surface-raised) p-4 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-(--text)">{t("studio.referenceChooseType")}</h2>
            <p className="mt-1 text-[12px] text-(--text-muted)">
              {t("studio.referenceChooseTypeBody")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("studio.referenceCancel")}
            onClick={onCancel}
            className="inline-flex size-7 items-center justify-center rounded-(--radius-sm) text-(--text-muted) hover:bg-(--surface) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
          >
            ×
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {ASSET_REFERENCE_KINDS.map((kind) => (
            <RoleButton key={kind} referenceRole={kind} onSelect={onSelect} />
          ))}
          <RoleButton referenceRole="freeform" onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}

function RoleButton({
  referenceRole,
  onSelect,
}: {
  referenceRole: StudioReferenceRole;
  onSelect: (role: StudioReferenceRole) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onSelect(referenceRole)}
      className="inline-flex h-10 items-center justify-center rounded-(--radius-md) border border-(--border) bg-(--bg) px-3 text-[12px] font-semibold text-(--text) transition-colors duration-(--motion-fast) hover:border-(--border-strong) hover:bg-(--surface) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
    >
      {roleLabel(referenceRole, t)}
    </button>
  );
}

type TFn = ReturnType<typeof useT>;

function roleLabel(role: StudioReferenceRole, t: TFn): string {
  switch (role) {
    case "character":
      return t("studio.role.character");
    case "object":
      return t("studio.role.object");
    case "background":
      return t("studio.role.background");
    case "style":
      return t("studio.role.style");
    case "freeform":
      return t("studio.role.other");
    default:
      return t("studio.role.other");
  }
}

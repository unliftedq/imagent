import type { AssetKind } from "@imagine/core";
import type { DragEvent } from "react";
import { useState } from "react";
import type { StudioMode } from "../../state/useUIStore.js";
import { type StudioReferenceRole, useUIStore } from "../../state/useUIStore.js";
import { CanvasArea } from "./canvas.js";
import { StudioModeSwitch } from "./composer.js";
import { readStudioReferenceDragData, StudioGalleryRail } from "./galleryRail.js";
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

  const draft = studioMode === "image" ? imageDraft : videoDraft;
  const setDraft = studioMode === "image" ? setImageDraft : setVideoDraft;

  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes("application/x-imagine-studio-reference")) {
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
        pushToast({ title: "Reference already added", variant: "info" });
        return;
      }
      setDraft({
        assetIds: {
          ...draft.assetIds,
          [kind]: [...current, data.id],
        },
      });
      pushToast({ title: `Added ${referenceTypeLabel(data.kind)} reference`, variant: "success" });
      return;
    }

    const role = chooseGalleryReferenceRole();
    if (!role) return;
    setDraft({
      references: uniqueStrings([...draft.references, data.relPath]),
      referenceRoles: {
        ...draft.referenceRoles,
        [data.relPath]: role,
      },
    });
    pushToast({
      title: `Added gallery reference as ${referenceTypeLabel(role)}`,
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
        aria-label="Studio session drop area"
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
    </div>
  );
}

function StudioComposerDock({ mode }: { mode: StudioMode }) {
  return (
    <div className="shrink-0 bg-(--bg)">{mode === "image" ? <ImageRail /> : <VideoRail />}</div>
  );
}

export { resolveGalleryUrl } from "./utils.js";

function chooseGalleryReferenceRole(): StudioReferenceRole | null {
  const value = window.prompt(
    "Choose reference type: character, object, background, style, or other",
    "other",
  );
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "other" || normalized === "freeform") return "freeform";
  if (ASSET_REFERENCE_KINDS.includes(normalized as AssetKind)) return normalized as AssetKind;
  window.alert("Reference type must be character, object, background, style, or other.");
  return null;
}

function referenceTypeLabel(role: StudioReferenceRole): string {
  switch (role) {
    case "character":
      return "character";
    case "object":
      return "object";
    case "background":
      return "background";
    case "style":
      return "style";
    case "freeform":
      return "other";
    default:
      return "other";
  }
}

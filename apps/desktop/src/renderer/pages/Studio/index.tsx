import type { DragEvent } from "react";
import { useState } from "react";
import { useT } from "../../i18n/index.js";
import type { StudioMode } from "../../state/useUIStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { CanvasArea } from "./canvas.js";
import { AudioRail } from "./audioRail.js";
import { StudioModeSwitch } from "./composer.js";
import { readStudioReferenceDragData, StudioGalleryRail } from "./galleryRail.js";
import { ImageRail } from "./imageRail.js";
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
  const t = useT();

  const draft = studioMode === "video" ? videoDraft : imageDraft;
  const setDraft = studioMode === "video" ? setVideoDraft : setImageDraft;

  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes("application/x-imagent-studio-reference")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: DragEvent<HTMLElement>): void => {
    if (studioMode === "audio") return;
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
      pushToast({
        title: t("studio.referenceAddedAs", { kind: assetRoleLabel(data.kind, t) }),
        variant: "success",
      });
      return;
    }

    // Gallery drops are added directly as a freeform local reference — no
    // role-picker dialog. Users who want to bind a gallery item to a
    // specific role can still do so via the gallery rail's "Use as ..."
    // affordances.
    if (draft.references.includes(data.relPath)) {
      pushToast({ title: t("studio.referenceAlreadyAdded"), variant: "info" });
      return;
    }
    setDraft({
      references: uniqueStrings([...draft.references, data.relPath]),
      referenceRoles: {
        ...draft.referenceRoles,
        [data.relPath]: "freeform",
      },
    });
    pushToast({ title: t("studio.galleryReferenceAdded"), variant: "success" });
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
    </div>
  );
}

function StudioComposerDock({ mode }: { mode: StudioMode }) {
  return (
    <div className="shrink-0 bg-(--bg)">
      {mode === "image" ? <ImageRail /> : mode === "video" ? <VideoRail /> : <AudioRail />}
    </div>
  );
}

export { resolveGalleryUrl } from "./utils.js";

type TFn = ReturnType<typeof useT>;

function assetRoleLabel(role: "character" | "object" | "background" | "style", t: TFn): string {
  switch (role) {
    case "character":
      return t("studio.role.character");
    case "object":
      return t("studio.role.object");
    case "background":
      return t("studio.role.background");
    case "style":
      return t("studio.role.style");
  }
}

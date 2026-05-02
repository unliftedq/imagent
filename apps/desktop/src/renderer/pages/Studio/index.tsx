import type { StudioMode } from "../../state/useUIStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { CanvasArea } from "./canvas.js";
import { StudioModeSwitch } from "./composer.js";
import { StudioGalleryRail } from "./galleryRail.js";
import { ImageRail } from "./imageRail.js";
import { VideoRail } from "./videoRail.js";

export function StudioPage() {
  const studioMode = useUIStore((state) => state.studioMode);
  const setStudioMode = useUIStore((state) => state.setStudioMode);
  const navigate = useUIStore((state) => state.navigate);

  return (
    <div
      className="grid h-full min-h-0 w-full overflow-hidden"
      style={{
        gridTemplateColumns: "minmax(0, 1fr) var(--rail-gallery, 240px)",
      }}
    >
      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--bg)">
        <StudioModeSwitch mode={studioMode} onModeChange={setStudioMode} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <CanvasArea key={studioMode} mode={studioMode} />
        </div>
        <StudioComposerDock mode={studioMode} />
      </section>
      <StudioGalleryRail mode={studioMode} onViewAll={() => navigate("gallery")} />
    </div>
  );
}

function StudioComposerDock({ mode }: { mode: StudioMode }) {
  return <div className="shrink-0 bg-(--bg)">{mode === "image" ? <ImageRail /> : <VideoRail />}</div>;
}

export { resolveGalleryUrl } from "./utils.js";

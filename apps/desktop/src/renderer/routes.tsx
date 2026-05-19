import { Icons } from "@imagent/ui";
import type { ComponentType, ReactElement } from "react";
import type { MessageKey } from "./i18n/index.js";
import { AssetsPage } from "./pages/Assets";
import { GalleryPage } from "./pages/Gallery";
import { StudioPage } from "./pages/Studio";
import type { Route } from "./state/useUIStore.js";

export interface RouteDef {
  id: Route;
  /** i18n key for the nav-rail label. */
  labelKey: MessageKey;
  Component: ComponentType;
  /** Phosphor duotone icon — rendered in the NavRail row at 20px. */
  icon?: ReactElement;
  available: boolean;
}

/**
 * Three top-level page routes. Providers, Models, and Settings used to be
 * pages but now live inside the Settings dialog (see `useUIStore.openSettings`).
 * The pre-Quiet-Density `video` route was merged into Studio's `studioMode`
 * tab — see `useUIStore.applyRemix`.
 */
export const ROUTES: RouteDef[] = [
  {
    id: "studio",
    labelKey: "nav.studio",
    Component: StudioPage,
    icon: <Icons.MagicWand weight="duotone" className="size-5" />,
    available: true,
  },
  {
    id: "gallery",
    labelKey: "nav.gallery",
    Component: GalleryPage,
    icon: <Icons.SquaresFour weight="duotone" className="size-5" />,
    available: true,
  },
  {
    id: "assets",
    labelKey: "nav.assets",
    Component: AssetsPage,
    icon: <Icons.Cube weight="duotone" className="size-5" />,
    available: true,
  },
];

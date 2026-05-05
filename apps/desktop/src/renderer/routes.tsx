import { Icons } from "@imagent/ui";
import type { ComponentType, ReactElement } from "react";
import { AssetsPage } from "./pages/Assets";
import { GalleryPage } from "./pages/Gallery";
import { ModelsPage } from "./pages/Models";
import { ProvidersPage } from "./pages/Providers";
import { SettingsPage } from "./pages/Settings";
import { StudioPage } from "./pages/Studio";
import type { Route } from "./state/useUIStore.js";

export interface RouteDef {
  id: Route;
  label: string;
  Component: ComponentType;
  /** Phosphor duotone icon — rendered in the NavRail row at 20px. */
  icon?: ReactElement;
  available: boolean;
}

/**
 * Five routes (design spec §10.1). The pre-Quiet-Density `video` route was
 * merged into Studio's `studioMode` tab — see `useUIStore.applyRemix`.
 */
export const ROUTES: RouteDef[] = [
  {
    id: "studio",
    label: "Studio",
    Component: StudioPage,
    icon: <Icons.MagicWand weight="duotone" className="size-5" />,
    available: true,
  },
  {
    id: "gallery",
    label: "Gallery",
    Component: GalleryPage,
    icon: <Icons.SquaresFour weight="duotone" className="size-5" />,
    available: true,
  },
  {
    id: "assets",
    label: "Assets",
    Component: AssetsPage,
    icon: <Icons.Cube weight="duotone" className="size-5" />,
    available: true,
  },
  {
    id: "models",
    label: "Models",
    Component: ModelsPage,
    icon: <Icons.StarFour weight="duotone" className="size-5" />,
    available: true,
  },
  {
    id: "providers",
    label: "Providers",
    Component: ProvidersPage,
    icon: <Icons.Plug weight="duotone" className="size-5" />,
    available: true,
  },
  {
    id: "settings",
    label: "Settings",
    Component: SettingsPage,
    icon: <Icons.Gear weight="duotone" className="size-5" />,
    available: true,
  },
];

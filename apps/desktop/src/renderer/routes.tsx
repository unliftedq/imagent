import type { ComponentType, ReactElement } from "react";
import { Icons } from "@imagine/ui";
import { AssetsPage } from "./pages/Assets.js";
import { GalleryPage } from "./pages/Gallery.js";
import { ProvidersPage } from "./pages/Providers.js";
import { SettingsPage } from "./pages/Settings.js";
import { StudioPage } from "./pages/Studio.js";
import { VideoStudioPage } from "./pages/VideoStudio.js";
import type { Route } from "./state/useUIStore.js";

export interface RouteDef {
  id: Route;
  label: string;
  Component: ComponentType;
  /** Optional Phosphor icon rendered next to the label in the top bar. */
  icon?: ReactElement;
  available: boolean;
}

export const ROUTES: RouteDef[] = [
  {
    id: "studio",
    label: "Studio",
    Component: StudioPage,
    icon: <Icons.Image weight="duotone" className="size-4" />,
    available: true,
  },
  {
    id: "video",
    label: "Video",
    Component: VideoStudioPage,
    icon: <Icons.FilmReel weight="duotone" className="size-4" />,
    available: true,
  },
  {
    id: "gallery",
    label: "Gallery",
    Component: GalleryPage,
    icon: <Icons.SquaresFour weight="duotone" className="size-4" />,
    available: true,
  },
  {
    id: "assets",
    label: "Assets",
    Component: AssetsPage,
    icon: <Icons.Cube weight="duotone" className="size-4" />,
    available: true,
  },
  {
    id: "providers",
    label: "Providers",
    Component: ProvidersPage,
    icon: <Icons.Plug weight="duotone" className="size-4" />,
    available: true,
  },
  {
    id: "settings",
    label: "Settings",
    Component: SettingsPage,
    icon: <Icons.Gear weight="duotone" className="size-4" />,
    available: true,
  },
];

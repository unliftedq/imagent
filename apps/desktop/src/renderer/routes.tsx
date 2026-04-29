import type { ComponentType } from "react";
import { GalleryPage } from "./pages/Gallery.js";
import { ProvidersPage } from "./pages/Providers.js";
import { SettingsPage } from "./pages/Settings.js";
import { StudioPage } from "./pages/Studio.js";
import { NotYetImplemented } from "./pages/NotYetImplemented.js";
import type { Route } from "./state/useUIStore.js";

export interface RouteDef {
  id: Route;
  label: string;
  Component: ComponentType;
  available: boolean;
}

export const ROUTES: RouteDef[] = [
  {
    id: "studio",
    label: "Studio",
    Component: StudioPage,
    available: true,
  },
  {
    id: "video",
    label: "Video",
    Component: () => <NotYetImplemented title="Video Studio" milestone="M7" />,
    available: false,
  },
  {
    id: "gallery",
    label: "Gallery",
    Component: GalleryPage,
    available: true,
  },
  {
    id: "assets",
    label: "Assets",
    Component: () => <NotYetImplemented title="Assets" milestone="M6" />,
    available: false,
  },
  {
    id: "providers",
    label: "Providers",
    Component: ProvidersPage,
    available: true,
  },
  {
    id: "settings",
    label: "Settings",
    Component: SettingsPage,
    available: true,
  },
];

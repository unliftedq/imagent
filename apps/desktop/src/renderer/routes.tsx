import type { ComponentType } from "react";
import { ProvidersPage } from "./pages/Providers.js";
import { SettingsPage } from "./pages/Settings.js";
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
    Component: () => (
      <NotYetImplemented title="Studio" milestone="M5" description="Image generation lands in M5 — Boards + Remix come with it." />
    ),
    available: false,
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
    Component: () => <NotYetImplemented title="Gallery" milestone="M5" />,
    available: false,
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

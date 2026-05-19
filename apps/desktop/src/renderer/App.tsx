import { NavRail, type NavRoute, TooltipProvider, useTheme } from "@imagent/ui";
import { useEffect, useRef } from "react";
import { Toaster } from "./components/Toaster.js";
import { I18nProvider, useT } from "./i18n/index.js";
import { SettingsDialog } from "./pages/Settings/index.js";
import { ROUTES } from "./routes.js";
import { useConfigStore } from "./state/useConfigStore.js";
import { type Route, useUIStore } from "./state/useUIStore.js";

/**
 * App shell. The window is a 2-column grid: the persistent
 * `NavRail` (220px) on the left and the active route's page on the right.
 * There is no top app bar; the wordmark lives in the rail header.
 */
export function App() {
  const appPrefs = useConfigStore((s) => s.appPrefs);
  const refresh = useConfigStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <I18nProvider pref={appPrefs?.locale ?? null}>
      <AppShell />
    </I18nProvider>
  );
}

function AppShell() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const openSettings = useUIStore((s) => s.openSettings);
  const appPrefs = useConfigStore((s) => s.appPrefs);
  const summaries = useConfigStore((s) => s.summaries);
  const { theme, setTheme } = useTheme();
  const persistedTheme = appPrefs?.theme;
  const t = useT();
  // First-run: if no provider is configured, auto-open the Settings dialog
  // on the Providers section so the user lands in a usable setup flow.
  const initialOpenAppliedRef = useRef(false);

  useEffect(() => {
    if (initialOpenAppliedRef.current) return;
    if (!appPrefs) return; // wait for first refresh()
    initialOpenAppliedRef.current = true;
    const anyConfigured = summaries.some((s) => s.configured);
    if (!anyConfigured) {
      openSettings("providers");
    }
  }, [appPrefs, summaries, openSettings]);

  // Keep useTheme in sync with the persisted preference once loaded.
  useEffect(() => {
    if (persistedTheme && persistedTheme !== theme) {
      setTheme(persistedTheme);
    }
  }, [persistedTheme, setTheme, theme]);

  // NavRail rows: real page routes + a synthetic "settings" affordance that
  // opens the dialog rather than navigating.
  const navRoutes: Array<{ id: NavRoute; label: string; icon?: React.ReactNode }> = [
    ...ROUTES.filter((r) => r.available).map(({ id, labelKey, icon }) => ({
      id: id as NavRoute,
      label: t(labelKey),
      icon,
    })),
    {
      id: "settings" as const,
      label: t("nav.settings"),
    },
  ];

  // When the dialog is open, render the settings row as active. Otherwise
  // highlight the actual page route.
  const activeNavRoute: NavRoute = settingsOpen ? "settings" : route;

  function handleNavigate(target: NavRoute): void {
    if (target === "settings") {
      openSettings();
      return;
    }
    // Defensive: only navigate to ids that exist in the page route set.
    if (ROUTES.some((r) => r.id === target)) {
      navigate(target as Route);
    }
  }

  const Active = ROUTES.find((r) => r.id === route)?.Component ?? getFallbackRouteComponent();

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="grid h-screen w-screen overflow-hidden bg-(--bg) text-(--text)"
        style={{ gridTemplateColumns: "var(--rail-nav, 220px) minmax(0, 1fr)" }}
      >
        <NavRail activeRoute={activeNavRoute} onNavigate={handleNavigate} routes={navRoutes} />
        <main
          className={`h-screen bg-(--bg) ${route === "studio" ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          <Active />
        </main>
      </div>
      <SettingsDialog />
      <Toaster />
    </TooltipProvider>
  );
}

function getFallbackRouteComponent() {
  const fallback = ROUTES[0];
  if (!fallback) throw new Error("No routes configured.");
  return fallback.Component;
}

import { NavRail, TooltipProvider, useTheme } from "@imagent/ui";
import { useEffect, useRef } from "react";
import { Toaster } from "./components/Toaster.js";
import { ROUTES } from "./routes.js";
import { useConfigStore } from "./state/useConfigStore.js";
import { useUIStore } from "./state/useUIStore.js";

const NAV_ROUTES = ROUTES.filter((route) => route.available).map(({ id, label, icon }) => ({
  id,
  label,
  icon,
}));

/**
 * App shell — DESIGN.md §5.4. The window is a 2-column grid: the persistent
 * `NavRail` (220px) on the left and the active route's page on the right.
 * There is no top app bar; the wordmark lives in the rail header.
 */
export function App() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const appPrefs = useConfigStore((s) => s.appPrefs);
  const summaries = useConfigStore((s) => s.summaries);
  const refresh = useConfigStore((s) => s.refresh);
  const { theme, setTheme } = useTheme();
  const persistedTheme = appPrefs?.theme;
  // First-run initial route: if any provider is configured, default to /studio,
  // otherwise stay on /providers (where the store default already lands).
  const initialRouteAppliedRef = useRef(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (initialRouteAppliedRef.current) return;
    if (!appPrefs) return; // wait for first refresh()
    initialRouteAppliedRef.current = true;
    const anyConfigured = summaries.some((s) => s.configured);
    if (anyConfigured && route === "providers") {
      navigate("studio");
    }
    // else: stay wherever localStorage (or the default 'providers') put us.
  }, [appPrefs, summaries, navigate, route]);

  // Keep useTheme in sync with the persisted preference once loaded.
  useEffect(() => {
    if (persistedTheme && persistedTheme !== theme) {
      setTheme(persistedTheme);
    }
  }, [persistedTheme, setTheme, theme]);

  const Active = ROUTES.find((r) => r.id === route)?.Component ?? getFallbackRouteComponent();

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="grid h-screen w-screen overflow-hidden bg-(--bg) text-(--text)"
        style={{ gridTemplateColumns: "var(--rail-nav, 220px) minmax(0, 1fr)" }}
      >
        <NavRail activeRoute={route} onNavigate={navigate} routes={NAV_ROUTES} />
        <main
          className={`h-screen bg-(--bg) ${route === "studio" ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          <Active />
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

function getFallbackRouteComponent() {
  const fallback = ROUTES[0];
  if (!fallback) throw new Error("No routes configured.");
  return fallback.Component;
}

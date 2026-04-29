import { useEffect } from "react";
import { TooltipProvider, useTheme } from "@imagine-studio/ui";
import { ROUTES } from "./routes.js";
import { useUIStore } from "./state/useUIStore.js";
import { useConfigStore } from "./state/useConfigStore.js";

export function App() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const appPrefs = useConfigStore((s) => s.appPrefs);
  const refresh = useConfigStore((s) => s.refresh);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep useTheme in sync with the persisted preference once loaded.
  useEffect(() => {
    if (appPrefs && appPrefs.theme !== theme) {
      setTheme(appPrefs.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appPrefs?.theme]);

  const Active = ROUTES.find((r) => r.id === route)?.Component ?? ROUTES[0]!.Component;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen flex-col">
        <TopBar route={route} onNavigate={navigate} />
        <main className="flex-1 overflow-y-auto bg-(--color-canvas)">
          <Active />
        </main>
      </div>
    </TooltipProvider>
  );
}

function TopBar({
  route,
  onNavigate,
}: {
  route: ReturnType<typeof useUIStore.getState>["route"];
  onNavigate: (r: ReturnType<typeof useUIStore.getState>["route"]) => void;
}) {
  return (
    <header className="flex h-14 items-center gap-2 border-b border-(--color-hairline) bg-(--color-canvas) px-4">
      <span className="mr-4 select-none text-(length:--text-title-sm) font-semibold tracking-[-0.3px] text-(--color-ink)">
        imagine
      </span>
      <nav className="flex items-center gap-1">
        {ROUTES.map((r) => {
          const active = r.id === route;
          return (
            <button
              key={r.id}
              onClick={() => onNavigate(r.id)}
              className={
                "rounded-(--radius-pill) px-3 py-1.5 text-(length:--text-nav-link) transition-colors duration-(--duration-fast) " +
                (active
                  ? "bg-(--color-surface-card) text-(--color-ink)"
                  : "text-(--color-muted) hover:text-(--color-ink)") +
                (!r.available ? " opacity-60" : "")
              }
            >
              {r.label}
              {!r.available ? (
                <span className="ml-1 rounded-(--radius-pill) bg-(--color-surface-strong) px-1.5 py-0.5 text-[10px] font-semibold tracking-[1.5px] text-(--color-muted)">
                  SOON
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Storage key for the theme preference cached in localStorage (no FOUC). */
export const THEME_STORAGE_KEY = "imagine-studio.theme";

/**
 * Read the user's theme preference + resolve against `prefers-color-scheme`,
 * apply it to `<html data-theme>`, and write the choice to localStorage so
 * the inline boot script can avoid a flash next reload.
 *
 * The hook is local-only — Settings page calls
 * `api['app.preferences.set']({ theme })` separately to persist across runs.
 */
export function useTheme(initial?: ThemePref): {
  theme: ThemePref;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemePref) => void;
} {
  const [theme, setThemeState] = useState<ThemePref>(() => {
    if (initial) return initial;
    if (typeof window === "undefined") return "system";
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemePref | null;
      if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch {
      // storage may be unavailable (private mode, file:// quirks)
    }
    return "system";
  });

  const resolvedTheme: ResolvedTheme = useResolvedTheme(theme);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemePref) => {
    setThemeState(next);
  }, []);

  return { theme, resolvedTheme, setTheme };
}

function useResolvedTheme(theme: ThemePref): ResolvedTheme {
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

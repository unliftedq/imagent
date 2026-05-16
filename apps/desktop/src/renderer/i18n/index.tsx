import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../lib/api.js";
import en, { type MessageKey } from "./messages.en.js";
import zh from "./messages.zh.js";

/**
 * The concrete language a UI string is rendered in. `LocalePref` is what the
 * user can choose in Settings (which adds `"system"` to follow the host OS).
 */
export type Locale = "en" | "zh";
export type LocalePref = "system" | "en" | "zh";

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, zh };

const LOCALE_PREF_LS_KEY = "imagent.localePref.v1";
const LOCALE_CACHE_LS_KEY = "imagent.locale.v1";

/**
 * Map an IETF locale tag (e.g. `en-US`, `zh-CN`, `zh-Hant-TW`) to one of our
 * supported buckets. Anything with a `zh` primary tag (regardless of region
 * or script) resolves to Chinese; everything else falls back to English.
 */
export function resolveSystemLocale(systemLocale: string | null | undefined): Locale {
  if (!systemLocale) return "en";
  const primary = systemLocale.split(/[-_]/)[0]?.toLowerCase();
  if (primary === "zh") return "zh";
  return "en";
}

/**
 * Resolve a user preference + system locale to the concrete UI locale.
 */
export function resolveLocale(pref: LocalePref, systemLocale: string | null | undefined): Locale {
  if (pref === "en" || pref === "zh") return pref;
  return resolveSystemLocale(systemLocale);
}

function readCachedSystemLocale(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOCALE_CACHE_LS_KEY);
  } catch {
    return null;
  }
}

function writeCachedSystemLocale(systemLocale: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_CACHE_LS_KEY, systemLocale);
  } catch {
    // localStorage may be unavailable; ignore.
  }
}

function readCachedPref(): LocalePref {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(LOCALE_PREF_LS_KEY);
    if (v === "en" || v === "zh" || v === "system") return v;
  } catch {
    // ignore
  }
  return "system";
}

function writeCachedPref(pref: LocalePref): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_PREF_LS_KEY, pref);
  } catch {
    // ignore
  }
}

/**
 * Substitute `{name}` placeholders with values from `params`. Missing keys
 * are left intact so it's obvious during development which placeholder is
 * unfilled.
 */
function formatMessage(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export interface I18nContextValue {
  /** User preference: "system" / "en" / "zh". */
  pref: LocalePref;
  /** The concrete locale actually rendered. */
  locale: Locale;
  /** The raw OS locale string as reported by Electron, e.g. `zh-CN`. */
  systemLocale: string;
  /** Set the user preference. Persists to localStorage; does NOT persist to
   * config.json — callers handle that via `api['app.preferences.set']`. */
  setPref: (pref: LocalePref) => void;
  /** Translate a key, optionally interpolating `{placeholders}`. */
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  /**
   * Preference loaded from `app.preferences.get()`. The provider falls back
   * to the localStorage cache while config is loading so the first paint
   * doesn't flash English on a Chinese-preference user.
   */
  pref: LocalePref | null;
  children: ReactNode;
}

export function I18nProvider({ pref: prefFromConfig, children }: I18nProviderProps) {
  const [systemLocale, setSystemLocale] = useState<string>(() => readCachedSystemLocale() ?? "en");
  const [effectivePref, setEffectivePref] = useState<LocalePref>(() => readCachedPref());

  useEffect(() => {
    let cancelled = false;
    void api["system.locale"]()
      .then(({ locale }) => {
        if (cancelled || !locale) return;
        setSystemLocale(locale);
        writeCachedSystemLocale(locale);
      })
      .catch(() => {
        // No-op: fallback cache or "en" is fine.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once config loads, prefer its value over the cached pref.
  useEffect(() => {
    if (prefFromConfig === null) return;
    setEffectivePref(prefFromConfig);
    writeCachedPref(prefFromConfig);
  }, [prefFromConfig]);

  const locale = useMemo(
    () => resolveLocale(effectivePref, systemLocale),
    [effectivePref, systemLocale],
  );

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>): string => {
      const dict = DICTIONARIES[locale];
      const fallback = en[key];
      const raw = dict[key] ?? fallback ?? key;
      return formatMessage(raw, params);
    },
    [locale],
  );

  const setPref = useCallback((pref: LocalePref) => {
    setEffectivePref(pref);
    writeCachedPref(pref);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ pref: effectivePref, locale, systemLocale, setPref, t }),
    [effectivePref, locale, systemLocale, setPref, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Pull the translate function (and resolved locale state) from context. The
 * provider must wrap the renderer tree — see `App.tsx`.
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n: must be used inside <I18nProvider>");
  }
  return ctx;
}

/** Shortcut hook for components that only need `t()`. */
export function useT(): I18nContextValue["t"] {
  return useI18n().t;
}

export type { MessageKey } from "./messages.en.js";

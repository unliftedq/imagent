import { Icons, Dialog } from "@imagent/ui";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/index.js";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
  useUIStore,
} from "../../state/useUIStore.js";
import {
  SettingsSubpageContext,
  type SettingsSubpage,
  type SettingsSubpageContextValue,
  useSettingsSubpage,
} from "./context.js";
import { SectionContent } from "./sections.js";

const SECTION_META: Record<
  SettingsSection,
  {
    icon: React.ReactNode;
    labelKey: Parameters<ReturnType<typeof useI18n>["t"]>[0];
  }
> = {
  general: {
    icon: <Icons.SlidersHorizontal weight="duotone" className="size-4" />,
    labelKey: "settings.section.general",
  },
  providers: {
    icon: <Icons.Plug weight="duotone" className="size-4" />,
    labelKey: "settings.section.providers",
  },
  models: {
    icon: <Icons.Sparkle weight="duotone" className="size-4" />,
    labelKey: "settings.section.models",
  },
  about: {
    icon: <Icons.Info weight="duotone" className="size-4" />,
    labelKey: "settings.section.about",
  },
};

export { useSettingsSubpage };
export type { SettingsSubpage };

export function SettingsDialog() {
  const open = useUIStore((s) => s.settingsOpen);
  const section = useUIStore((s) => s.settingsSection);
  const setSection = useUIStore((s) => s.setSettingsSection);
  const closeSettings = useUIStore((s) => s.closeSettings);
  const { t } = useI18n();

  const [subpage, setSubpageState] = useState<SettingsSubpage | null>(null);
  const setSubpage = useCallback((next: SettingsSubpage | null) => {
    setSubpageState(next);
  }, []);
  useEffect(() => {
    if (!open) setSubpageState(null);
  }, [open]);

  const contextValue = useMemo<SettingsSubpageContextValue>(
    () => ({ subpage, setSubpage }),
    [subpage, setSubpage],
  );

  function handleRailNavigate(next: SettingsSection) {
    if (subpage) {
      subpage.onBack();
    }
    setSection(next);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSettings();
      }}
    >
      <Dialog.Content
        showClose={false}
        className={
          "w-[min(960px,calc(100vw-3rem))] max-w-none p-0 " +
          "h-[min(640px,calc(100vh-3rem))] overflow-hidden"
        }
      >
        <Dialog.Title className="sr-only">{t("settings.title")}</Dialog.Title>
        <Dialog.Description className="sr-only">{t("settings.subtitle")}</Dialog.Description>

        <SettingsSubpageContext.Provider value={contextValue}>
          <div className="grid h-full grid-cols-[220px_minmax(0,1fr)]">
            <aside className="flex h-full flex-col border-r border-(--border) bg-(--surface-sunken)">
              <header className="px-4 pt-5 pb-3">
                <h2 className="text-(length:--text-title-md) font-display font-semibold tracking-(--text-display-sm--letter-spacing) text-(--text)">
                  {t("settings.title")}
                </h2>
              </header>
              <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
                {SETTINGS_SECTIONS.map((id) => {
                  const meta = SECTION_META[id];
                  const active = id === section;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => handleRailNavigate(id)}
                        aria-current={active ? "true" : undefined}
                        className={
                          "flex h-8 w-full items-center gap-2 rounded-(--radius-sm) px-2 text-left " +
                          "text-[13px] transition-colors duration-(--motion-fast) " +
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
                          (active
                            ? "bg-(--accent-soft) text-(--accent) font-semibold"
                            : "text-(--text-muted) hover:bg-(--surface) hover:text-(--text)")
                        }
                      >
                        <span className={active ? "text-(--accent)" : "text-(--text-muted)"}>
                          {meta.icon}
                        </span>
                        <span className="truncate">{t(meta.labelKey)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="flex h-full min-h-0 flex-col">
              <header className="flex shrink-0 items-center justify-between border-b border-(--border) px-6 py-4">
                {subpage ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={subpage.onBack}
                      aria-label={t("common.back")}
                      className={
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-sm) " +
                        "text-(--text-muted) transition-colors duration-(--duration-fast) " +
                        "hover:bg-(--surface) hover:text-(--text) " +
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
                      }
                    >
                      <Icons.CaretRight weight="bold" className="size-4 rotate-180" />
                    </button>
                    <h3 className="truncate text-(length:--text-title-md) font-semibold text-(--text)">
                      {subpage.title}
                    </h3>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-(--text-muted)">{SECTION_META[section].icon}</span>
                    <h3 className="text-(length:--text-title-md) font-semibold text-(--text)">
                      {t(SECTION_META[section].labelKey)}
                    </h3>
                  </div>
                )}
                <Dialog.Close
                  aria-label={t("common.close")}
                  className={
                    "inline-flex size-8 items-center justify-center rounded-(--radius-sm) " +
                    "text-(--text-muted) transition-colors duration-(--duration-fast) " +
                    "hover:bg-(--surface) hover:text-(--text)"
                  }
                >
                  <Icons.X weight="bold" className="size-4" />
                </Dialog.Close>
              </header>
              <div
                className={
                  subpage
                    ? "flex min-h-0 flex-1 flex-col"
                    : "flex-1 overflow-y-auto px-6 py-5"
                }
              >
                <SectionContent section={section} />
              </div>
            </section>
          </div>
        </SettingsSubpageContext.Provider>
      </Dialog.Content>
    </Dialog.Root>
  );
}

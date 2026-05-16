import { Icons, Select } from "@imagent/ui";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { useT } from "../../i18n/index.js";
import type { StudioMode } from "../../state/useUIStore.js";
import { autosizeComposer } from "./utils.js";

export function StudioModeSwitch({
  mode,
  onModeChange,
}: {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
}) {
  const t = useT();
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-center bg-(--bg)/95 backdrop-blur">
      <div className="grid grid-cols-2 gap-1 rounded-(--radius-lg) border border-(--border) bg-(--surface) p-1">
        <ModeSwitchButton
          active={mode === "image"}
          icon={<Icons.Image weight="duotone" className="size-4" />}
          onClick={() => onModeChange("image")}
        >
          {t("studio.modeImage")}
        </ModeSwitchButton>
        <ModeSwitchButton
          active={mode === "video"}
          icon={<Icons.FilmReel weight="duotone" className="size-4" />}
          onClick={() => onModeChange("video")}
        >
          {t("studio.modeVideo")}
        </ModeSwitchButton>
      </div>
    </header>
  );
}

function ModeSwitchButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "inline-flex h-9 min-w-28 items-center justify-center gap-2 rounded-(--radius-md) " +
        "px-4 text-[13px] font-semibold transition-colors duration-(--motion-fast) " +
        "ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-(--focus-ring) " +
        (active
          ? "bg-(--bg) text-(--text) shadow-[0_0_0_1px_var(--border)]"
          : "text-(--text-muted) hover:bg-(--surface-sunken) hover:text-(--text)")
      }
    >
      {icon}
      {children}
    </button>
  );
}

export function ChatComposerShell({
  mode,
  prompt,
  onPromptChange,
  onSubmit,
  placeholder,
  submitting,
  disabled,
  validationError,
  remixId,
  onClearRemix,
  children,
}: {
  mode: StudioMode;
  prompt: string;
  onPromptChange: (next: string) => void;
  onSubmit: () => void;
  placeholder: string;
  submitting: boolean;
  disabled: boolean;
  validationError: string | null;
  remixId?: string;
  onClearRemix?: () => void;
  children: ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const t = useT();

  useEffect(() => {
    autosizeComposer(textareaRef.current);
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  };

  const actionLabel = mode === "video" ? t("studio.composer.submit") : t("studio.composer.generate");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-5">
      <div
        className={
          "overflow-hidden rounded-(--radius-lg) border border-(--border) " +
          "bg-(--surface-raised) shadow-[0_16px_48px_-30px_rgba(0,0,0,0.45)] " +
          "transition-colors duration-(--motion-fast) focus-within:border-(--border-strong)"
        }
      >
        {remixId ? (
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <span
              className={
                "inline-flex items-center gap-1 rounded-(--radius-pill) " +
                "bg-(--accent-soft) px-2.5 py-1 text-[11px] font-semibold text-(--accent)"
              }
            >
              {t("studio.remixBadge", { id: remixId.slice(0, 8) })}
            </span>
            {onClearRemix ? (
              <button
                type="button"
                onClick={onClearRemix}
                className="text-[12px] text-(--text-muted) underline-offset-2 hover:text-(--text) hover:underline"
              >
                {t("common.clear")}
              </button>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className={
            "block max-h-[220px] min-h-[104px] w-full resize-none bg-transparent " +
            "px-4 py-4 text-[14px] leading-6 text-(--text) placeholder:text-(--text-faint) " +
            "focus-visible:outline-none"
          }
        />

        {validationError ? (
          <div className="mx-3 mb-2 rounded-(--radius-sm) border border-(--danger) bg-(--danger-soft) px-3 py-2 text-[12px] text-(--danger)">
            {validationError}
          </div>
        ) : null}

        <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-(--border-faint) px-3 py-2">
          {children}
          <button
            type="button"
            aria-label={actionLabel}
            title={actionLabel}
            onClick={onSubmit}
            disabled={disabled || submitting}
            className="studio-composer-submit ml-auto"
          >
            {submitting ? (
              <Icons.CircleNotch
                weight="bold"
                className="size-[15px] animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Icons.ArrowRight
                weight="bold"
                className="studio-composer-submit-icon size-[15px]"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToolbarSelectTrigger({
  ariaLabel,
  icon,
  className,
}: {
  ariaLabel: string;
  icon: ReactNode;
  className: string;
}) {
  return (
    <Select.Trigger aria-label={ariaLabel} className={className}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-(--text-muted)">{icon}</span>
        <Select.Value />
      </span>
    </Select.Trigger>
  );
}

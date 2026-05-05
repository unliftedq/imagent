import {
  Icons,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from "@imagent/ui";
import { useUIStore, type ToastEntry } from "../state/useUIStore.js";

/**
 * App-level toast renderer. Subscribes to `useUIStore.toasts` and renders one
 * Radix `<Toast>` per entry. Mounted once near the App root inside its own
 * `<ToastProvider>`. Auto-dismisses after 8s for non-error variants, 12s for
 * error variants (so users have time to read provider stack traces).
 */
export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  return (
    <ToastProvider swipeDirection="right">
      {toasts.map((t) => (
        <ToastEntryView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}

function ToastEntryView({
  toast,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: () => void;
}) {
  const accent = ACCENT_BY_VARIANT[toast.variant];
  const Icon = ICON_BY_VARIANT[toast.variant];
  return (
    <ToastRoot
      duration={toast.variant === "error" ? 12_000 : 8_000}
      className={accent.border}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <span
        className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-(--radius-full) ${accent.iconBg} ${accent.iconFg}`}
      >
        <Icon weight="fill" className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ToastTitle>{toast.title}</ToastTitle>
        {toast.description ? (
          <ToastDescription className="break-words text-(--text-muted)">
            {toast.description}
          </ToastDescription>
        ) : null}
      </div>
      <ToastClose
        className="-mr-1 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-(--radius-sm) text-(--text-muted) hover:bg-(--surface) hover:text-(--text)"
        aria-label="Dismiss"
      >
        <Icons.X weight="bold" className="size-4" />
      </ToastClose>
    </ToastRoot>
  );
}

const ACCENT_BY_VARIANT: Record<
  ToastEntry["variant"],
  { border: string; iconBg: string; iconFg: string }
> = {
  info: {
    border: "border-l-2 border-l-(--accent)",
    iconBg: "bg-(--accent-soft)/40",
    iconFg: "text-(--accent)",
  },
  success: {
    border: "border-l-2 border-l-(--success)",
    iconBg: "bg-(--success-soft)/60",
    iconFg: "text-(--success)",
  },
  warning: {
    border: "border-l-2 border-l-(--warning)",
    iconBg: "bg-(--warning-soft)/60",
    iconFg: "text-(--warning)",
  },
  error: {
    border: "border-l-2 border-l-(--danger)",
    iconBg: "bg-(--danger-soft)/60",
    iconFg: "text-(--danger)",
  },
};

const ICON_BY_VARIANT: Record<ToastEntry["variant"], typeof Icons.Info> = {
  info: Icons.Info,
  success: Icons.CheckCircle,
  warning: Icons.WarningCircle,
  error: Icons.XCircle,
};

import type { UpdateCheckResult, UpdateStatusPayload } from "@imagent/ipc";
import { Button, Icons } from "@imagent/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/index.js";
import { api } from "../../lib/api.js";

export function UpdatesPanel({ currentVersion }: { currentVersion: string | null }) {
  const { t, locale } = useI18n();
  const [check, setCheck] = useState<UpdateCheckResult | null>(null);
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const checkingRef = useRef(false);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  useEffect(() => {
    const unsub = api.on("updater.progress", (payload) => {
      setStatus(payload);
    });
    void api["updater.status"]()
      .then(setStatus)
      .catch(() => {});
    return () => {
      unsub();
    };
  }, []);

  const runCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const result = await api["updater.check"]();
      setCheck(result);
      setLastCheckedAt(Date.now());
    } catch (err) {
      setCheck({
        status: "error",
        currentVersion: currentVersion ?? "",
        message: (err as Error)?.message ?? String(err),
      });
      setLastCheckedAt(Date.now());
    } finally {
      checkingRef.current = false;
    }
  }, [currentVersion]);

  async function runDownload() {
    try {
      await api["updater.download"]();
    } catch (err) {
      setStatus({
        state: "error",
        bytes: 0,
        total: 0,
        version: status?.version ?? null,
        message: (err as Error)?.message ?? String(err),
      });
    }
  }

  async function runInstall() {
    try {
      await api["updater.install"]();
    } catch (err) {
      setStatus({
        state: "error",
        bytes: status?.bytes ?? 0,
        total: status?.total ?? 0,
        version: status?.version ?? null,
        message: (err as Error)?.message ?? String(err),
      });
    }
  }

  async function openReleasePage() {
    if (check?.status !== "available") return;
    try {
      await api["system.openExternal"]({ url: check.releaseUrl });
    } catch {
      // ignore
    }
  }

  const isChecking = status?.state === "checking";
  const isDownloading = status?.state === "downloading";
  const isReady = status?.state === "ready";
  const isInstalling = status?.state === "installing";

  const percent =
    isDownloading && status && status.total > 0
      ? Math.min(100, Math.round((status.bytes / status.total) * 100))
      : 0;

  const releaseNotesPreview = useMemo(() => {
    if (check?.status !== "available" || !check.releaseNotes) return null;
    const trimmed = check.releaseNotes.trim();
    if (trimmed.length === 0) return null;
    return trimmed.length > 800 ? `${trimmed.slice(0, 800)}…` : trimmed;
  }, [check]);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-(length:--text-body-sm)">
        <dt className="text-(--text-muted)">{t("settings.updates.currentVersion")}</dt>
        <dd className="font-mono text-(--text)">{currentVersion ?? "—"}</dd>
        {check?.status === "available" || (check?.status === "uptodate" && check.latestVersion) ? (
          <>
            <dt className="text-(--text-muted)">{t("settings.updates.latestVersion")}</dt>
            <dd className="font-mono text-(--text)">
              {check.status === "available" ? check.latestVersion : (check.latestVersion ?? "—")}
            </dd>
          </>
        ) : null}
        {check?.status === "available" && check.publishedAt ? (
          <>
            <dt className="text-(--text-muted)">{t("settings.updates.publishedAt")}</dt>
            <dd className="text-(--text)">
              {(() => {
                try {
                  return dateFormatter.format(new Date(check.publishedAt));
                } catch {
                  return check.publishedAt;
                }
              })()}
            </dd>
          </>
        ) : null}
      </dl>

      <UpdateStatusLine check={check} status={status} isChecking={isChecking} percent={percent} />

      <div className="flex flex-wrap items-center gap-2">
        {check?.status === "available" ? (
          <>
            {check.asset && !isReady && !isInstalling ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => void runDownload()}
                disabled={isDownloading || isChecking}
              >
                {isDownloading
                  ? t("settings.updates.downloading", { percent: String(percent) })
                  : t("settings.updates.download")}
              </Button>
            ) : null}
            {isDownloading ? (
              <Button variant="ghost" size="md" onClick={() => void api["updater.cancel"]()}>
                {t("settings.updates.cancel")}
              </Button>
            ) : null}
            {isReady ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => void runInstall()}
                disabled={isInstalling}
              >
                {isInstalling ? t("settings.updates.installing") : t("settings.updates.install")}
              </Button>
            ) : null}
            <Button variant="ghost" size="md" onClick={() => void openReleasePage()}>
              {t("settings.updates.openRelease")}
            </Button>
          </>
        ) : null}
        <Button
          variant={check ? "secondary" : "primary"}
          size="md"
          onClick={() => void runCheck()}
          disabled={isChecking || isDownloading || isInstalling}
        >
          {isChecking
            ? t("settings.updates.checking")
            : check
              ? t("settings.updates.recheck")
              : t("settings.updates.check")}
        </Button>
      </div>

      {isDownloading && status && status.total > 0 ? (
        <div className="h-1.5 w-full overflow-hidden rounded-(--radius-pill) bg-(--surface)">
          <div
            className="h-full bg-(--accent) transition-[width] duration-(--duration-fast)"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      <p className="text-(length:--text-caption) text-(--text-muted)">
        {lastCheckedAt
          ? t("settings.updates.lastChecked", {
              when: dateFormatter.format(new Date(lastCheckedAt)),
            })
          : t("settings.updates.lastCheckedNever")}
      </p>

      {check?.status === "available" && isReady ? (
        <p className="text-(length:--text-caption) text-(--text-muted)">
          {t("settings.updates.installNote")}
        </p>
      ) : null}

      {releaseNotesPreview ? (
        <details className="rounded-(--radius-md) border border-(--border) bg-(--surface) p-3">
          <summary className="cursor-pointer text-(length:--text-body-sm) text-(--text)">
            {t("settings.updates.releaseNotes")}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-(length:--text-caption) text-(--text-muted)">
            {releaseNotesPreview}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function UpdateStatusLine({
  check,
  status,
  isChecking,
  percent,
}: {
  check: UpdateCheckResult | null;
  status: UpdateStatusPayload | null;
  isChecking: boolean;
  percent: number;
}) {
  const { t } = useI18n();
  if (status?.state === "error" && status.message) {
    return (
      <StatusBanner
        tone="error"
        icon={<Icons.WarningCircle weight="duotone" className="size-4" />}
        text={t("settings.updates.downloadFailed", { message: status.message })}
      />
    );
  }
  if (status?.state === "installing") {
    return (
      <StatusBanner
        tone="info"
        icon={<Icons.CircleNotch weight="duotone" className="size-4 animate-spin" />}
        text={t("settings.updates.installing")}
      />
    );
  }
  if (status?.state === "ready") {
    return (
      <StatusBanner
        tone="success"
        icon={<Icons.CheckCircle weight="duotone" className="size-4" />}
        text={t("settings.updates.ready")}
      />
    );
  }
  if (status?.state === "downloading") {
    return (
      <StatusBanner
        tone="info"
        icon={<Icons.CloudArrowDown weight="duotone" className="size-4" />}
        text={t("settings.updates.downloading", { percent: String(percent) })}
      />
    );
  }
  if (isChecking) {
    return (
      <StatusBanner
        tone="info"
        icon={<Icons.CircleNotch weight="duotone" className="size-4 animate-spin" />}
        text={t("settings.updates.checking")}
      />
    );
  }
  if (check?.status === "error") {
    return (
      <StatusBanner
        tone="error"
        icon={<Icons.WarningCircle weight="duotone" className="size-4" />}
        text={t("settings.updates.checkFailed", { message: check.message })}
      />
    );
  }
  if (check?.status === "available") {
    if (!check.asset) {
      return (
        <StatusBanner
          tone="info"
          icon={<Icons.Info weight="duotone" className="size-4" />}
          text={t("settings.updates.noAssetForPlatform")}
        />
      );
    }
    return (
      <StatusBanner
        tone="info"
        icon={<Icons.CloudArrowDown weight="duotone" className="size-4" />}
        text={t("settings.updates.available", { version: check.latestVersion })}
      />
    );
  }
  if (check?.status === "uptodate") {
    return (
      <StatusBanner
        tone="success"
        icon={<Icons.CheckCircle weight="duotone" className="size-4" />}
        text={t("settings.updates.upToDate")}
      />
    );
  }
  return null;
}

function StatusBanner({
  tone,
  icon,
  text,
}: {
  tone: "info" | "success" | "error";
  icon: React.ReactNode;
  text: string;
}) {
  const toneClass =
    tone === "error"
      ? "text-(--danger)"
      : tone === "success"
        ? "text-(--success)"
        : "text-(--text)";
  return (
    <div className={`flex items-start gap-2 text-(length:--text-body-sm) ${toneClass}`}>
      <span className="mt-[2px] shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

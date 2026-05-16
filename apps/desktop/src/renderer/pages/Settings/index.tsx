import type { ImageModelDef, VideoModelDef } from "@imagent/core";
import type {
  AppPreferencesPayload,
  ProviderId,
  ProviderSummary,
  UpdateCheckResult,
  UpdateStatusPayload,
} from "@imagent/ipc";
import {
  Button,
  Icons,
  Input,
  Panel,
  PanelBody,
  PanelHeader,
  type ThemePref,
  useTheme,
} from "@imagent/ui";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LocalePref, useI18n } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useConfigStore } from "../../state/useConfigStore.js";
import {
  createUnifiedModelOptions,
  ProviderModelPicker,
  useModelFavorites,
} from "../Studio/modelPicker.js";

export function SettingsPage() {
  const { appPrefs, summaries, refresh, saveAppPrefs } = useConfigStore();
  const { setTheme } = useTheme();
  const { t, setPref } = useI18n();
  const [version, setVersion] = useState<Awaited<ReturnType<(typeof api)["app.version"]>> | null>(
    null,
  );
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [imageModelsByProvider, setImageModelsByProvider] = useState<
    Record<string, ImageModelDef[]>
  >({});
  const [videoModelsByProvider, setVideoModelsByProvider] = useState<
    Record<string, VideoModelDef[]>
  >({});
  const { favoriteKeys, toggleFavorite } = useModelFavorites();

  const configuredImageProviders = useMemo(
    () => summaries.filter((summary) => summary.configured && summary.kinds.includes("image")),
    [summaries],
  );
  const configuredVideoProviders = useMemo(
    () => summaries.filter((summary) => summary.configured && summary.kinds.includes("video")),
    [summaries],
  );

  useEffect(() => {
    void refresh();
    void api["app.version"]()
      .then(setVersion)
      .catch(() => {});
  }, [refresh]);

  useEffect(() => {
    let isCancelled = false;
    void loadModels<ImageModelDef>(configuredImageProviders, "image").then((models) => {
      if (!isCancelled) setImageModelsByProvider(models);
    });
    return () => {
      isCancelled = true;
    };
  }, [configuredImageProviders]);

  useEffect(() => {
    let isCancelled = false;
    void loadModels<VideoModelDef>(configuredVideoProviders, "video").then((models) => {
      if (!isCancelled) setVideoModelsByProvider(models);
    });
    return () => {
      isCancelled = true;
    };
  }, [configuredVideoProviders]);

  function patch(next: Partial<NonNullable<typeof appPrefs>>) {
    if (saveTimer) clearTimeout(saveTimer);
    const t = setTimeout(() => {
      void saveAppPrefs(next);
    }, 400);
    setSaveTimer(t);
  }

  async function chooseDir() {
    const res = await api["system.chooseDirectory"]({});
    if (res.path) {
      await saveAppPrefs({ defaultOutputDir: res.path });
    }
  }

  if (!appPrefs) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <p className="text-(--text-muted)">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-10">
      <header className="mb-2">
        <h1 className="text-(length:--text-display-sm) font-display font-medium tracking-(--text-display-sm--letter-spacing) text-(--text)">
          {t("settings.title")}
        </h1>
        <p className="mt-2 text-(length:--text-body-md) text-(--text)">{t("settings.subtitle")}</p>
      </header>

      <Panel>
        <PanelHeader>
          <SectionTitle
            icon={<Icons.Translate weight="duotone" className="size-5" />}
            title={t("settings.section.language")}
          />
        </PanelHeader>
        <PanelBody>
          <div className="flex flex-col gap-2">
            <SegmentedLanguage
              value={appPrefs.locale}
              onChange={(next) => {
                setPref(next);
                void saveAppPrefs({ locale: next });
              }}
              labels={{
                system: t("settings.language.system"),
                en: t("settings.language.english"),
                zh: t("settings.language.chinese"),
              }}
            />
            <p className="text-(length:--text-caption) text-(--text-muted)">
              {t("settings.language.helper")}
            </p>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <SectionTitle
            icon={<Icons.Sun weight="duotone" className="size-5" />}
            title={t("settings.section.theme")}
          />
        </PanelHeader>
        <PanelBody>
          <SegmentedTheme
            value={appPrefs.theme}
            labels={{
              light: t("settings.theme.light"),
              dark: t("settings.theme.dark"),
              system: t("settings.theme.system"),
            }}
            onChange={(t) => {
              setTheme(t);
              void saveAppPrefs({ theme: t });
            }}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <SectionTitle
            icon={<Icons.Plug weight="duotone" className="size-5" />}
            title={t("settings.section.defaults")}
          />
        </PanelHeader>
        <PanelBody>
          <div className="flex flex-col gap-5">
            <Field
              label={t("settings.defaultImageModel")}
              helperText={t("settings.defaultImageModel.helper")}
            >
              <DefaultModelPicker
                mode="image"
                providers={configuredImageProviders}
                modelsByProvider={imageModelsByProvider}
                value={appPrefs.defaultImageModel}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={toggleFavorite}
                onChange={(value) => void saveAppPrefs({ defaultImageModel: value })}
                noProvidersLabel={t("settings.noConfiguredProviders")}
              />
            </Field>

            <Field
              label={t("settings.defaultVideoModel")}
              helperText={t("settings.defaultVideoModel.helper")}
            >
              <DefaultModelPicker
                mode="video"
                providers={configuredVideoProviders}
                modelsByProvider={videoModelsByProvider}
                value={appPrefs.defaultVideoModel}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={toggleFavorite}
                onChange={(value) => void saveAppPrefs({ defaultVideoModel: value })}
                noProvidersLabel={t("settings.noConfiguredProviders")}
              />
            </Field>

            <Field
              label={t("settings.generationConcurrency")}
              helperText={t("settings.generationConcurrency.helper")}
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={appPrefs.generationConcurrency}
                  onChange={(e) => patch({ generationConcurrency: Number(e.target.value) })}
                  className="flex-1 accent-(--accent)"
                />
                <span className="w-8 text-center text-(--text) font-mono text-sm">
                  {appPrefs.generationConcurrency}
                </span>
              </div>
            </Field>

            <Field
              label={t("settings.defaultOutputDir")}
              helperText={
                appPrefs.defaultOutputDir
                  ? t("settings.defaultOutputDir.helperSet")
                  : t("settings.defaultOutputDir.helperUnset")
              }
            >
              <div className="flex gap-2">
                <Input
                  value={appPrefs.defaultOutputDir ?? ""}
                  placeholder={t("settings.defaultOutputDir.placeholder")}
                  readOnly
                  className="flex-1"
                />
                <Button variant="secondary" size="md" onClick={() => void chooseDir()}>
                  {t("common.choose")}
                </Button>
                {appPrefs.defaultOutputDir ? (
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => void saveAppPrefs({ defaultOutputDir: null })}
                  >
                    {t("common.reset")}
                  </Button>
                ) : null}
              </div>
            </Field>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <SectionTitle
            icon={<Icons.CloudArrowDown weight="duotone" className="size-5" />}
            title={t("settings.section.updates")}
          />
        </PanelHeader>
        <PanelBody>
          <UpdatesPanel currentVersion={version?.app ?? null} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <SectionTitle
            icon={<Icons.Info weight="duotone" className="size-5" />}
            title={t("settings.section.about")}
          />
        </PanelHeader>
        <PanelBody>
          {version ? (
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-(length:--text-body-sm)">
              <dt className="text-(--text-muted)">{t("settings.about.app")}</dt>
              <dd className="font-mono text-(--text)">{version.app}</dd>
              <dt className="text-(--text-muted)">{t("settings.about.electron")}</dt>
              <dd className="font-mono text-(--text)">{version.electron}</dd>
              <dt className="text-(--text-muted)">{t("settings.about.node")}</dt>
              <dd className="font-mono text-(--text)">{version.node}</dd>
              <dt className="text-(--text-muted)">{t("settings.about.platform")}</dt>
              <dd className="font-mono text-(--text)">
                {version.platform} {version.arch}
              </dd>
            </dl>
          ) : (
            <p className="text-(--text-muted)">{t("common.loading")}</p>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

type DefaultModelValue = NonNullable<AppPreferencesPayload["defaultImageModel"]>;

function DefaultModelPicker({
  mode,
  providers,
  modelsByProvider,
  value,
  favoriteKeys,
  onToggleFavorite,
  onChange,
  noProvidersLabel,
}: {
  mode: "image" | "video";
  providers: ProviderSummary[];
  modelsByProvider: Record<string, Array<ImageModelDef | VideoModelDef>>;
  value: DefaultModelValue | null;
  favoriteKeys: Set<string>;
  onToggleFavorite: Parameters<typeof ProviderModelPicker>[0]["onToggleFavorite"];
  onChange: (value: DefaultModelValue) => void;
  noProvidersLabel: string;
}) {
  const options = useMemo(
    () => createUnifiedModelOptions(providers, modelsByProvider),
    [providers, modelsByProvider],
  );
  const first = options[0];
  const providerId = value?.providerId ?? first?.providerId ?? "";
  const modelId = value?.modelId ?? first?.modelId ?? "";

  if (providers.length === 0) {
    return <p className="text-(length:--text-body-sm) text-(--text-muted)">{noProvidersLabel}</p>;
  }

  return (
    <ProviderModelPicker
      mode={mode}
      options={options}
      providerId={providerId}
      modelId={modelId}
      favoriteKeys={favoriteKeys}
      onToggleFavorite={onToggleFavorite}
      onChange={(next) => onChange({ providerId: next.providerId, modelId: next.modelId })}
    />
  );
}

async function loadModels<T extends ImageModelDef | VideoModelDef>(
  providers: ProviderSummary[],
  mode: "image" | "video",
): Promise<Record<string, T[]>> {
  if (providers.length === 0) {
    return {};
  }
  const nextModels: Record<string, T[]> = {};
  await Promise.all(
    providers.map(async (provider) => {
      try {
        const response =
          mode === "image"
            ? await api["image.models"]({ providerId: provider.id as ProviderId })
            : await api["video.models"]({ providerId: provider.id as ProviderId });
        nextModels[provider.id] = response.models as T[];
      } catch {
        // Keep successfully loaded providers available if one provider fails.
      }
    }),
  );
  return nextModels;
}

function SegmentedTheme({
  value,
  onChange,
  labels,
}: {
  value: ThemePref;
  onChange: (v: ThemePref) => void;
  labels: { light: string; dark: string; system: string };
}) {
  const opts: Array<{ id: ThemePref; label: string; icon: React.ReactNode }> = [
    {
      id: "system",
      label: labels.system,
      icon: <Icons.Gear weight="duotone" className="size-4" />,
    },
    { id: "light", label: labels.light, icon: <Icons.Sun weight="duotone" className="size-4" /> },
    { id: "dark", label: labels.dark, icon: <Icons.Moon weight="duotone" className="size-4" /> },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--surface) p-1">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={
              "inline-flex items-center gap-2 rounded-(--radius-pill) px-3 py-1.5 text-(length:--text-nav-link) transition-colors duration-(--duration-fast) " +
              (active
                ? "bg-(--bg) text-(--text) shadow-[0_0_0_1px_var(--border)]"
                : "text-(--text-muted) hover:text-(--text)")
            }
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SegmentedLanguage({
  value,
  onChange,
  labels,
}: {
  value: LocalePref;
  onChange: (v: LocalePref) => void;
  labels: { system: string; en: string; zh: string };
}) {
  const opts: Array<{ id: LocalePref; label: string; icon: React.ReactNode }> = [
    {
      id: "system",
      label: labels.system,
      icon: <Icons.Gear weight="duotone" className="size-4" />,
    },
    {
      id: "en",
      label: labels.en,
      icon: <Icons.Translate weight="duotone" className="size-4" />,
    },
    {
      id: "zh",
      label: labels.zh,
      icon: <Icons.Translate weight="duotone" className="size-4" />,
    },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--surface) p-1">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={
              "inline-flex items-center gap-2 rounded-(--radius-pill) px-3 py-1.5 text-(length:--text-nav-link) transition-colors duration-(--duration-fast) " +
              (active
                ? "bg-(--bg) text-(--text) shadow-[0_0_0_1px_var(--border)]"
                : "text-(--text-muted) hover:text-(--text)")
            }
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function UpdatesPanel({ currentVersion }: { currentVersion: string | null }) {
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

  // Subscribe to push events so a download in progress drives the UI even if
  // it was triggered before this component mounted (e.g. startup check found
  // an update, user navigated here mid-download).
  useEffect(() => {
    const unsub = api.on("updater.progress", (payload) => {
      setStatus(payload);
    });
    // Hydrate the initial state in case we missed early events.
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
  // Prefer the most actionable / errorful state when summarizing.
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

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-(--text-muted)">{icon}</span>
      <span className="text-(length:--text-title-md) font-semibold text-(--text)">{title}</span>
    </div>
  );
}

function Field({
  label,
  children,
  helperText,
}: {
  label: string;
  children: React.ReactNode;
  helperText?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-(length:--text-caption-uppercase) tracking-[1.5px] text-(--text-muted)">
        {label}
      </span>
      {children}
      {helperText ? (
        <span className="text-(length:--text-caption) text-(--text-muted)">{helperText}</span>
      ) : null}
    </div>
  );
}

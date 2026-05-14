import type { ImageModelDef, VideoModelDef } from "@imagent/core";
import type { AppPreferencesPayload, ProviderId, ProviderSummary } from "@imagent/ipc";
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
import { useEffect, useMemo, useState } from "react";
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
        <p className="text-(--text-muted)">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-10">
      <header className="mb-2">
        <h1 className="text-(length:--text-display-sm) font-display font-medium tracking-(--text-display-sm--letter-spacing) text-(--text)">
          Settings
        </h1>
        <p className="mt-2 text-(length:--text-body-md) text-(--text)">
          Workspace defaults. Changes save automatically.
        </p>
      </header>

      <Panel>
        <PanelHeader>
          <SectionTitle icon={<Icons.Sun weight="duotone" className="size-5" />} title="Theme" />
        </PanelHeader>
        <PanelBody>
          <SegmentedTheme
            value={appPrefs.theme}
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
            title="Defaults"
          />
        </PanelHeader>
        <PanelBody>
          <div className="flex flex-col gap-5">
            <Field
              label="Default image model"
              helperText="Used when image generation starts without an explicit provider/model."
            >
              <DefaultModelPicker
                mode="image"
                providers={configuredImageProviders}
                modelsByProvider={imageModelsByProvider}
                value={appPrefs.defaultImageModel}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={toggleFavorite}
                onChange={(value) => void saveAppPrefs({ defaultImageModel: value })}
              />
            </Field>

            <Field
              label="Default video model"
              helperText="Used when video generation starts without an explicit provider/model."
            >
              <DefaultModelPicker
                mode="video"
                providers={configuredVideoProviders}
                modelsByProvider={videoModelsByProvider}
                value={appPrefs.defaultVideoModel}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={toggleFavorite}
                onChange={(value) => void saveAppPrefs({ defaultVideoModel: value })}
              />
            </Field>

            <Field label="Generation concurrency" helperText="How many jobs may run in parallel.">
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
              label="Default output directory"
              helperText={
                appPrefs.defaultOutputDir
                  ? "Files generated by this app are written here."
                  : "Defaults to ~/.imagent/gallery/."
              }
            >
              <div className="flex gap-2">
                <Input
                  value={appPrefs.defaultOutputDir ?? ""}
                  placeholder="~/.imagent/gallery"
                  readOnly
                  className="flex-1"
                />
                <Button variant="secondary" size="md" onClick={() => void chooseDir()}>
                  Choose…
                </Button>
                {appPrefs.defaultOutputDir ? (
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => void saveAppPrefs({ defaultOutputDir: null })}
                  >
                    Reset
                  </Button>
                ) : null}
              </div>
            </Field>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <SectionTitle icon={<Icons.Info weight="duotone" className="size-5" />} title="About" />
        </PanelHeader>
        <PanelBody>
          {version ? (
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-(length:--text-body-sm)">
              <dt className="text-(--text-muted)">App</dt>
              <dd className="font-mono text-(--text)">{version.app}</dd>
              <dt className="text-(--text-muted)">Electron</dt>
              <dd className="font-mono text-(--text)">{version.electron}</dd>
              <dt className="text-(--text-muted)">Node</dt>
              <dd className="font-mono text-(--text)">{version.node}</dd>
              <dt className="text-(--text-muted)">Platform</dt>
              <dd className="font-mono text-(--text)">
                {version.platform} {version.arch}
              </dd>
            </dl>
          ) : (
            <p className="text-(--text-muted)">Loading…</p>
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
}: {
  mode: "image" | "video";
  providers: ProviderSummary[];
  modelsByProvider: Record<string, Array<ImageModelDef | VideoModelDef>>;
  value: DefaultModelValue | null;
  favoriteKeys: Set<string>;
  onToggleFavorite: Parameters<typeof ProviderModelPicker>[0]["onToggleFavorite"];
  onChange: (value: DefaultModelValue) => void;
}) {
  const options = useMemo(
    () => createUnifiedModelOptions(providers, modelsByProvider),
    [providers, modelsByProvider],
  );
  const first = options[0];
  const providerId = value?.providerId ?? first?.providerId ?? "";
  const modelId = value?.modelId ?? first?.modelId ?? "";

  if (providers.length === 0) {
    return (
      <p className="text-(length:--text-body-sm) text-(--text-muted)">No configured providers.</p>
    );
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
}: {
  value: ThemePref;
  onChange: (v: ThemePref) => void;
}) {
  const opts: Array<{ id: ThemePref; label: string; icon: React.ReactNode }> = [
    { id: "light", label: "Light", icon: <Icons.Sun weight="duotone" className="size-4" /> },
    { id: "dark", label: "Dark", icon: <Icons.Moon weight="duotone" className="size-4" /> },
    {
      id: "system",
      label: "System",
      icon: <Icons.Gear weight="duotone" className="size-4" />,
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

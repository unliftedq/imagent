import type { ImageModelDef, VideoModelDef } from "@imagent/core";
import type { UpdateCheckResult } from "@imagent/ipc";
import { Button, Icons, useTheme } from "@imagent/ui";
import { useEffect, useMemo, useState } from "react";
import { type LocalePref, useI18n } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useConfigStore } from "../../state/useConfigStore.js";
import type { SettingsSection } from "../../state/useUIStore.js";
import { ModelsSection } from "../Models/index.js";
import { ProvidersSection } from "../Providers/index.js";
import { useModelFavorites } from "../Studio/modelPicker.js";
import {
  DefaultModelPicker,
  DefaultOutputDirField,
  Field,
  loadModels,
  SegmentedLanguage,
  SegmentedTheme,
  SubGroup,
} from "./controls.js";
import { UpdatesPanel } from "./updates.js";

const LEGAL_LINKS = {
  privacy: "https://unliftedq.github.io/imagent/privacy",
  terms: "https://unliftedq.github.io/imagent/terms",
} as const;

export function SectionContent({ section }: { section: SettingsSection }) {
  switch (section) {
    case "general":
      return <GeneralSection />;
    case "providers":
      return <ProvidersSection />;
    case "models":
      return <ModelsSection />;
    case "about":
      return <AboutSection />;
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

function GeneralSection() {
  const { appPrefs, summaries, saveAppPrefs } = useConfigStore();
  const { setTheme } = useTheme();
  const { t, setPref } = useI18n();
  const [imageModelsByProvider, setImageModelsByProvider] = useState<
    Record<string, ImageModelDef[]>
  >({});
  const [videoModelsByProvider, setVideoModelsByProvider] = useState<
    Record<string, VideoModelDef[]>
  >({});
  const { favoriteKeys, toggleFavorite } = useModelFavorites();
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const configuredImageProviders = useMemo(
    () => summaries.filter((summary) => summary.configured && summary.kinds.includes("image")),
    [summaries],
  );
  const configuredVideoProviders = useMemo(
    () => summaries.filter((summary) => summary.configured && summary.kinds.includes("video")),
    [summaries],
  );

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
    const id = setTimeout(() => {
      void saveAppPrefs(next);
    }, 400);
    setSaveTimer(id);
  }

  async function chooseDir() {
    const res = await api["system.chooseDirectory"]({});
    if (res.path) {
      await saveAppPrefs({ defaultOutputDir: res.path });
    }
  }

  if (!appPrefs) {
    return <p className="text-(--text-muted)">{t("common.loading")}</p>;
  }

  return (
    <div className="flex flex-col gap-7">
      <SubGroup title={t("settings.section.language")}>
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
      </SubGroup>

      <SubGroup title={t("settings.section.appearance")}>
        <SegmentedTheme
          value={appPrefs.theme}
          labels={{
            light: t("settings.theme.light"),
            dark: t("settings.theme.dark"),
            system: t("settings.theme.system"),
          }}
          onChange={(next) => {
            setTheme(next);
            void saveAppPrefs({ theme: next });
          }}
        />
      </SubGroup>

      <SubGroup title={t("settings.section.defaults")}>
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

          <DefaultOutputDirField
            label={t("settings.defaultOutputDir")}
            helperText={
              appPrefs.defaultOutputDir
                ? t("settings.defaultOutputDir.helperSet")
                : t("settings.defaultOutputDir.helperUnset")
            }
            value={appPrefs.defaultOutputDir}
            placeholder={t("settings.defaultOutputDir.placeholder")}
            chooseLabel={t("common.choose")}
            resetLabel={t("common.reset")}
            onChoose={() => void chooseDir()}
            onReset={() => void saveAppPrefs({ defaultOutputDir: null })}
          />
        </div>
      </SubGroup>
    </div>
  );
}

function AboutSection() {
  const { t } = useI18n();
  const [version, setVersion] = useState<Awaited<ReturnType<(typeof api)["app.version"]>> | null>(
    null,
  );
  useEffect(() => {
    void api["app.version"]()
      .then(setVersion)
      .catch(() => {});
  }, []);

  async function openLegalLink(url: (typeof LEGAL_LINKS)[keyof typeof LEGAL_LINKS]) {
    try {
      await api["system.openExternal"]({ url });
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <SubGroup title={t("settings.section.about")}>
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
      </SubGroup>

      <SubGroup title={t("settings.section.legal")}>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            trailingIcon={<Icons.ArrowSquareOut weight="bold" className="size-4" />}
            onClick={() => void openLegalLink(LEGAL_LINKS.privacy)}
          >
            {t("settings.legal.privacy")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            trailingIcon={<Icons.ArrowSquareOut weight="bold" className="size-4" />}
            onClick={() => void openLegalLink(LEGAL_LINKS.terms)}
          >
            {t("settings.legal.terms")}
          </Button>
        </div>
      </SubGroup>

      <SubGroup title={t("settings.section.updates")}>
        <UpdatesPanel currentVersion={version?.app ?? null} />
      </SubGroup>
    </div>
  );
}

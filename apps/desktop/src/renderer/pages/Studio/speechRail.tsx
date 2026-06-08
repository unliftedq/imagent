import type {
  SpeechKnob,
  SpeechModelCaps,
  SpeechModelDef,
  SpeechRequest,
  VoiceInfo,
} from "@imagent/core";
import type { ProviderId } from "@imagent/ipc";
import { IpcClientError } from "@imagent/ipc";
import { Button, Icons, Input, Popover, Select } from "@imagent/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useConfigStore } from "../../state/useConfigStore.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { useJobsStore } from "../../state/useJobsStore.js";
import { type SpeechDraft, useUIStore } from "../../state/useUIStore.js";
import { ChatComposerShell } from "./composer.js";
import {
  ConfigSection,
  ConfigurationPopoverButton,
  PanelSelectTrigger,
  RangeSlider,
  SegmentedControl,
} from "./configurationPanel.js";
import {
  createUnifiedModelOptions,
  ProviderModelPicker,
  useModelFavorites,
} from "./modelPicker.js";

type ExtraValue = string | number;

/**
 * Session-scoped cache of discovered voices keyed by `providerId::modelId`.
 * Voice lists rarely change within a session, so we fetch once and reuse —
 * switching models/providers back and forth doesn't re-hit the provider API.
 * Only successful (resolved) results are cached; failures fall back to static
 * catalog voices and remain retryable.
 */
const voiceCache = new Map<string, VoiceInfo[]>();
const voiceInflight = new Map<string, Promise<VoiceInfo[]>>();

function voiceCacheKey(providerId: string, modelId: string | null): string {
  return `${providerId}::${modelId ?? ""}`;
}

/** Secondary line for a voice row: prefer the normalized description, else join remaining labels. */
function voiceDescription(voice: VoiceInfo): string | undefined {
  if (voice.description && voice.description.trim().length > 0) return voice.description;
  const labels = voice.labels;
  if (!labels) return undefined;
  const parts = Object.entries(labels)
    .filter(
      ([key, value]) => key !== "description" && typeof value === "string" && value.length > 0,
    )
    .map(([, value]) => value);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function SpeechRail() {
  const draft = useUIStore((state) => state.studioDraft.speech);
  const setDraft = useUIStore((state) => state.setSpeechDraft);
  const openSettings = useUIStore((state) => state.openSettings);
  const pushToast = useUIStore((state) => state.pushToast);
  const t = useT();

  const summaries = useConfigStore((state) => state.summaries);
  const refreshConfig = useConfigStore((state) => state.refresh);
  const refreshGallery = useGalleryStore((state) => state.refresh);
  const trackStudioJob = useJobsStore((state) => state.trackStudioJob);

  const [modelsByProvider, setModelsByProvider] = useState<Record<string, SpeechModelDef[]>>({});
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { favoriteKeys, toggleFavorite } = useModelFavorites();

  const configuredSpeechProviders = useMemo(
    () => summaries.filter((summary) => summary.configured && summary.kinds.includes("speech")),
    [summaries],
  );

  useEffect(() => {
    void refreshConfig();
    void refreshGallery();
  }, [refreshConfig, refreshGallery]);

  useEffect(() => {
    if (configuredSpeechProviders.length === 0) return;
    const first = configuredSpeechProviders[0];
    if (!first) return;
    const defaultId =
      draft.providerId &&
      configuredSpeechProviders.some((provider) => provider.id === draft.providerId)
        ? (draft.providerId as ProviderId)
        : (first.id as ProviderId);
    if (draft.providerId !== defaultId) {
      setDraft({
        providerId: defaultId,
        model: first.defaultModel ?? first.modelIds[0] ?? null,
      });
    }
  }, [configuredSpeechProviders, draft.providerId, setDraft]);

  useEffect(() => {
    if (configuredSpeechProviders.length === 0) {
      setModelsByProvider({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextModels: Record<string, SpeechModelDef[]> = {};
      const failures: string[] = [];
      await Promise.all(
        configuredSpeechProviders.map(async (provider) => {
          try {
            const response = await api["speech.models"]({ providerId: provider.id as ProviderId });
            nextModels[provider.id] = response.models;
          } catch (err) {
            failures.push(`${provider.displayName}: ${(err as Error)?.message ?? String(err)}`);
          }
        }),
      );
      if (cancelled) return;
      setModelsByProvider(nextModels);
      if (failures.length > 0) {
        pushToast({
          title: t("studio.speech.couldNotLoadModels"),
          description: failures.slice(0, 2).join("\n"),
          variant: "error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configuredSpeechProviders, pushToast]);

  useEffect(() => {
    const activeProvider = draft.providerId || configuredSpeechProviders[0]?.id;
    if (!activeProvider) return;
    const activeModels = modelsByProvider[activeProvider] ?? [];
    if (activeModels.length === 0 || activeModels.some((model) => model.id === draft.model)) return;
    const fallback = activeModels[0]?.id ?? "";
    if (fallback) {
      setDraft({ providerId: activeProvider, model: fallback });
    }
  }, [configuredSpeechProviders, draft.model, draft.providerId, modelsByProvider, setDraft]);

  const selectedModel = useMemo(
    () =>
      draft.providerId
        ? (modelsByProvider[draft.providerId]?.find((model) => model.id === draft.model) ?? null)
        : null,
    [modelsByProvider, draft.providerId, draft.model],
  );
  const caps = selectedModel?.capabilities;
  const staticVoices = useMemo(() => caps?.voices ?? [], [caps?.voices]);

  useEffect(() => {
    if (!draft.providerId) {
      setVoices(staticVoices);
      return;
    }
    const providerId = draft.providerId as ProviderId;
    const key = voiceCacheKey(providerId, draft.model);

    const cached = voiceCache.get(key);
    if (cached) {
      setVoices(cached.length > 0 ? cached : staticVoices);
      return;
    }

    let cancelled = false;
    let request = voiceInflight.get(key);
    if (!request) {
      request = api["speech.voices"]({
        providerId,
        ...(draft.model ? { modelId: draft.model } : {}),
      }).then((response) => response.voices);
      voiceInflight.set(key, request);
    }
    request
      .then((list) => {
        voiceCache.set(key, list);
        voiceInflight.delete(key);
        if (!cancelled) setVoices(list.length > 0 ? list : staticVoices);
      })
      .catch(() => {
        voiceInflight.delete(key);
        if (!cancelled) setVoices(staticVoices);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.providerId, draft.model, staticVoices]);

  useEffect(() => {
    if (voices.length === 0) {
      if (draft.voice !== null) setDraft({ voice: null });
      return;
    }
    if (!draft.voice || !voices.some((voice) => voice.id === draft.voice)) {
      setDraft({ voice: voices[0]?.id ?? null });
    }
  }, [voices, draft.voice, setDraft]);

  useEffect(() => {
    const range = caps?.speedRange;
    if (!range) {
      if (draft.speed !== null) setDraft({ speed: null });
      return;
    }
    const fallback = readNumberDefault(selectedModel, "speed", 1);
    const nextSpeed = clampNumber(draft.speed ?? fallback, range.min, range.max);
    if (draft.speed !== nextSpeed) setDraft({ speed: nextSpeed });
  }, [caps?.speedRange, draft.speed, selectedModel, setDraft]);

  useEffect(() => {
    const formats = caps?.outputFormats ?? [];
    if (formats.length === 0) {
      const patch: Partial<SpeechDraft> = {};
      if (draft.codec !== null) patch.codec = null;
      if (draft.formatQuality !== null) patch.formatQuality = null;
      if (Object.keys(patch).length > 0) setDraft(patch);
      return;
    }
    const codecs = formats.map((format) => format.codec);
    let nextCodec = draft.codec;
    if (!nextCodec || !codecs.includes(nextCodec)) {
      const fallback = readStringDefault(selectedModel, "codec", codecs[0] ?? null);
      nextCodec = fallback && codecs.includes(fallback) ? fallback : (codecs[0] ?? null);
    }
    const qualities = formats.find((format) => format.codec === nextCodec)?.qualities ?? [];
    let nextQuality = draft.formatQuality;
    if (qualities.length === 0) {
      nextQuality = null;
    } else if (!nextQuality || !qualities.includes(nextQuality)) {
      const fallback = readStringDefault(selectedModel, "formatQuality", qualities[0] ?? null);
      nextQuality = fallback && qualities.includes(fallback) ? fallback : (qualities[0] ?? null);
    }
    const patch: Partial<SpeechDraft> = {};
    if (nextCodec !== draft.codec) patch.codec = nextCodec;
    if (nextQuality !== draft.formatQuality) patch.formatQuality = nextQuality;
    if (Object.keys(patch).length > 0) setDraft(patch);
  }, [caps?.outputFormats, draft.codec, draft.formatQuality, selectedModel, setDraft]);

  useEffect(() => {
    const knobs = caps?.extraKnobs ?? {};
    const nextExtras = normalizeExtrasForKnobs(draft.extras, knobs, selectedModel);
    if (!extrasEqual(draft.extras, nextExtras)) setDraft({ extras: nextExtras });
  }, [caps?.extraKnobs, draft.extras, selectedModel, setDraft]);

  const submit = async (): Promise<void> => {
    setValidationError(null);
    const prompt = draft.text.trim();
    if (!draft.providerId || !draft.model || prompt.length === 0) {
      setValidationError(t("studio.speech.missingFields"));
      return;
    }

    const request: SpeechRequest = {
      prompt,
      providerId: draft.providerId,
      model: draft.model,
      ...(draft.voice ? { voice: draft.voice } : {}),
      ...(typeof draft.speed === "number" ? { speed: draft.speed } : {}),
      ...(draft.codec ? { codec: draft.codec } : {}),
      ...(draft.formatQuality ? { formatQuality: draft.formatQuality } : {}),
      ...(Object.keys(draft.extras).length ? { raw: draft.extras } : {}),
      ...(draft.parentId ? { parentId: draft.parentId } : {}),
      assetIds: [],
    };

    setSubmitting(true);
    try {
      const { jobId } = await api["speech.submit"](request);
      trackStudioJob({
        id: jobId,
        kind: "speech",
        prompt: request.prompt,
        submittedAt: Date.now(),
      });
      setDraft({ text: "", parentId: undefined });
    } catch (err) {
      const message =
        err instanceof IpcClientError ? `${err.message}` : ((err as Error)?.message ?? String(err));
      pushToast({
        title: t("studio.speech.submitFailed"),
        description: message,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (configuredSpeechProviders.length === 0) {
    return (
      <div className="rounded-(--radius-md) border border-(--border) bg-(--surface-raised) p-4 text-center">
        <Icons.Waveform weight="duotone" className="mx-auto size-8 text-(--text-muted)" />
        <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-(--text)">
          {t("studio.speech.noProvider")}
        </h2>
        <p className="mt-1 text-[12px] text-(--text-muted)">{t("studio.speech.noProviderDesc")}</p>
        <div className="mt-3 inline-flex">
          <Button size="sm" onClick={() => openSettings("providers")}>
            {t("studio.openProviders")}
          </Button>
        </div>
      </div>
    );
  }

  const modelOptions = createUnifiedModelOptions(configuredSpeechProviders, modelsByProvider);

  return (
    <ChatComposerShell
      mode="speech"
      prompt={draft.text}
      onPromptChange={(text) => setDraft({ text })}
      onSubmit={() => void submit()}
      placeholder={t("studio.speech.placeholder")}
      submitting={submitting}
      disabled={!draft.text.trim()}
      validationError={validationError}
    >
      <ProviderModelPicker
        mode="speech"
        options={modelOptions}
        providerId={draft.providerId ?? ""}
        modelId={draft.model ?? ""}
        favoriteKeys={favoriteKeys}
        onToggleFavorite={toggleFavorite}
        onChange={(next) => setDraft({ providerId: next.providerId, model: next.modelId })}
      />
      <SpeechVoiceSelect
        voices={voices}
        value={draft.voice}
        onChange={(voice) => setDraft({ voice })}
      />
      <SpeechConfigurationPanel caps={caps} draft={draft} onChange={setDraft} />
    </ChatComposerShell>
  );
}

function SpeechVoiceSelect({
  voices,
  value,
  onChange,
}: {
  voices: VoiceInfo[];
  value: string | null;
  onChange: (voice: string | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = (): void => {
    const el = previewAudioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlayingId(null);
  };

  // Stop any preview when the picker closes.
  useEffect(() => {
    if (!open) stopPreview();
  }, [open]);

  // Stop + release the speech preview element on unmount.
  useEffect(() => {
    return () => {
      const el = previewAudioRef.current;
      if (el) el.pause();
      previewAudioRef.current = null;
    };
  }, []);

  if (voices.length === 0) return null;

  const selected = voices.find((voice) => voice.id === value) ?? voices[0];

  const togglePreview = (voice: VoiceInfo): void => {
    if (!voice.previewUrl) return;
    if (playingId === voice.id) {
      stopPreview();
      return;
    }
    let el = previewAudioRef.current;
    if (!el) {
      el = new Audio();
      el.onended = () => setPlayingId(null);
      previewAudioRef.current = el;
    }
    el.src = voice.previewUrl;
    el.currentTime = 0;
    void el
      .play()
      .then(() => setPlayingId(voice.id))
      .catch(() => setPlayingId(null));
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t("studio.speech.voice")}
          className={
            "inline-flex h-8 max-w-[180px] items-center gap-1.5 rounded-(--radius-pill) " +
            "bg-(--bg) px-3 text-[12px] text-(--text) hover:bg-(--surface)"
          }
        >
          <Icons.UserCircle weight="duotone" className="size-3.5 shrink-0 text-(--text-muted)" />
          <span className="truncate">{selected?.name}</span>
          <Icons.CaretDown weight="bold" className="size-3 shrink-0 text-(--text-muted)" />
        </button>
      </Popover.Trigger>
      <Popover.Content align="start" className="w-[280px] p-1">
        <div className="flex max-h-[320px] flex-col overflow-y-auto">
          {voices.map((voice) => {
            const active = voice.id === value;
            const description = voiceDescription(voice);
            const playing = playingId === voice.id;
            return (
              <div
                key={voice.id}
                className={
                  "flex items-center gap-1.5 rounded-(--radius-sm) pr-1 " +
                  (active ? "bg-(--accent-soft)/40" : "hover:bg-(--surface)")
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(voice.id);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-1.5 text-left"
                >
                  <span className="w-full truncate text-[12px] text-(--text)">{voice.name}</span>
                  {description ? (
                    <span className="w-full truncate text-[11px] text-(--text-muted)">
                      {description}
                    </span>
                  ) : null}
                </button>
                {voice.previewUrl ? (
                  <button
                    type="button"
                    aria-label={
                      playing ? t("studio.speech.voiceStop") : t("studio.speech.voicePreview")
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      togglePreview(voice);
                    }}
                    className="flex size-6 shrink-0 items-center justify-center rounded-(--radius-sm) text-(--text-muted) hover:bg-(--bg) hover:text-(--text)"
                  >
                    {playing ? (
                      <Icons.Pause weight="fill" className="size-3.5" />
                    ) : (
                      <Icons.Play weight="fill" className="size-3.5" />
                    )}
                  </button>
                ) : null}
                {active ? (
                  <Icons.Check weight="bold" className="size-3.5 shrink-0 text-(--accent)" />
                ) : null}
              </div>
            );
          })}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function SpeechConfigurationPanel({
  caps,
  draft,
  onChange,
}: {
  caps: SpeechModelCaps | undefined;
  draft: SpeechDraft;
  onChange: (patch: Partial<SpeechDraft>) => void;
}) {
  const t = useT();
  const formats = caps?.outputFormats ?? [];
  const range = caps?.speedRange;
  const knobs = caps?.extraKnobs ?? {};
  const knobEntries = Object.entries(knobs);

  const codecs = formats.map((format) => format.codec);
  const qualities = formats.find((format) => format.codec === draft.codec)?.qualities ?? [];

  if (!range && formats.length === 0 && knobEntries.length === 0) return null;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <ConfigurationPopoverButton label={t("studio.speech.config")} />
      </Popover.Trigger>
      <Popover.Content align="start" className="w-[420px] p-0">
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-5">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-(--text)">
            {t("studio.configuration")}
          </h2>

          {codecs.length > 0 ? (
            <ConfigSection title={t("studio.speech.codec")}>
              <SegmentedControl
                ariaLabel={t("studio.speech.codec")}
                options={codecs}
                value={draft.codec ?? codecs[0]}
                onChange={(codec) => onChange({ codec })}
              />
            </ConfigSection>
          ) : null}

          {qualities.length > 0 ? (
            <ConfigSection title={t("studio.speech.formatQuality")}>
              <SegmentedControl
                ariaLabel={t("studio.speech.formatQuality")}
                options={qualities}
                value={draft.formatQuality ?? qualities[0]}
                onChange={(formatQuality) => onChange({ formatQuality })}
              />
            </ConfigSection>
          ) : null}

          {range ? (
            <ConfigSection title={t("studio.speech.speed")}>
              <NumberKnobControl
                value={draft.speed ?? clampNumber(1, range.min, range.max)}
                min={range.min}
                max={range.max}
                step={0.05}
                onChange={(speed) => onChange({ speed })}
              />
            </ConfigSection>
          ) : null}

          {knobEntries.length > 0 ? (
            <ConfigSection title={t("studio.speech.extraKnobs")}>
              <div className="flex flex-col gap-4">
                {knobEntries.map(([key, knob]) => (
                  <SpeechExtraKnob
                    key={key}
                    name={key}
                    knob={knob}
                    value={draft.extras[key]}
                    onChange={(value) => onChange({ extras: { ...draft.extras, [key]: value } })}
                  />
                ))}
              </div>
            </ConfigSection>
          ) : null}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function SpeechExtraKnob({
  name,
  knob,
  value,
  onChange,
}: {
  name: string;
  knob: SpeechKnob;
  value: ExtraValue | undefined;
  onChange: (value: ExtraValue) => void;
}) {
  if (knob.type === "enum") {
    const values = knob.values ?? [];
    if (values.length === 0) return null;
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-(--text-muted)">{formatKnobLabel(name)}</span>
        <Select.Root
          value={typeof value === "string" && values.includes(value) ? value : (values[0] ?? "")}
          onValueChange={onChange}
        >
          <PanelSelectTrigger ariaLabel={formatKnobLabel(name)} />
          <Select.Content>
            {values.map((option) => (
              <Select.Item key={option} value={option}>
                {option}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </label>
    );
  }

  const min = knob.min ?? 0;
  const max = knob.max ?? 1;
  const numeric = typeof value === "number" ? value : min;
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[12px] font-medium text-(--text-muted)">{formatKnobLabel(name)}</span>
      <NumberKnobControl value={numeric} min={min} max={max} step={0.01} onChange={onChange} />
    </label>
  );
}

function NumberKnobControl({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const commit = (raw: string): void => {
    const next = Number(raw);
    if (Number.isFinite(next)) onChange(clampNumber(next, min, max));
  };

  return (
    <div className="grid grid-cols-[1fr_88px] items-center gap-3">
      <RangeSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => commit(event.target.value)}
      />
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => commit(event.target.value)}
        className="h-9 px-2 py-1 text-[12px]"
      />
    </div>
  );
}

function normalizeExtrasForKnobs(
  current: Record<string, ExtraValue>,
  knobs: Record<string, SpeechKnob>,
  model: SpeechModelDef | null,
): Record<string, ExtraValue> {
  const next: Record<string, ExtraValue> = {};
  for (const [key, knob] of Object.entries(knobs)) {
    const value = current[key];
    if (knob.type === "enum") {
      const values = knob.values ?? [];
      if (values.length === 0) continue;
      const fallback = readStringDefault(model, key, values[0] ?? null);
      next[key] =
        typeof value === "string" && values.includes(value)
          ? value
          : fallback && values.includes(fallback)
            ? fallback
            : (values[0] ?? "");
    } else {
      const min = knob.min ?? 0;
      const max = knob.max ?? 1;
      const fallback = readNumberDefault(model, key, min);
      next[key] = clampNumber(typeof value === "number" ? value : fallback, min, max);
    }
  }
  return next;
}

function readStringDefault(
  model: SpeechModelDef | null,
  key: string,
  fallback: string | null,
): string | null {
  const value = model?.defaults?.[key];
  return typeof value === "string" ? value : fallback;
}

function readNumberDefault(model: SpeechModelDef | null, key: string, fallback: number): number {
  const value = model?.defaults?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function extrasEqual(a: Record<string, ExtraValue>, b: Record<string, ExtraValue>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

function formatKnobLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

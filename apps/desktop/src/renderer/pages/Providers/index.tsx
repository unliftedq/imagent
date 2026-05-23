import { IpcClientError, type ModelCatalogPayload } from "@imagent/ipc";
import { Button, Icons, type ProviderTestStatus } from "@imagent/ui";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useConfigStore } from "../../state/useConfigStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { useSettingsSubpage } from "../Settings/index.js";
import {
  ProviderConfigPanel,
  providerConfigPanelTitle,
  ProviderIcon,
  ProviderListRow,
} from "./components.js";
import {
  type ActiveModal,
  BUILT_IN_IDS,
  BUILT_IN_PROVIDERS,
  buildSecretsPatch,
  emptyModalState,
  formFromCustom,
  formFromProvider,
  imageModelsForSelect,
  type ModalState,
  maskForModal,
  prefsWithMappings,
  providerDescription,
  providerDisplayName,
  validateModal,
} from "./definitions.js";

/**
 * Providers settings section. Rendered inside the Settings dialog;
 * `SettingsDialog` provides the section heading + scroll container, so this
 * component only emits the configurable rows. When the user clicks
 * "Connect" or "Update" on a row, we switch to an inline subpage
 * (`ProviderConfigPanel`) rather than stacking a second modal on top of
 * the Settings dialog — the Settings dialog's title bar swaps to a back
 * affordance via `useSettingsSubpage` for the duration of the subpage.
 */
export function ProvidersSection() {
  const {
    providerPrefs,
    summaries,
    secrets,
    testResults,
    testing,
    refresh,
    saveProviderPrefs,
    saveSecrets,
    testProvider,
  } = useConfigStore();
  const pushToast = useUIStore((s) => s.pushToast);
  const t = useT();
  const { setSubpage } = useSettingsSubpage();

  const [catalog, setCatalog] = useState<ModelCatalogPayload | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [form, setForm] = useState<ModalState>(() => emptyModalState());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
    void api["catalog.get"]().then(setCatalog);
  }, [refresh]);

  // Clear any registered subpage on unmount so navigating away via the
  // settings rail can't leave a stale header behind.
  useEffect(() => {
    return () => {
      setSubpage(null);
    };
  }, [setSubpage]);

  const summariesById = useMemo(() => new Map(summaries.map((s) => [s.id, s])), [summaries]);
  const imageModelOptions = useMemo(() => imageModelsForSelect(catalog), [catalog]);
  const customProviderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of Object.keys(providerPrefs?.customOpenAI ?? {})) ids.add(id);
    for (const id of Object.keys(catalog?.providers ?? {})) {
      if (!BUILT_IN_IDS.has(id)) ids.add(id);
    }
    for (const id of Object.keys(secrets.customOpenAI ?? {})) ids.add(id);
    return [...ids].sort();
  }, [providerPrefs?.customOpenAI, catalog, secrets.customOpenAI]);

  // Driven synchronously alongside `activeModal` so the SettingsDialog
  // wrapper switches to subpage layout in the same render as the panel
  // appears — avoids a one-frame jank where the panel briefly inherits
  // the list-mode padding/scroll.
  function closePanel() {
    setActiveModal(null);
    setForm(emptyModalState());
    setSubpage(null);
  }

  function openBuiltIn(id: string) {
    const next: ActiveModal = { kind: "built-in", id };
    setForm(formFromProvider(id, providerDisplayName(id, t), catalog, providerPrefs, secrets));
    setActiveModal(next);
    setSubpage({
      title: providerConfigPanelTitle(next, t),
      onBack: closePanel,
    });
  }

  function openCustom(id: string | null) {
    const next: ActiveModal = { kind: "custom", id };
    setForm(formFromCustom(id, catalog, providerPrefs, secrets));
    setActiveModal(next);
    setSubpage({
      title: providerConfigPanelTitle(next, t),
      onBack: closePanel,
    });
  }

  async function saveActiveModal() {
    if (!activeModal || !catalog || !providerPrefs) return;
    const validation = validateModal(activeModal, form, secrets, t);
    if (validation) {
      pushToast({
        title: t("providers.toast.needsAttention"),
        description: validation,
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const secretsPatch = buildSecretsPatch(activeModal, form);
      if (Object.keys(secretsPatch).length > 0) {
        await saveSecrets(secretsPatch);
      }

      // Routing now lives entirely in providers.config — endpoint, baseUrl,
      // and (for Azure / custom) deployment mappings. Always save prefs so a
      // BytePlus / 火山引擎 endpoint edit or a custom-provider baseUrl change
      // isn't dropped.
      const nextPrefs = prefsWithMappings(providerPrefs, activeModal, form);
      await saveProviderPrefs(nextPrefs);

      pushToast({
        title:
          activeModal.kind === "custom"
            ? t("providers.toast.customSaved")
            : t("providers.toast.saved"),
        description: form.displayName || form.providerId,
        variant: "success",
      });
      closePanel();
    } catch (err) {
      const msg =
        err instanceof IpcClientError ? err.message : ((err as Error)?.message ?? String(err));
      pushToast({ title: t("providers.toast.saveFailed"), description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  function statusFor(id: string): ProviderTestStatus {
    if (testing[id]) return { kind: "testing" };
    const last = testResults[id]?.result;
    if (!last) return { kind: "idle" };
    if (last.ok) {
      return {
        kind: "ok",
        latencyMs: last.latencyMs,
        ...(last.sampleModelId ? { sampleModelId: last.sampleModelId } : {}),
      };
    }
    return {
      kind: "error",
      reason: last.reason,
      ...(last.status !== undefined ? { status: last.status } : {}),
    };
  }

  // Subpage mode — show the config panel in place of the list. The
  // SettingsDialog title bar handles back navigation via the subpage
  // registered above.
  if (activeModal) {
    return (
      <ProviderConfigPanel
        activeModal={activeModal}
        form={form}
        setForm={setForm}
        catalogReady={catalog !== null}
        imageModelOptions={imageModelOptions}
        saving={saving}
        maskedApiKey={maskForModal(activeModal, form.providerId, secrets)}
        onCancel={closePanel}
        onSave={() => void saveActiveModal()}
      />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-(--radius-lg) border border-(--border) bg-(--bg)">
      {BUILT_IN_PROVIDERS.map((provider) => (
        <ProviderListRow
          key={provider.id}
          iconSrc={provider.iconSrc}
          iconAlt={provider.iconAlt}
          name={summariesById.get(provider.id)?.displayName ?? providerDisplayName(provider.id, t)}
          description={providerDescription(provider.id, t)}
          summary={summariesById.get(provider.id)}
          status={statusFor(provider.id)}
          onConfigure={() => openBuiltIn(provider.id)}
          onTest={() => void testProvider(provider.id)}
        />
      ))}

      {customProviderIds.map((id) => (
        <ProviderListRow
          key={id}
          fallbackIcon={Icons.Plug}
          name={catalog?.providers[id]?.displayName ?? summariesById.get(id)?.displayName ?? id}
          description={t("providers.customDescription")}
          summary={summariesById.get(id)}
          status={statusFor(id)}
          onConfigure={() => openCustom(id)}
          onTest={() => void testProvider(id)}
        />
      ))}

      <div className="flex items-center gap-4 border-t border-(--border-faint) px-5 py-4 text-left transition-colors duration-(--duration-fast) hover:bg-(--surface)">
        <ProviderIcon fallbackIcon={Icons.Plus} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-(length:--text-title-sm) font-semibold text-(--text)">
            {t("providers.openaiCompatible")}
          </span>
          <span className="text-(length:--text-body-sm) text-(--text-muted)">
            {t("providers.openaiCompatible.description")}
          </span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          leadingIcon={<Icons.Plus weight="bold" className="size-4" />}
          onClick={() => openCustom(null)}
        >
          {t("common.add")}
        </Button>
      </div>
    </div>
  );
}


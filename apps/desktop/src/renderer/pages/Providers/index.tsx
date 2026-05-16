import { IpcClientError, type ModelCatalogPayload } from "@imagent/ipc";
import { Button, Icons, type ProviderTestStatus } from "@imagent/ui";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useConfigStore } from "../../state/useConfigStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { ProviderConfigModal, ProviderIcon, ProviderListRow } from "./components.js";
import {
  BUILT_IN_IDS,
  BUILT_IN_PROVIDERS,
  buildSecretsPatch,
  emptyModalState,
  formFromCustom,
  formFromProvider,
  imageModelsForSelect,
  maskForModal,
  prefsWithMappings,
  providerDescription,
  providerDisplayName,
  validateModal,
  type ActiveModal,
  type ModalState,
} from "./definitions.js";

export function ProvidersPage() {
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

  const [catalog, setCatalog] = useState<ModelCatalogPayload | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [form, setForm] = useState<ModalState>(() => emptyModalState());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
    void api["catalog.get"]().then(setCatalog);
  }, [refresh]);

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

  function openBuiltIn(id: string) {
    setForm(formFromProvider(id, providerDisplayName(id, t), catalog, providerPrefs, secrets));
    setActiveModal({ kind: "built-in", id });
  }

  function openCustom(id: string | null) {
    setForm(formFromCustom(id, catalog, providerPrefs, secrets));
    setActiveModal({ kind: "custom", id });
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
      // ByteDance endpoint edit or a custom-provider baseUrl change isn't
      // dropped.
      const nextPrefs = prefsWithMappings(providerPrefs, activeModal, form);
      await saveProviderPrefs(nextPrefs);

      pushToast({
        title: activeModal.kind === "custom" ? t("providers.toast.customSaved") : t("providers.toast.saved"),
        description: form.displayName || form.providerId,
        variant: "success",
      });
      setActiveModal(null);
      setForm(emptyModalState());
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

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-(length:--text-display-sm) font-display font-medium tracking-(--text-display-sm--letter-spacing) text-(--text)">
          {t("providers.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-(length:--text-body-md) text-(--text-muted)">
          {t("providers.subtitle")}
        </p>
      </header>

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

      <ProviderConfigModal
        activeModal={activeModal}
        form={form}
        setForm={setForm}
        catalogReady={catalog !== null}
        imageModelOptions={imageModelOptions}
        saving={saving}
        maskedApiKey={activeModal ? maskForModal(activeModal, form.providerId, secrets) : null}
        onClose={() => setActiveModal(null)}
        onSave={() => void saveActiveModal()}
      />
    </div>
  );
}

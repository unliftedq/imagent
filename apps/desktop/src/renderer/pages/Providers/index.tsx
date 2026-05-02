import { IpcClientError, type ModelCatalogPayload } from "@imagine/ipc";
import { Button, Icons, type ProviderTestStatus } from "@imagine/ui";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import { useConfigStore } from "../../state/useConfigStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { ProviderConfigModal, ProviderIcon, ProviderListRow } from "./components.js";
import {
  BUILT_IN_IDS,
  BUILT_IN_PROVIDERS,
  buildSecretsPatch,
  catalogWithMappings,
  emptyModalState,
  formFromCustom,
  formFromProvider,
  imageModelsForSelect,
  maskForModal,
  validateModal,
  type ActiveModal,
  type ModalState,
} from "./definitions.js";

export function ProvidersPage() {
  const { summaries, secrets, testResults, testing, refresh, saveSecrets, testProvider } =
    useConfigStore();
  const pushToast = useUIStore((s) => s.pushToast);

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
    for (const id of Object.keys(catalog?.providers ?? {})) {
      if (!BUILT_IN_IDS.has(id)) ids.add(id);
    }
    for (const id of Object.keys(secrets.customOpenAI ?? {})) ids.add(id);
    return [...ids].sort();
  }, [catalog, secrets.customOpenAI]);

  function openBuiltIn(id: string) {
    const provider = BUILT_IN_PROVIDERS.find((p) => p.id === id);
    setForm(formFromProvider(id, provider?.name ?? id, catalog, secrets));
    setActiveModal({ kind: "built-in", id });
  }

  function openCustom(id: string | null) {
    setForm(formFromCustom(id, catalog, secrets));
    setActiveModal({ kind: "custom", id });
  }

  async function saveActiveModal() {
    if (!activeModal || !catalog) return;
    const validation = validateModal(activeModal, form, secrets);
    if (validation) {
      pushToast({
        title: "Provider config needs attention",
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

      if (activeModal.id === "azure-openai" || activeModal.kind === "custom") {
        const nextCatalog = catalogWithMappings(catalog, activeModal, form);
        const saved = await api["catalog.set"](nextCatalog);
        setCatalog(saved);
        await refresh();
      }

      pushToast({
        title: activeModal.kind === "custom" ? "Custom provider saved" : "Provider saved",
        description: form.displayName || form.providerId,
        variant: "success",
      });
      setActiveModal(null);
      setForm(emptyModalState());
    } catch (err) {
      const msg =
        err instanceof IpcClientError ? err.message : ((err as Error)?.message ?? String(err));
      pushToast({ title: "Failed to save provider", description: msg, variant: "error" });
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
          Providers
        </h1>
        <p className="mt-2 max-w-2xl text-(length:--text-body-md) text-(--text-muted)">
          Connect generation providers, then map provider-facing model ids or deployments to the
          canonical catalog models they implement.
        </p>
      </header>

      <div className="flex flex-col overflow-hidden rounded-(--radius-lg) border border-(--border) bg-(--bg)">
        {BUILT_IN_PROVIDERS.map((provider) => (
          <ProviderListRow
            key={provider.id}
            icon={provider.icon}
            iconClassName={provider.iconClassName}
            name={summariesById.get(provider.id)?.displayName ?? provider.name}
            description={provider.description}
            summary={summariesById.get(provider.id)}
            status={statusFor(provider.id)}
            onConfigure={() => openBuiltIn(provider.id)}
            onTest={() => void testProvider(provider.id)}
          />
        ))}

        {customProviderIds.map((id) => (
          <ProviderListRow
            key={id}
            icon={Icons.Plug}
            name={catalog?.providers[id]?.displayName ?? summariesById.get(id)?.displayName ?? id}
            description="OpenAI Images API-compatible custom endpoint."
            summary={summariesById.get(id)}
            status={statusFor(id)}
            onConfigure={() => openCustom(id)}
            onTest={() => void testProvider(id)}
          />
        ))}

        <div className="flex items-center gap-4 border-t border-(--border-faint) px-5 py-4 text-left transition-colors duration-(--duration-fast) hover:bg-(--surface)">
          <ProviderIcon icon={Icons.Plus} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-(length:--text-title-sm) font-semibold text-(--text)">
              OpenAI compatible
            </span>
            <span className="text-(length:--text-body-sm) text-(--text-muted)">
              Add a custom provider with its own base URL and model mappings.
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leadingIcon={<Icons.Plus weight="bold" className="size-4" />}
            onClick={() => openCustom(null)}
          >
            Add
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

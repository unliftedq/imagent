import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Icons,
  Input,
  Panel,
  PanelBody,
  PanelHeader,
  ProviderRow,
  type ProviderTestStatus,
} from "@imagine-studio/ui";
import type { ProviderId, ProviderPreferencesPayload, SecretsWrite } from "@imagine-studio/ipc";
import { useConfigStore } from "../state/useConfigStore.js";

interface RowState {
  apiKey: string;
  // Azure-only
  endpoint: string;
  apiVersion: string;
  // Volcengine-only
  region: string;
  // Per-provider config blocks (string-edit form):
  baseUrl: string;
  models: string; // comma-separated
  defaultModel: string;
  azureImageDeployment: string;
  azureVideoDeployment: string;
}

function emptyRowState(): RowState {
  return {
    apiKey: "",
    endpoint: "",
    apiVersion: "2024-10-21",
    region: "cn-beijing",
    baseUrl: "",
    models: "",
    defaultModel: "",
    azureImageDeployment: "",
    azureVideoDeployment: "",
  };
}

/**
 * Initial form values come from the loaded prefs/secrets snapshot — note we
 * never see the plaintext key (`apiKey` is masked from the server side), so
 * the input is a *write-through* field: empty means "leave alone", any text
 * means "replace".
 */
function rowStateFromConfig(
  id: ProviderId,
  prefs: ProviderPreferencesPayload | null,
): RowState {
  const r = emptyRowState();
  if (!prefs) return r;
  switch (id) {
    case "openai":
      r.baseUrl = prefs.openai.baseUrl ?? "";
      r.models = prefs.openai.models.join(", ");
      r.defaultModel = prefs.openai.defaultModel;
      break;
    case "azure-openai":
      r.azureImageDeployment = prefs["azure-openai"].deployments.image;
      r.azureVideoDeployment = prefs["azure-openai"].deployments.video ?? "";
      break;
    case "google":
      r.models = prefs.google.models.join(", ");
      r.defaultModel = prefs.google.defaultModel;
      break;
    case "flux-bfl":
      r.baseUrl = prefs["flux-bfl"].baseUrl;
      r.models = prefs["flux-bfl"].models.join(", ");
      r.defaultModel = prefs["flux-bfl"].defaultModel;
      break;
    case "seedream":
      r.baseUrl = prefs.seedream.baseUrl;
      r.models = prefs.seedream.models.join(", ");
      r.defaultModel = prefs.seedream.defaultModel;
      break;
    case "seedance":
      r.baseUrl = prefs.seedance.baseUrl;
      r.models = prefs.seedance.models.join(", ");
      r.defaultModel = prefs.seedance.defaultModel;
      break;
  }
  return r;
}

export function ProvidersPage() {
  const {
    summaries,
    providerPrefs,
    secrets,
    testResults,
    testing,
    refresh,
    saveProviderPrefs,
    saveSecrets,
    testProvider,
  } = useConfigStore();

  const [rows, setRows] = useState<Record<ProviderId, RowState>>(() => ({
    openai: emptyRowState(),
    "azure-openai": emptyRowState(),
    google: emptyRowState(),
    "flux-bfl": emptyRowState(),
    seedream: emptyRowState(),
    seedance: emptyRowState(),
  }));

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Reset form rows when prefs change (e.g. after refresh).
  useEffect(() => {
    if (!providerPrefs) return;
    setRows({
      openai: rowStateFromConfig("openai", providerPrefs),
      "azure-openai": rowStateFromConfig("azure-openai", providerPrefs),
      google: rowStateFromConfig("google", providerPrefs),
      "flux-bfl": rowStateFromConfig("flux-bfl", providerPrefs),
      seedream: rowStateFromConfig("seedream", providerPrefs),
      seedance: rowStateFromConfig("seedance", providerPrefs),
    });
  }, [providerPrefs]);

  const order: ProviderId[] = useMemo(
    () => ["openai", "azure-openai", "google", "flux-bfl", "seedream", "seedance"],
    [],
  );

  function statusFor(id: ProviderId): ProviderTestStatus {
    if (testing[id]) return { kind: "testing" };
    const last = testResults[id]?.result;
    if (!last) return { kind: "idle" };
    if (last.ok) {
      const out: ProviderTestStatus = {
        kind: "ok",
        latencyMs: last.latencyMs,
      };
      if (last.sampleModelId) out.sampleModelId = last.sampleModelId;
      return out;
    }
    const out: ProviderTestStatus = { kind: "error", reason: last.reason };
    if (last.status !== undefined) out.status = last.status;
    return out;
  }

  async function saveRow(id: ProviderId) {
    if (!providerPrefs) return;
    const r = rows[id];

    // Build the prefs payload — start from a fresh copy of the snapshot.
    const nextPrefs: ProviderPreferencesPayload = JSON.parse(
      JSON.stringify(providerPrefs),
    ) as ProviderPreferencesPayload;
    const modelList = r.models
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    switch (id) {
      case "openai":
        nextPrefs.openai = {
          baseUrl: r.baseUrl ? r.baseUrl : null,
          models: modelList,
          defaultModel: r.defaultModel || modelList[0] || nextPrefs.openai.defaultModel,
        };
        break;
      case "azure-openai":
        nextPrefs["azure-openai"] = {
          deployments: {
            image: r.azureImageDeployment,
            video: r.azureVideoDeployment || null,
          },
          defaultDeployment: nextPrefs["azure-openai"].defaultDeployment,
        };
        break;
      case "google":
        nextPrefs.google = {
          models: modelList,
          defaultModel: r.defaultModel || modelList[0] || nextPrefs.google.defaultModel,
        };
        break;
      case "flux-bfl":
        nextPrefs["flux-bfl"] = {
          baseUrl: r.baseUrl || nextPrefs["flux-bfl"].baseUrl,
          models: modelList,
          defaultModel: r.defaultModel || modelList[0] || nextPrefs["flux-bfl"].defaultModel,
        };
        break;
      case "seedream":
        nextPrefs.seedream = {
          baseUrl: r.baseUrl || nextPrefs.seedream.baseUrl,
          models: modelList,
          defaultModel: r.defaultModel || modelList[0] || nextPrefs.seedream.defaultModel,
        };
        break;
      case "seedance":
        nextPrefs.seedance = {
          baseUrl: r.baseUrl || nextPrefs.seedance.baseUrl,
          models: modelList,
          defaultModel: r.defaultModel || modelList[0] || nextPrefs.seedance.defaultModel,
        };
        break;
    }

    // Secrets patch — only fields the user actually populated this session.
    const secretsPatch: SecretsWrite = {};
    if (id === "openai" && r.apiKey) secretsPatch.openai = { apiKey: r.apiKey };
    if (id === "azure-openai") {
      const block: NonNullable<SecretsWrite["azure-openai"]> = {};
      if (r.apiKey) block.apiKey = r.apiKey;
      if (r.endpoint) block.endpoint = r.endpoint;
      if (r.apiVersion) block.apiVersion = r.apiVersion;
      if (Object.keys(block).length > 0) secretsPatch["azure-openai"] = block;
    }
    if (id === "google" && r.apiKey) secretsPatch.google = { apiKey: r.apiKey };
    if (id === "flux-bfl" && r.apiKey) secretsPatch["flux-bfl"] = { apiKey: r.apiKey };
    if (id === "seedream" || id === "seedance") {
      const block: NonNullable<SecretsWrite["volcengine"]> = {};
      if (r.apiKey) block.apiKey = r.apiKey;
      if (r.region) block.region = r.region;
      if (Object.keys(block).length > 0) secretsPatch.volcengine = block;
    }

    await saveProviderPrefs(nextPrefs);
    if (Object.keys(secretsPatch).length > 0) {
      await saveSecrets(secretsPatch);
      // Clear the local apiKey input so it shows the masked value next time.
      setRows((s) => ({ ...s, [id]: { ...s[id], apiKey: "" } }));
    }
  }

  function update<K extends keyof RowState>(id: ProviderId, field: K, value: RowState[K]) {
    setRows((s) => ({ ...s, [id]: { ...s[id], [field]: value } }));
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-(length:--text-display-sm) font-display font-medium tracking-(--text-display-sm--letter-spacing) text-(--color-ink)">
          Providers
        </h1>
        <p className="mt-2 text-(length:--text-body-md) text-(--color-body)">
          Configure API access for image and video generation.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {order.map((id) => {
          const summary = summaries.find((s) => s.id === id);
          const r = rows[id];
          const status = statusFor(id);
          const sharedNote =
            id === "seedream"
              ? "This key is shared with Seedance."
              : id === "seedance"
              ? "This key is shared with Seedream."
              : undefined;
          const maskedKey = secretMaskFor(id, secrets);
          return (
            <ProviderRow
              key={id}
              name={summary?.displayName ?? id}
              configured={summary?.configured ?? false}
              status={status}
              onTest={() => void testProvider(id)}
              onSave={() => void saveRow(id)}
              badge={sharedNote ? <SharedBadge text={sharedNote} /> : null}
              defaultOpen={!summary?.configured}
            >
              <div className="flex flex-col gap-4">
                {id !== "azure-openai" ? (
                  <SecretField
                    label={
                      id === "seedream" || id === "seedance"
                        ? "Volcengine API key"
                        : "API key"
                    }
                    placeholder={maskedKey ?? "paste your key here"}
                    value={r.apiKey}
                    onChange={(v) => update(id, "apiKey", v)}
                    helperText={
                      maskedKey
                        ? `Stored: ${maskedKey} — leave empty to keep it.`
                        : "Required for Test + Save to work."
                    }
                  />
                ) : null}

                {id === "azure-openai" ? (
                  <>
                    <Field label="Endpoint">
                      <Input
                        placeholder="https://my-resource.openai.azure.com"
                        value={r.endpoint}
                        onChange={(e) => update(id, "endpoint", e.target.value)}
                      />
                    </Field>
                    <SecretField
                      label="API key"
                      placeholder={maskedKey ?? "paste your key here"}
                      value={r.apiKey}
                      onChange={(v) => update(id, "apiKey", v)}
                      helperText={
                        maskedKey
                          ? `Stored: ${maskedKey} — leave empty to keep it.`
                          : "Required for Test + Save to work."
                      }
                    />
                    <Field label="API version">
                      <Input
                        value={r.apiVersion}
                        onChange={(e) => update(id, "apiVersion", e.target.value)}
                      />
                    </Field>
                    <Field label="Image deployment">
                      <Input
                        value={r.azureImageDeployment}
                        onChange={(e) =>
                          update(id, "azureImageDeployment", e.target.value)
                        }
                        placeholder="my-deployment"
                      />
                    </Field>
                    <Field label="Video deployment (optional)">
                      <Input
                        value={r.azureVideoDeployment}
                        onChange={(e) =>
                          update(id, "azureVideoDeployment", e.target.value)
                        }
                      />
                    </Field>
                  </>
                ) : null}

                {(id === "openai" || id === "flux-bfl" || id === "seedream" || id === "seedance") ? (
                  <Field
                    label="Base URL"
                    helperText={
                      id === "openai"
                        ? "Optional — leave empty for OpenAI's default."
                        : "Override the vendor's default endpoint if needed."
                    }
                  >
                    <Input
                      value={r.baseUrl}
                      onChange={(e) => update(id, "baseUrl", e.target.value)}
                      placeholder={
                        id === "flux-bfl"
                          ? "https://api.bfl.ai"
                          : id === "openai"
                          ? "https://api.openai.com/v1"
                          : "https://ark.cn-beijing.volces.com/api/v3"
                      }
                    />
                  </Field>
                ) : null}

                {(id === "seedream" || id === "seedance") ? (
                  <Field label="Region">
                    <Input
                      value={r.region}
                      onChange={(e) => update(id, "region", e.target.value)}
                    />
                  </Field>
                ) : null}

                {id !== "azure-openai" ? (
                  <>
                    <Field label="Models" helperText="Comma-separated list. The first one is used as the default if none is set below.">
                      <Input
                        value={r.models}
                        onChange={(e) => update(id, "models", e.target.value)}
                        placeholder={modelPlaceholder(id)}
                      />
                    </Field>
                    <Field label="Default model">
                      <Input
                        value={r.defaultModel}
                        onChange={(e) => update(id, "defaultModel", e.target.value)}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
            </ProviderRow>
          );
        })}
      </div>
    </div>
  );
}

function modelPlaceholder(id: ProviderId): string {
  switch (id) {
    case "openai":
      return "gpt-image-1, dall-e-3";
    case "google":
      return "imagen-3";
    case "flux-bfl":
      return "flux-pro-1.1, flux-dev";
    case "seedream":
      return "seedream-3.0";
    case "seedance":
      return "seedance-1.0-pro";
    default:
      return "";
  }
}

function secretMaskFor(id: ProviderId, masked: ReturnType<typeof useConfigStore.getState>["secrets"]) {
  switch (id) {
    case "openai":
      return masked.openai?.apiKey ?? null;
    case "azure-openai":
      return masked["azure-openai"]?.apiKey ?? null;
    case "google":
      return masked.google?.apiKey ?? null;
    case "flux-bfl":
      return masked["flux-bfl"]?.apiKey ?? null;
    case "seedream":
    case "seedance":
      return masked.volcengine?.apiKey ?? null;
    default:
      return null;
  }
}

function SharedBadge({ text }: { text: string }) {
  return (
    <span className="rounded-(--radius-pill) bg-(--color-brand-lavender)/30 px-2 py-0.5 text-(length:--text-caption) text-(--color-ink)">
      {text}
    </span>
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
    <label className="flex flex-col gap-1.5">
      <span className="text-(length:--text-caption-uppercase) tracking-[1.5px] text-(--color-muted)">
        {label}
      </span>
      {children}
      {helperText ? (
        <span className="text-(length:--text-caption) text-(--color-muted)">{helperText}</span>
      ) : null}
    </label>
  );
}

function SecretField({
  label,
  placeholder,
  value,
  onChange,
  helperText,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  helperText?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} helperText={helperText}>
      <div className="relative flex items-center">
        <Input
          type={show ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="pr-12"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={show ? "Hide key" : "Show key"}
          className="absolute right-1.5 size-8 p-0"
          onClick={() => setShow((v) => !v)}
        >
          {show ? <Icons.EyeSlash weight="bold" className="size-4" /> : <Icons.Eye weight="bold" className="size-4" />}
        </Button>
      </div>
    </Field>
  );
}

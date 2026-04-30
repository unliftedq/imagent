import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Icons,
  Input,
  ProviderRow,
  type ProviderTestStatus,
} from "@imagine/ui";
import {
  IpcClientError,
  type ProviderId,
  type ProviderPreferencesPayload,
  type SecretsWrite,
} from "@imagine/ipc";
import { useConfigStore } from "../state/useConfigStore.js";
import { useUIStore } from "../state/useUIStore.js";

interface RowState {
  apiKey: string;
  // Shared `endpoint` field — used by Azure and ByteDance (both require an
  // endpoint URL alongside the apiKey).
  endpoint: string;
  apiVersion: string;
  // Azure deployments
  imageDeployment: string;
  videoDeployment: string;
}

function emptyRowState(): RowState {
  return {
    apiKey: "",
    endpoint: "",
    apiVersion: "2024-10-21",
    imageDeployment: "",
    videoDeployment: "",
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
    case "azure-openai":
      r.imageDeployment = prefs["azure-openai"].deployments.image;
      r.videoDeployment = prefs["azure-openai"].deployments.video ?? "";
      break;
    default:
      // OpenAI / Google / Flux / ByteDance / xAI carry no per-provider
      // prefs — the catalog is the source of truth and base URLs are
      // hardcoded canonical values (with a power-user override available
      // via secrets.json).
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

  const pushToast = useUIStore((s) => s.pushToast);

  const [rows, setRows] = useState<Record<ProviderId, RowState>>(() => {
    return {
      openai: emptyRowState(),
      "azure-openai": emptyRowState(),
      google: emptyRowState(),
      "flux-bfl": emptyRowState(),
      bytedance: emptyRowState(),
      xai: emptyRowState(),
    };
  });

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
      bytedance: rowStateFromConfig("bytedance", providerPrefs),
      xai: rowStateFromConfig("xai", providerPrefs),
    });
  }, [providerPrefs]);

  const order: ProviderId[] = useMemo(
    () => ["openai", "azure-openai", "google", "flux-bfl", "bytedance", "xai"],
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
    switch (id) {
      case "azure-openai":
        nextPrefs["azure-openai"] = {
          deployments: {
            image: r.imageDeployment,
            video: r.videoDeployment || null,
          },
          defaultDeployment: nextPrefs["azure-openai"].defaultDeployment,
        };
        break;
      default:
        // No prefs to write for well-known providers — auth is the only thing
        // we persist.
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
    if (id === "bytedance") {
      const block: NonNullable<SecretsWrite["bytedance"]> = {};
      if (r.apiKey) block.apiKey = r.apiKey;
      if (r.endpoint) block.endpoint = r.endpoint;
      if (Object.keys(block).length > 0) secretsPatch.bytedance = block;
    }
    if (id === "xai" && r.apiKey) secretsPatch.xai = { apiKey: r.apiKey };

    try {
      await saveProviderPrefs(nextPrefs);
      if (Object.keys(secretsPatch).length > 0) {
        await saveSecrets(secretsPatch);
        // Clear the local apiKey input so it shows the masked value next time.
        setRows((s) => ({ ...s, [id]: { ...s[id], apiKey: "" } }));
      }
      pushToast({
        title: "Saved provider settings",
        description: summaries.find((s) => s.id === id)?.displayName ?? id,
        variant: "success",
      });
    } catch (err) {
      const msg =
        err instanceof IpcClientError
          ? err.message
          : (err as Error)?.message ?? String(err);
      pushToast({
        title: "Failed to save provider settings",
        description: msg,
        variant: "error",
      });
    }
  }

  function update<K extends keyof RowState>(id: ProviderId, field: K, value: RowState[K]) {
    setRows((s) => ({ ...s, [id]: { ...s[id], [field]: value } }));
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-(length:--text-display-sm) font-display font-medium tracking-(--text-display-sm--letter-spacing) text-(--text)">
          Providers
        </h1>
        <p className="mt-2 text-(length:--text-body-md) text-(--text)">
          Configure API access for image and video generation. Models come from
          the built-in catalog — only authentication is needed.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {order.map((id) => {
          const summary = summaries.find((s) => s.id === id);
          const r = rows[id];
          const status = statusFor(id);
          const maskedKey = secretMaskFor(id, secrets);
          // Drive the badge off the IPC `summary.kinds` so any provider that
          // spans both image and video (Google AI Studio, ByteDance, xAI) gets
          // it without a per-id hardcoded check.
          const kindsBadge =
            summary && summary.kinds.length > 1 ? (
              <KindsBadge text="Image + Video" />
            ) : null;
          const catalogModelIds = summary?.modelIds ?? [];
          return (
            <ProviderRow
              key={id}
              name={summary?.displayName ?? id}
              configured={summary?.configured ?? false}
              status={status}
              onTest={() => void testProvider(id)}
              onSave={() => void saveRow(id)}
              badge={kindsBadge}
              defaultOpen={!summary?.configured}
            >
              <div className="flex flex-col gap-4">
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
                    <Field
                      label="Image deployment"
                      helperText="Deployment name from the Azure portal."
                    >
                      <Input
                        value={r.imageDeployment}
                        onChange={(e) =>
                          update(id, "imageDeployment", e.target.value)
                        }
                        placeholder="my-image-deployment"
                      />
                    </Field>
                    <Field label="Video deployment (optional)">
                      <Input
                        value={r.videoDeployment}
                        onChange={(e) =>
                          update(id, "videoDeployment", e.target.value)
                        }
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    {id === "bytedance" ? (
                      <Field
                        label="Endpoint"
                        helperText="Ark base URL. Regional info is encoded here."
                      >
                        <Input
                          placeholder="https://ark.cn-beijing.volces.com/api/v3"
                          value={r.endpoint}
                          onChange={(e) => update(id, "endpoint", e.target.value)}
                        />
                      </Field>
                    ) : null}
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
                    {catalogModelIds.length > 0 ? (
                      <p className="text-(length:--text-caption) text-(--text-muted)">
                        Models from catalog: {catalogModelIds.join(", ")}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </ProviderRow>
          );
        })}
      </div>
    </div>
  );
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
    case "bytedance":
      return masked.bytedance?.apiKey ?? null;
    case "xai":
      return masked.xai?.apiKey ?? null;
    default:
      return null;
  }
}

function KindsBadge({ text }: { text: string }) {
  return (
    <span className="rounded-(--radius-pill) bg-(--accent-soft)/30 px-2 py-0.5 text-(length:--text-caption) text-(--text)">
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
      <span className="text-(length:--text-caption-uppercase) tracking-[1.5px] text-(--text-muted)">
        {label}
      </span>
      {children}
      {helperText ? (
        <span className="text-(length:--text-caption) text-(--text-muted)">{helperText}</span>
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

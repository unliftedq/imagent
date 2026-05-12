---
description: Connect OpenAI, Azure OpenAI, Google, Flux, ByteDance, and xAI models.
---

# Providers

imagent supports six built-in provider IDs:

| Provider ID | Display name | Images | Videos | Required secret fields |
| --- | --- | --- | --- | --- |
| `openai` | OpenAI | Yes | No | `apiKey` |
| `azure` | Azure Foundry | Yes | No | `endpoint`, `apiKey` |
| `google` | Google AI Studio | Yes | Yes | `apiKey` |
| `flux-bfl` | Black Forest Labs | Yes | No | `apiKey` |
| `bytedance` | ByteDance / BytePlus ModelArk | Yes | Yes | `endpoint`, `apiKey` |
| `xai` | xAI | Yes | Yes | `apiKey` |

Providers without configured secrets are skipped at runtime. `imagent doctor` reports how many built-in providers are configured.

### Configuration methods

You can configure providers in three ways:

1. Desktop app: open **Providers**, choose a provider, enter its key and endpoint if required, optionally test it, and save.
2. CLI: use `imagent config set <provider>.<field> <value>`.
3. Environment variables: set credentials or routing for a single CLI process. Environment values override the local workspace files for that run.

API keys are stored in the local workspace `secrets.json` file. Non-sensitive endpoints, base URLs, and per-user model mappings are stored in `config.json` under `providers.<id>`. On POSIX systems, imagent attempts to write `secrets.json` with `0600` permissions.

### OpenAI (`openai`)

Use OpenAI image models from the model catalog.

CLI setup:

```bash
imagent config set openai.apiKey sk-...
```

Environment variable:

```bash
OPENAI_API_KEY=sk-... imagent image generate "prompt" --provider openai
```

Optional advanced secret field:

```bash
imagent config set openai.baseUrl https://your-openai-compatible-proxy/v1
```

Use `baseUrl` only when pointing OpenAI traffic at a compatible proxy or alternate endpoint.

Example:

```bash
imagent image generate "clean product render on white background" \
  --provider openai \
  --model gpt-image-2 \
  --option size=1024x1024
```

### Azure (`azure`)

The `azure` provider id covers every image model family hosted by an Azure AI Foundry resource. One endpoint + one key serves multiple families:

- **Azure OpenAI image models** — `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini`. Routed via `/openai/v1/images/generations` on the `*.services.ai.azure.com` host.
- **Microsoft MAI-Image models** — `MAI-Image-2`, `MAI-Image-2e`. Routed via `/mai/v1/images/generations` with raw `width`/`height`. PNG-only output, no reference images.
- **Black Forest Labs FLUX models** — `flux-2-pro`, `flux-2-flex`, `flux-kontext-pro`, `flux-pro-1.1`. Routed via the BFL provider-specific Foundry API at `/providers/blackforestlabs/v1/<path>?api-version=preview` on the same host.

The provider dispatches automatically by looking up each deployment's canonical `modelId`, so the only thing you do per family is map your deployment names — there's nothing else to configure.

CLI setup:

```bash
imagent config set azure.endpoint https://my-resource.services.ai.azure.com
imagent config set azure.apiKey <azure-key>
```

Environment variables:

```bash
AZURE_ENDPOINT=https://my-resource.services.ai.azure.com \
AZURE_API_KEY=<azure-key> \
imagent image generate "prompt" --provider azure
```

Azure deployment names are per-user provider routing entries. Use `imagent config provider add` or the desktop **Providers** page to map each Azure deployment ID to a canonical image model.

Config routing example mixing families on the same resource:

```json
{
  "providers": {
    "azure": {
      "endpoint": "https://my-resource.services.ai.azure.com",
      "image": [
        { "id": "my-prod-gpt-image-2", "modelId": "gpt-image-2" },
        { "id": "my-prod-mai-image-2", "modelId": "MAI-Image-2" },
        { "id": "my-prod-mai-image-2e", "modelId": "MAI-Image-2e" },
        { "id": "my-prod-flux-2-pro", "modelId": "flux-2-pro" },
        { "id": "my-prod-flux-kontext-pro", "modelId": "flux-kontext-pro" }
      ]
    }
  }
}
```

Then use the deployment ID as the CLI model:

```bash
imagent image generate "architectural concept render" \
  --provider azure \
  --model my-prod-gpt-image-2

imagent image generate "a photorealistic mountain lake at sunrise" \
  --provider azure \
  --model my-prod-mai-image-2 \
  --option size=1024x1024

imagent image generate "obsidian glass cathedral on a wind-swept cliff" \
  --provider azure \
  --model my-prod-flux-2-pro \
  --option size=1024x1024
```

**MAI Image constraints:** both `width` and `height` must be ≥ 768 pixels and `width × height` must be ≤ 1,048,576 (i.e. 1024×1024). Either dimension may exceed 1024 if the total stays within the limit.

**FLUX on Azure Foundry:** map your Azure deployment to the canonical FLUX id you deployed — `flux-2-pro`, `flux-2-flex`, `flux-kontext-pro`, or `flux-pro-1.1`. FLUX.2 [flex] needs Microsoft's [registration approval](https://customervoice.microsoft.com/Pages/ResponsePage.aspx?id=v4j5cvGGr0GRqy180BHbR7en2Ais5pxKtso_Pz4b1_xUMzM2TDBZRko3QldSSFlWREhQSEpSSEdKVyQlQCN0PWcu) before deployment.

### Google AI Studio (`google`)

Google uses one API key for configured image models and Veo video models.

CLI setup:

```bash
imagent config set google.apiKey <google-api-key>
```

Environment variable:

```bash
GOOGLE_API_KEY=<google-api-key> imagent image generate "prompt" --provider google
```

Optional advanced secret field:

```bash
imagent config set google.baseUrl https://your-google-compatible-endpoint
```

Image example:

```bash
imagent image generate "storybook illustration of a floating library" \
  --provider google \
  --model gemini-2.5-flash-image \
  --option aspect=16:9
```

Video example:

```bash
imagent video generate "a gentle tracking shot through a flower market" \
  --provider google \
  --model veo-3.0-generate-001 \
  --option duration=8
```

### Black Forest Labs / Flux (`flux-bfl`)

Flux/BFL supports image generation through the official BFL API.

CLI setup:

```bash
imagent config set flux-bfl.apiKey <bfl-key>
```

Environment variable:

```bash
FLUX_BFL_API_KEY=<bfl-key> imagent image generate "prompt" --provider flux-bfl
```

Optional advanced secret field:

```bash
imagent config set flux-bfl.baseUrl https://api.bfl.ai
```

Example:

```bash
imagent image generate "high-detail fantasy landscape, morning mist" \
  --provider flux-bfl \
  --model flux-2-pro \
  --option aspect=16:9
```

### ByteDance / BytePlus ModelArk (`bytedance`)

ByteDance uses one provider ID for Seedream image models and Seedance video models. Both require an endpoint and an API key. The endpoint includes the Ark region.

CLI setup:

```bash
imagent config set bytedance.endpoint https://ark.cn-beijing.volces.com/api/v3
imagent config set bytedance.apiKey <bytedance-key>
```

Environment variables:

```bash
BYTEDANCE_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3 \
BYTEDANCE_API_KEY=<bytedance-key> \
imagent video generate "prompt" --provider bytedance
```

Image example:

```bash
imagent image generate "polished character key art" \
  --provider bytedance \
  --model doubao-seedream-4-0-250828 \
  --option size=2K \
  --option count=2
```

Video example:

```bash
imagent video generate "a sweeping shot over a cyberpunk street" \
  --provider bytedance \
  --model doubao-seedance-1-0-pro-250528 \
  --option duration=5 \
  --option resolution=720p
```

If you use a different ByteDance/Ark region, replace the endpoint with the region-specific base URL from your account.

### xAI (`xai`)

xAI supports Grok image and video generation through the configured xAI API endpoint.

CLI setup:

```bash
imagent config set xai.apiKey <xai-key>
```

Environment variable:

```bash
XAI_API_KEY=<xai-key> imagent image generate "prompt" --provider xai
```

Optional advanced secret field:

```bash
imagent config set xai.baseUrl https://api.x.ai/v1
```

Image example:

```bash
imagent image generate "retro sci-fi explorer poster" \
  --provider xai \
  --model grok-imagine-image \
  --option aspect=3:4
```

Video example:

```bash
imagent video generate "a dramatic hero shot with drifting fog" \
  --provider xai \
  --model grok-imagine-video \
  --option duration=10
```

### Custom OpenAI-compatible image providers

The desktop **Providers** page can add custom OpenAI Images API-compatible providers. A custom provider needs:

- A provider ID matching `^[a-z0-9][a-z0-9_-]*$`.
- A display name.
- A base URL.
- An optional API key, for endpoints that require direct authentication.
- One or more image model mappings from provider-facing model IDs to canonical catalog image models.

Custom provider API keys are stored under `customOpenAI` in the local workspace `secrets.json` file; base URLs and model mappings are stored under `providers.customOpenAI.<id>` in `config.json`.

Configure custom providers through the desktop app or with `imagent config provider add|rm|list`.

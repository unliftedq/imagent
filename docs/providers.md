---
description: Connect OpenAI, Azure OpenAI, Google, Flux, ByteDance, and xAI models.
---

# Providers

imagent supports six built-in provider IDs:

| Provider ID | Display name | Images | Videos | Required secret fields |
| --- | --- | --- | --- | --- |
| `openai` | OpenAI | Yes | No | `apiKey` |
| `azure-openai` | Azure OpenAI | Yes | No | `endpoint`, `apiKey` |
| `google` | Google AI Studio | Yes | Yes | `apiKey` |
| `flux-bfl` | Black Forest Labs | Yes | No | `apiKey` |
| `bytedance` | ByteDance / BytePlus ModelArk | Yes | Yes | `endpoint`, `apiKey` |
| `xai` | xAI | Yes | Yes | `apiKey` |

Providers without configured secrets are skipped at runtime. `imagent doctor` reports how many built-in providers are configured.

### Configuration methods

You can configure providers in three ways:

1. Desktop app: open **Providers**, choose a provider, enter its key and endpoint if required, optionally test it, and save.
2. CLI: use `imagent config set <provider>.<field> <value>`.
3. Environment variables: set secrets for a single CLI process. Environment values override the local workspace secrets file for that run.

Secrets are stored in the local workspace `secrets.json` file. On POSIX systems, imagent attempts to write the file with `0600` permissions.

### OpenAI (`openai`)

Use OpenAI image models from the model catalog.

CLI setup:

```bash
imagent config set openai.apiKey sk-...
```

Environment variable:

```bash
OPENAI_API_KEY=sk-... imagent image "prompt" --provider openai
```

Optional advanced secret field:

```bash
imagent config set openai.baseUrl https://your-openai-compatible-proxy/v1
```

Use `baseUrl` only when pointing OpenAI traffic at a compatible proxy or alternate endpoint.

Example:

```bash
imagent image "clean product render on white background" \
  --provider openai \
  --model gpt-image-2 \
  --option size=1024x1024
```

### Azure OpenAI (`azure-openai`)

Azure requires both an endpoint and an API key. The endpoint identifies your Azure resource.

CLI setup:

```bash
imagent config set azure-openai.endpoint https://my-resource.services.ai.azure.com
imagent config set azure-openai.apiKey <azure-key>
```

Environment variables:

```bash
AZURE_OPENAI_ENDPOINT=https://my-resource.services.ai.azure.com \
AZURE_OPENAI_API_KEY=<azure-key> \
imagent image "prompt" --provider azure-openai
```

Azure deployment names are model catalog provider offering IDs. Edit the local workspace `catalog.json` file or use the desktop **Providers** page to map each Azure deployment ID to a canonical image model such as `gpt-image-2`.

Catalog mapping example:

```json
{
  "providers": {
    "azure-openai": {
      "image": [
        { "id": "my-prod-image-deployment", "modelId": "gpt-image-2" }
      ]
    }
  }
}
```

Then use the deployment ID as the CLI model:

```bash
imagent image "architectural concept render" \
  --provider azure-openai \
  --model my-prod-image-deployment
```

### Google AI Studio (`google`)

Google uses one API key for configured image models and Veo video models.

CLI setup:

```bash
imagent config set google.apiKey <google-api-key>
```

Environment variable:

```bash
GOOGLE_API_KEY=<google-api-key> imagent image "prompt" --provider google
```

Optional advanced secret field:

```bash
imagent config set google.baseUrl https://your-google-compatible-endpoint
```

Image example:

```bash
imagent image "storybook illustration of a floating library" \
  --provider google \
  --model gemini-2.5-flash-image \
  --option aspect=16:9
```

Video example:

```bash
imagent video "a gentle tracking shot through a flower market" \
  --provider google \
  --model veo-3.0-generate-001 \
  --option duration=8 \
  --wait
```

### Black Forest Labs / Flux (`flux-bfl`)

Flux/BFL supports image generation through the official BFL API.

CLI setup:

```bash
imagent config set flux-bfl.apiKey <bfl-key>
```

Environment variable:

```bash
FLUX_BFL_API_KEY=<bfl-key> imagent image "prompt" --provider flux-bfl
```

Optional advanced secret field:

```bash
imagent config set flux-bfl.baseUrl https://api.bfl.ai
```

Example:

```bash
imagent image "high-detail fantasy landscape, morning mist" \
  --provider flux-bfl \
  --model flux-2-pro \
  --option aspect=16:9 \
  --option seed=12345
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
imagent video "prompt" --provider bytedance --wait
```

Image example:

```bash
imagent image "polished character key art" \
  --provider bytedance \
  --model doubao-seedream-4-0-250828 \
  --option size=2K \
  --option count=2
```

Video example:

```bash
imagent video "a sweeping shot over a cyberpunk street" \
  --provider bytedance \
  --model doubao-seedance-1-0-pro-250428 \
  --option duration=5 \
  --option resolution=720p \
  --wait
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
XAI_API_KEY=<xai-key> imagent image "prompt" --provider xai
```

Optional advanced secret field:

```bash
imagent config set xai.baseUrl https://api.x.ai/v1
```

Image example:

```bash
imagent image "retro sci-fi explorer poster" \
  --provider xai \
  --model grok-imagine-image \
  --option aspect=3:4
```

Video example:

```bash
imagent video "a dramatic hero shot with drifting fog" \
  --provider xai \
  --model grok-imagine-video \
  --option duration=10 \
  --wait
```

### Custom OpenAI-compatible image providers

The desktop **Providers** page can add custom OpenAI Images API-compatible providers. A custom provider needs:

- A provider ID matching `^[a-z0-9][a-z0-9_-]*$`.
- A display name.
- A base URL.
- An optional API key, for endpoints that require direct authentication.
- One or more image model mappings from provider-facing model IDs to canonical catalog image models.

Custom provider secrets are stored under `customOpenAI` in the local workspace `secrets.json` file; model mappings are stored under the provider ID in the local workspace `catalog.json` file.

The current CLI `config set` command only supports built-in provider IDs. Configure custom providers through the desktop app or by carefully editing `secrets.json` and `catalog.json`.

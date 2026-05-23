---
description: Understand workspace files, secrets, model defaults, and local catalog behavior.
---

# Configuration

### Workspace layout

By default, imagent stores all local data in a dedicated local workspace directory:

| Path | Purpose |
| --- | --- |
| `config.json` | Non-sensitive app preferences and per-user provider routing (Azure / BytePlus / 火山引擎 endpoints, custom OpenAI base URLs, deployment / model id mappings). |
| `secrets.json` | Provider API keys only (chmod 600). Non-sensitive routing lives in `config.json`. |
| `catalog.json` | User-editable canonical model catalog (capabilities + bundled provider offerings). |
| `studio.db` | Local SQLite database for assets, gallery, boards, jobs, and metadata. |
| `assets/` | Copied asset reference files and thumbnails. |
| `gallery/` | Generated image and video outputs, organized by date. |
| `logs/` | Application and job logs. |
| `cache/provider-responses/` | Provider response cache area. |
| `cache/video-temp/` | Temporary video processing area. |

The desktop application and CLI both use this workspace, so changes made in one interface are visible in the other.

### `config.json`

`config.json` contains non-sensitive preferences:

```json
{
  "version": 1,
  "app": {
    "theme": "system",
    "defaultImageModel": { "providerId": "openai", "modelId": "gpt-image-2" },
    "defaultVideoModel": { "providerId": "volcengine", "modelId": "doubao-seedance-2-0-260128" },
    "defaultOutputDir": null,
    "generationConcurrency": 2,
    "keepPromptHistory": true,
    "openAfterGenerate": false
  },
  "providers": {
    "openai": {},
    "azure": {
      "endpoint": "https://my-resource.openai.azure.com",
      "image": [
        { "id": "my-deployment", "modelId": "gpt-image-2" }
      ]
    },
    "google": {},
    "flux-bfl": {},
    "byteplus": {
      "endpoint": "https://ark.ap-southeast.bytepluses.com/api/v3"
    },
    "volcengine": {
      "endpoint": "https://ark.cn-beijing.volces.com/api/v3"
    },
    "xai": {},
    "customOpenAI": {
      "lmstudio": {
        "displayName": "LM Studio",
        "baseUrl": "http://localhost:1234/v1",
        "image": [{ "id": "my-local-model", "modelId": "gpt-image-2" }]
      }
    }
  }
}
```

App preferences:

- `theme`: `light`, `dark`, or `system`.
- `defaultImageModel` / `defaultVideoModel`: provider/model selections used when generation starts without explicit `--provider` / `--model` options.
- `defaultOutputDir`: optional output directory override; `null` means the default gallery location.
- `generationConcurrency`: integer from `1` to `8`.
- `keepPromptHistory`: whether prompt history is retained.
- `openAfterGenerate`: whether generated files should open after generation when supported by the interface.

Provider routing block (`providers.<id>`):

- `endpoint` (Azure / BytePlus / 火山引擎): resource URL the provider hits. Required for these vendors before generation will run.
- `baseUrl`: optional override for OpenAI-compatible vendors (proxy / self-hosted). Required for `customOpenAI.<id>` entries.
- `image[]` / `video[]`: provider-facing offerings. Each entry maps a deployment / model id (`id`) to a canonical catalog model (`modelId`); capabilities + defaults are inherited and may be overridden.
- `displayName`: optional override for the provider's display name (mainly for custom providers).
- `customOpenAI.<id>`: per-custom-provider routing block, plus the `apiKey` lives in `secrets.json`'s `customOpenAI.<id>`.

Use `imagent config provider add|rm|list` to manage these entries from the CLI, or the desktop **Providers** page.

### `secrets.json`

`secrets.json` contains provider API keys only. Endpoint URLs and base URLs are non-sensitive routing and live in `config.json` under `providers.<id>`. Example shape:

```json
{
  "openai": { "apiKey": "sk-..." },
  "azure": { "apiKey": "..." },
  "google": { "apiKey": "..." },
  "flux-bfl": { "apiKey": "..." },
  "byteplus": { "apiKey": "..." },
  "volcengine": { "apiKey": "..." },
  "xai": { "apiKey": "..." },
  "customOpenAI": {
    "my-provider": { "apiKey": "..." }
  }
}
```

Do not commit this file or paste it into issue reports. Prefer environment variables for temporary automation and CI-like runs.

### Environment variables

Supported environment variables are:

| Variable | Lands in |
| --- | --- |
| `OPENAI_API_KEY` | `secrets.openai.apiKey` |
| `AZURE_API_KEY` | `secrets.azure.apiKey` |
| `AZURE_ENDPOINT` | `config.providers.azure.endpoint` (overlay) |
| `GOOGLE_API_KEY` | `secrets.google.apiKey` |
| `FLUX_BFL_API_KEY` | `secrets.flux-bfl.apiKey` |
| `BYTEPLUS_API_KEY` | `secrets.byteplus.apiKey` |
| `BYTEPLUS_ENDPOINT` | `config.providers.byteplus.endpoint` (overlay) |
| `VOLCENGINE_API_KEY` | `secrets.volcengine.apiKey` |
| `VOLCENGINE_ENDPOINT` | `config.providers.volcengine.endpoint` (overlay) |
| `XAI_API_KEY` | `secrets.xai.apiKey` |

API-key env vars override the file-stored secrets. Endpoint env vars overlay the file-stored routing for the duration of the CLI invocation without writing to disk.

### `catalog.json`

`catalog.json` defines canonical model capabilities and bundled provider offerings. It is used by both the CLI and desktop app to populate model pickers and validate generation options.

Use it to:

- Review bundled provider offerings.
- Add or adjust canonical model definitions.
- Override model capabilities or defaults for a provider-specific route.

Use `imagent config provider add|rm|list` or the desktop **Providers** page for per-user routing such as Azure deployment names and custom OpenAI-compatible provider model IDs; those entries live in `config.json` under `providers.<id>` / `providers.customOpenAI.<id>` and overlay the catalog at runtime. Use `imagent models` and `imagent options` to inspect the effective catalog, and `imagent config reset catalog` if you need to return to bundled defaults.

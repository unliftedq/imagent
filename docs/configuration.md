---
description: Understand workspace files, secrets, model defaults, and local catalog behavior.
---

# Configuration

### Workspace layout

By default, imagent stores all local data in a dedicated local workspace directory:

| Path | Purpose |
| --- | --- |
| `config.json` | Non-sensitive app preferences. |
| `secrets.json` | Provider keys, endpoints, base URLs, and custom provider secrets. |
| `catalog.json` | User-editable model catalog and provider model mappings. |
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
    "defaultProvider": "openai",
    "defaultOutputDir": null,
    "generationConcurrency": 2,
    "keepPromptHistory": true,
    "openAfterGenerate": false
  },
  "providers": {
    "openai": {},
    "azure-openai": {},
    "google": {},
    "flux-bfl": {},
    "bytedance": {},
    "xai": {}
  }
}
```

App preferences:

- `theme`: `light`, `dark`, or `system`.
- `defaultProvider`: provider used by image generation when `--provider` is omitted.
- `defaultOutputDir`: optional output directory override; `null` means the default gallery location.
- `generationConcurrency`: integer from `1` to `8`.
- `keepPromptHistory`: whether prompt history is retained.
- `openAfterGenerate`: whether generated files should open after generation when supported by the interface.

The provider preference objects are currently reserved for future provider-specific settings. Model lists and Azure deployment names belong in `catalog.json`.

### `secrets.json`

`secrets.json` contains provider authentication and endpoint data. Example shape:

```json
{
  "openai": { "apiKey": "sk-..." },
  "azure-openai": {
    "endpoint": "https://my-resource.services.ai.azure.com",
    "apiKey": "..."
  },
  "google": { "apiKey": "..." },
  "flux-bfl": { "apiKey": "..." },
  "bytedance": {
    "endpoint": "https://ark.cn-beijing.volces.com/api/v3",
    "apiKey": "..."
  },
  "xai": { "apiKey": "..." },
  "customOpenAI": {
    "my-provider": {
      "baseUrl": "https://example.com/v1",
      "apiKey": "..."
    }
  }
}
```

Do not commit this file or paste it into issue reports. Prefer environment variables for temporary automation and CI-like runs.

### Environment variables

Supported environment variables are:

| Variable | Provider field |
| --- | --- |
| `OPENAI_API_KEY` | `openai.apiKey` |
| `AZURE_OPENAI_API_KEY` | `azure-openai.apiKey` |
| `AZURE_OPENAI_ENDPOINT` | `azure-openai.endpoint` |
| `GOOGLE_API_KEY` | `google.apiKey` |
| `FLUX_BFL_API_KEY` | `flux-bfl.apiKey` |
| `BYTEDANCE_API_KEY` | `bytedance.apiKey` |
| `BYTEDANCE_ENDPOINT` | `bytedance.endpoint` |
| `XAI_API_KEY` | `xai.apiKey` |

Environment secrets override file secrets for CLI runtime loading. Azure OpenAI and ByteDance environment configuration require both endpoint and API key to be present.

### `catalog.json`

`catalog.json` defines canonical model capabilities and provider-facing routes. It is used by both the CLI and desktop app to populate model pickers and validate generation options.

Use it to:

- Add or remove model offerings.
- Map Azure deployment names to canonical OpenAI image model definitions.
- Configure custom OpenAI-compatible provider model IDs.
- Override model capabilities or defaults for a provider-specific route.

Use `imagent catalog show` before editing and `imagent catalog reset` if you need to return to bundled defaults.

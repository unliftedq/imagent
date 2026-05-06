# imagent User Guide

imagent is a local-first image and video generation studio for individual creators. It ships as both an Electron desktop application and a command-line tool, and both interfaces share the same local workspace under `~/.imagent/` by default.

Use this guide to install imagent, configure providers, generate media, manage assets and results, and keep your local workspace healthy.

## Contents

- [Quick start](#quick-start)
- [Installation](#installation)
- [Updates](#updates)
- [CLI usage](#cli-usage)
- [Providers](#providers)
- [Configuration](#configuration)
- [Best practices](#best-practices)

## Quick start

### 1. Install or run the CLI

Install globally:

```bash
npm install -g @imagent/cli
imagent doctor
```

Or run without installing:

```bash
npx -y @imagent/cli doctor
```

`imagent doctor` creates the local workspace if needed, initializes the SQLite database and default files, and prints the active database, config, and provider status.

### 2. Configure a provider

For OpenAI:

```bash
imagent config set openai.apiKey sk-...
imagent doctor
```

Environment variables can also supply secrets for one-off CLI runs:

```bash
OPENAI_API_KEY=sk-... imagent image "a cinematic portrait of a red fox"
```

### 3. Generate an image

```bash
imagent image "a cinematic portrait of a red fox" \
  --provider openai \
  --option size=1024x1024 \
  --option quality=medium
```

The CLI prints the generated file path when the job completes. Generated outputs are stored in the shared gallery by default.

### 4. Generate a video

```bash
imagent video "a slow camera move through a neon city" \
  --provider bytedance \
  --option duration=5 \
  --option resolution=720p \
  --wait
```

Video jobs are asynchronous. Use `--wait` to block until completion, or reattach later with `imagent job watch <jobId>`.

### 5. Use the desktop app

Open the desktop app, configure providers in **Providers**, choose defaults in **Settings**, create assets in **Assets**, generate in **Studio**, and curate results in **Gallery**. The desktop app and CLI read and write the same `~/.imagent/` workspace.

## Installation

### Prerequisites

- CLI package: Node.js `>=22`.
- Source development: Bun `>=1.3`.
- Desktop development and packaging: Bun plus native module rebuild support for Electron.

### Install the CLI

Preferred global installation:

```bash
npm install -g @imagent/cli
imagent doctor
```

Run without installing:

```bash
npx -y @imagent/cli doctor
```

Build from source:

```bash
git clone https://github.com/unliftedq/imagent.git
cd imagent
bun install
bun run --filter @imagent/cli build
node apps/cli/dist/cli.js doctor
```

Build a standalone CLI binary from source:

```bash
bun run --filter @imagent/cli build:binary
```

### Install the desktop application

If a packaged release is available for your platform, download the installer or app image from the project releases and install it normally. The current desktop packaging configuration targets:

- Windows: NSIS installer, x64.
- macOS: DMG, x64 and arm64.
- Linux: AppImage, x64.

Windows installers are currently unsigned and may trigger a SmartScreen warning on first launch.

Build and run the desktop app from source:

```bash
git clone https://github.com/unliftedq/imagent.git
cd imagent
bun install
bun run --filter @imagent/studio rebuild
bun run --filter @imagent/studio dev
```

`rebuild` is required before the first desktop launch so `better-sqlite3` and `sharp` are rebuilt for the Electron ABI.

Package the desktop app from source:

```bash
bun run --filter @imagent/studio package
```

The default package script builds the Windows NSIS installer. Platform-specific package scripts are also available:

```bash
bun run --filter @imagent/studio package:win
bun run --filter @imagent/studio package:mac
bun run --filter @imagent/studio package:linux
```

Packaged desktop builds keep `~/.imagent/` in place across reinstalls and upgrades, so your gallery, assets, boards, config, and provider secrets remain available.

## Updates

### Update the CLI

If installed globally with npm:

```bash
npm update -g @imagent/cli
imagent doctor
```

Or reinstall the latest published version:

```bash
npm install -g @imagent/cli@latest
```

If using `npx`, each invocation can resolve the latest package version depending on your npm cache and command options:

```bash
npx -y @imagent/cli@latest doctor
```

If running from source:

```bash
git pull
bun install
bun run --filter @imagent/cli build
```

### Update the desktop app

The project does not currently include automatic updates. To update the desktop application, install a newer packaged release over the existing installation. User data remains under `~/.imagent/` and is not removed by the Windows uninstaller by default.

If running from source:

```bash
git pull
bun install
bun run --filter @imagent/studio rebuild
bun run --filter @imagent/studio build
```

Run `rebuild` again after dependency or Electron changes so native modules match the Electron runtime.

### Update the model catalog

The runtime model catalog is stored at `~/.imagent/catalog.json`. On first run, imagent seeds it from the bundled default catalog. After that, the user file is authoritative.

Show the active catalog path:

```bash
imagent catalog path
```

Inspect models and provider mappings:

```bash
imagent catalog show
imagent catalog show --provider openai
imagent catalog show --kind video
```

Reset the user catalog to the bundled default:

```bash
imagent catalog reset
```

Use `--force` to skip the confirmation prompt:

```bash
imagent catalog reset --force
```

## CLI usage

### Command overview

```text
imagent doctor
imagent config {get|set|path}
imagent catalog {path|show|reset}
imagent image <prompt>
imagent video <prompt>
imagent asset {add|list|show|rm}
imagent gallery {ls|show|remix|rm|favorite}
imagent job {ls|status|cancel|watch}
imagent mcp
```

### Health checks

```bash
imagent doctor
```

`doctor` verifies the workspace, database, FTS tables, config file, and configured provider count. It does not perform provider network calls.

### Configuration commands

Print active paths:

```bash
imagent config path
```

Set a provider secret:

```bash
imagent config set openai.apiKey sk-...
imagent config set bytedance.endpoint https://ark.cn-beijing.volces.com/api/v3
```

Read provider secrets with API keys masked:

```bash
imagent config get
imagent config get openai.apiKey
```

The CLI config command writes secrets only. General app preferences such as theme, default output directory, default provider, and concurrency are managed by the desktop **Settings** page or by carefully editing `~/.imagent/config.json`.

### Catalog commands

```bash
imagent catalog path
imagent catalog show --provider google
imagent catalog show --kind image
imagent catalog reset --force
```

The catalog defines supported models, model capabilities, and provider-facing model IDs or deployment names. Azure OpenAI deployment names and custom provider model mappings belong in `~/.imagent/catalog.json`, not in `config.json`.

### Image generation

Basic image generation:

```bash
imagent image "minimal product photo of a ceramic mug"
```

Select provider and model:

```bash
imagent image "editorial fashion portrait" \
  --provider google \
  --model gemini-2.5-flash-image
```

Pass model options with repeatable `--option key=value` flags:

```bash
imagent image "studio portrait, soft rim light" \
  --provider openai \
  --model gpt-image-2 \
  --option size=1024x1536 \
  --option quality=high \
  --option outputFormat=png \
  --option count=2
```

Common image options are:

- `size`
- `aspectRatio` or alias `aspect`
- `quality`
- `outputFormat` or alias `format`
- `negativePrompt` or alias `negative`
- `seed`
- `count`
- `raw.<vendorOption>` for advanced provider-specific values

Options are validated against the selected model's catalog capabilities. For example, providers that do not advertise negative prompts reject `negativePrompt`.

Attach references and reusable assets:

```bash
imagent image "Nova exploring a glass greenhouse" \
  --character nova \
  --style watercolor \
  --ref ./moodboard.png
```

Copy the completed result to a specific directory:

```bash
imagent image "poster art for a synthwave festival" --out ./outputs
```

### Video generation

Basic video generation:

```bash
imagent video "a slow dolly shot through a rainy alley" --wait
```

Select provider, model, and options:

```bash
imagent video "a crane shot over a futuristic coastline" \
  --provider google \
  --model veo-3.0-generate-001 \
  --option duration=8 \
  --option resolution=720p \
  --wait
```

Common video options are:

- `durationSec` or alias `duration`
- `fps`
- `resolution`
- `firstFrame`
- `lastFrame`
- `raw.<vendorOption>` for advanced provider-specific values

Attach reference images and assets:

```bash
imagent video "Nova turns toward the camera as leaves drift past" \
  --provider bytedance \
  --character nova \
  --ref ./first-frame.png \
  --option duration=5 \
  --wait
```

Submit without waiting:

```bash
imagent video "a quiet sunrise timelapse over mountains" --provider xai
```

Then inspect or reattach:

```bash
imagent job ls --kind video
imagent job status <jobId>
imagent job watch <jobId>
```

### Asset management

Assets help keep recurring characters, objects, backgrounds, and styles consistent.

Supported asset kinds:

- `character`
- `object`
- `background`
- `style`

Add a character, object, or background with one reference image:

```bash
imagent asset add character \
  --name "Nova" \
  --description "main character, silver jacket" \
  --ref ./nova.png
```

Add a style with a prompt snippet, a reference image, or both:

```bash
imagent asset add style \
  --name "Soft watercolor" \
  --prompt "soft watercolor, muted palette, paper texture"
```

List and inspect assets:

```bash
imagent asset list
imagent asset list --kind character
imagent asset list --search "watercolor"
imagent asset show <assetId>
```

Delete an asset:

```bash
imagent asset rm <assetId>
imagent asset rm <assetId> --force
```

When generating, attach assets by slug or ID:

```bash
imagent image "portrait in a moonlit forest" --character nova --style soft-watercolor
```

Style assets append their prompt snippet to the generation prompt. Asset reference images are added to the request and capped according to the selected model's catalog capabilities.

### Gallery management

List generated results:

```bash
imagent gallery ls
imagent gallery ls --kind image
imagent gallery ls --provider openai
imagent gallery ls --favorite
imagent gallery ls --search "fox"
```

Show a result:

```bash
imagent gallery show <itemId>
```

Favorite or unfavorite:

```bash
imagent gallery favorite <itemId>
imagent gallery favorite <itemId> --off
```

Remix an existing result:

```bash
imagent gallery remix <itemId> --prompt-suffix "at sunset"
```

Delete a result and its file:

```bash
imagent gallery rm <itemId>
imagent gallery rm <itemId> --force
```

### Job management

List jobs:

```bash
imagent job ls
imagent job ls --state running
imagent job ls --kind video --limit 20
```

Inspect a job:

```bash
imagent job status <jobId>
```

Cancel a queued or running job:

```bash
imagent job cancel <jobId>
```

Watch a video job:

```bash
imagent job watch <jobId>
```

Image jobs are not resumable after the originating CLI process exits. Video jobs are designed for async polling and can be watched later from the same machine.

## Providers

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
3. Environment variables: set secrets for a single CLI process. Environment values override `~/.imagent/secrets.json` for that run.

Secrets are stored in `~/.imagent/secrets.json`. On POSIX systems, imagent attempts to write the file with `0600` permissions.

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

Azure deployment names are model catalog provider offering IDs. Edit `~/.imagent/catalog.json` or use the desktop **Providers** page to map each Azure deployment ID to a canonical image model such as `gpt-image-2`.

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

Custom provider secrets are stored under `customOpenAI` in `~/.imagent/secrets.json`; model mappings are stored under the provider ID in `~/.imagent/catalog.json`.

The current CLI `config set` command only supports built-in provider IDs. Configure custom providers through the desktop app or by carefully editing `secrets.json` and `catalog.json`.

## Configuration

### Workspace layout

By default, imagent stores all local data under `~/.imagent/`:

| Path | Purpose |
| --- | --- |
| `~/.imagent/config.json` | Non-sensitive app preferences. |
| `~/.imagent/secrets.json` | Provider keys, endpoints, base URLs, and custom provider secrets. |
| `~/.imagent/catalog.json` | User-editable model catalog and provider model mappings. |
| `~/.imagent/studio.db` | Local SQLite database for assets, gallery, boards, jobs, and metadata. |
| `~/.imagent/assets/` | Copied asset reference files and thumbnails. |
| `~/.imagent/gallery/` | Generated image and video outputs, organized by date. |
| `~/.imagent/logs/` | Application and job logs. |
| `~/.imagent/cache/provider-responses/` | Provider response cache area. |
| `~/.imagent/cache/video-temp/` | Temporary video processing area. |

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

## Best practices

### Protect secrets

- Prefer `imagent config set` or the desktop **Providers** page over manual secret file edits.
- Use environment variables for one-off shell sessions and automation.
- Never commit `~/.imagent/secrets.json` or screenshots containing full API keys.
- Rotate provider keys if they are accidentally exposed.

### Keep the workspace backed up

The project is local-first. Your creative history lives in `~/.imagent/`, especially:

- `studio.db`
- `config.json`
- `catalog.json`
- `secrets.json`
- `assets/`
- `gallery/`

Back up the entire directory before large catalog edits, system migrations, or manual cleanup.

### Use the catalog as the source of truth for models

- Do not add model arrays to `config.json`.
- Put Azure deployment names in `catalog.json` provider offerings.
- Use `imagent catalog show --provider <id>` to verify the model IDs you plan to pass with `--model`.
- Reset the catalog if local edits cause validation or model resolution errors.

### Start with `doctor`

Run `imagent doctor` after installation, updates, and provider changes. It confirms the workspace can be opened and shows provider configuration count.

### Use assets for repeatable visual identity

- Create character assets for recurring people or personas.
- Create object assets for important props.
- Create background assets for recurring locations.
- Create style assets for reusable prompt snippets and visual references.
- Use short, memorable asset names so generated slugs are easy to pass to CLI commands.

### Match options to model capabilities

Not every provider supports the same options. For example:

- Some image models use `size`; others use `aspectRatio`.
- Some models support `seed`; others do not.
- Some providers cap reference image counts more tightly than others.
- Some video models support first and last frames; others support text-only generation.

Use `imagent catalog show --provider <id>` to inspect capabilities before building repeatable scripts.

### Be deliberate with async video jobs

- Use `--wait` when you want the CLI process to stream progress until completion.
- Save the submitted job ID if you do not wait.
- Use `imagent job watch <jobId>` to reattach to queued or running video jobs.
- Use `imagent job ls --state running` to find active jobs.

### Keep desktop and CLI workflows consistent

Because the desktop and CLI share one workspace, use the CLI for repeatable automation and the desktop app for visual review, provider setup, model mapping, assets, boards, and gallery curation.

### Avoid destructive cleanup outside imagent

Prefer `imagent asset rm`, `imagent gallery rm`, and desktop delete/archive flows over manually deleting files from `~/.imagent/`. Manual deletion can leave database rows pointing at missing files.

### Rebuild native modules when switching desktop development contexts

When running the desktop app from source, run:

```bash
bun run --filter @imagent/studio rebuild
```

before launching Electron after a fresh install or Electron dependency change. If you switch back to host Node-based CLI or persistence tests after rebuilding for Electron, rebuild `better-sqlite3` for the host Node ABI as described in `apps/desktop/README.md`.

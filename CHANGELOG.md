# Changelog

## 0.3.1 - 2026-06-13

### Desktop app

- Added image copy actions in Studio and Gallery so generated assets can be copied directly to the clipboard without leaving the app.
- Expanded the Studio canvas action set and related UI state handling to make common image actions easier to access during editing and review.
- Updated Gallery action surfaces, IPC wiring, and localized copy strings to support the new image-copy workflow end to end.

## 0.3.0 - 2026-06-08

This release brings **text-to-speech (TTS)** to both the **desktop app** and the **CLI**, so you can generate speech alongside images and videos from either surface.

### Speech (TTS) in desktop & CLI

- The desktop Studio now includes a speech rail for synthesizing audio, and the CLI gains `imagent speech synthesize` / `imagent speech voices`, so TTS works end-to-end from both the desktop app and the command line.

### Speech providers

- **OpenAI** — `gpt-4o-mini-tts`, with static voice metadata, steerable `instructions`, and codec selection.
- **Google** — `gemini-3.1-flash-tts-preview`, with catalog wiring and WAV output handling.
- **ElevenLabs** — `eleven_multilingual_v2`, `eleven_v3`, and `eleven_flash_v2_5`, with dynamic voice discovery.
- **MiniMax** — `speech-2.8-hd` and `speech-2.8-turbo`, with dynamic voice discovery.

### Docs

- Refreshed the provider and model docs with the available speech-model capabilities, voices, and usage examples.

## 0.2.8 - 2026-06-04

### Providers

- Added `MAI-Image-2.5` and `MAI-Image-2.5-Flash` to the bundled catalog, including the Azure routing and image-edit support needed for image-to-image workflows.
- Tightened MAI 2.5 size handling so oversized presets are excluded and requests stay within the documented limits.
- Added the built-in MiniMax provider and related MiniMax / Hailuo model support across the bundled catalog, configuration surfaces, desktop app, CLI, and docs.

## 0.2.7 - 2026-05-23

### UI & desktop

- Improved dialog and popover portal handling in `@imagent/ui` so layered surfaces behave more reliably during interaction.
- Updated the Studio model picker to use the new portal-aware primitives for more consistent overlay behavior in the desktop app.

## 0.2.6 - 2026-05-23

### Branding & packaging

- Replaced the remaining ByteDance-facing product copy with BytePlus / Volcengine naming across the CLI, desktop app, docs, issue templates, workflows, and release-facing assets so provider branding stays consistent throughout the project.
- Refreshed related provider logos and desktop branding assets to match the current naming.

### Desktop app

- Added a dedicated macOS icon generation script and regenerated the packaged macOS icon assets, making future desktop branding updates easier to reproduce.

## 0.2.5 - 2026-05-23

### Desktop app

- Gallery and Studio now use a shared zoomable image preview, making it easier to inspect generated images and references without leaving the current workflow.
- Studio image and video flows were tightened up: queued jobs emit progress immediately, reference upload UX was cleaned up, and first/last frame picking now follows the same interaction pattern as other asset pickers.
- Model logos, several UI icons, and desktop branding assets were refreshed for clearer provider recognition and a more polished app presentation.

### Providers

- ByteDance image and video support was refreshed around the current catalog ids and capabilities, and the video provider now uses direct ModelArk HTTP handling for more reliable task execution and polling.

### Docs & legal

- The desktop About settings now link to the project's legal documents, and the website now includes dedicated Privacy Policy and Terms of Service pages.
- README branding assets and copy were refreshed to match the current product identity.

## 0.2.4 - 2026-05-19

### CLI

- `imagent image generate`, `imagent video generate --wait`, `imagent video download`, and `imagent gallery remix` now show an animated spinner while waiting for generation to finish. The spinner displays a rotating frame, the active provider/model label, provider progress percent, job state, and elapsed time, so long-running waits no longer feel frozen.
- Non-TTY runs (CI, piped logs) keep the existing plain-text output and only emit a new line when progress or state actually changes.

### Desktop app

- Gallery now auto-loads more results while you scroll, prefetching the next page as you approach the end of the current grid so browsing larger libraries feels smoother.

### Community & docs

- Added dedicated GitHub issue templates for bug reports, feature requests, and provider/model requests so community feedback lands in a more consistent format.
- Added a pull request template and a contributor guide to document repo setup, validation, and contribution expectations.
- Clarified the README license section.

## 0.2.3 - 2026-05-18

- Replaced the native Chinese tokenizer dependency with `@node-rs/jieba`, including the FTS migration and CLI binary packaging updates needed to keep Chinese search working in local and packaged builds.

## 0.2.2 - 2026-05-17

- Desktop app can now check for updates and install them in-app, with a new **Updates** panel in Settings that downloads the right installer for your platform and launches it for you.
- Full English + Simplified Chinese localization across Studio, Gallery, Assets, Models, Providers, Settings, and the sidebar navigation.

## 0.2.1 - 2026-05-16

### Highlights

- Studio gets a capability-aware **configuration panel** that replaces the old per-rail settings, so image and video generation share one place to edit size, references, and model-specific options.
- Defaults are now expressed as **default image model** + **default video model** instead of a single default provider, so users with multiple providers configured can pick exactly which model each surface starts with.
- The desktop **Providers** and **Models** pages now show real **brand logos** (OpenAI, Azure, Microsoft, Google, xAI, ByteDance, Black Forest Labs, Nano Banana) instead of generic placeholders.
- SQLite FTS now uses **nodejieba tokenization** so Chinese prompts and asset metadata are searchable word-by-word instead of falling back to substring/trigram matching.

### Studio

- Image and video rails now share a single capability-aware configuration panel that renders only the controls the selected model actually supports (size/aspect, references, count, model-specific options).
- Reference picker, image rail, and video rail were refactored around the new panel; custom dimension handling and the reference picker are easier to use.
- Model picker UI was updated alongside the new `Popover` / `Select` primitives in `@imagent/ui`.
- Canvas state and the studio styles were cleaned up to match the new layout.

### Defaults: image + video models

- `config.json` now stores **`defaults.imageModel`** and **`defaults.videoModel`** instead of a single default provider. Both the desktop **Settings** page and the CLI (`imagent config …`, `imagent image generate`, `imagent video generate`) read and validate against these.
- The CLI validates that the configured default models exist in the catalog and that the user has a provider mapped to them before falling back; missing or invalid defaults produce a clearer error.
- IPC contract and server tests updated to round-trip the new default-model fields.

### Catalog & providers

- Catalog override merge no longer silently drops user overrides; the loader, resolver, and schema were tightened with new tests.
- Azure family routing (`packages/providers/src/azure/families.ts`, `azure/image.ts`) and FLUX image dispatch were updated for the latest catalog entries, and Google and xAI image providers got matching test/behavior fixes.
- Bundled `catalog.default.json` (and the desktop copy under `apps/desktop/assets/`) refreshed with the current model capabilities.
- Job runner error output is no longer truncated mid-message, so failures surface their full provider response.

### Persistence: Chinese full-text search

- New migration `003_jieba_fts.sql` rebuilds the FTS index with a **nodejieba**-backed tokenizer for proper Chinese word segmentation.
- Asset and gallery repositories now tokenize queries the same way at read time, so partial Chinese queries match the way users expect.
- The CLI single-file binary build (`apps/cli/scripts/build-binary.mjs`, `sea-config.json`) bundles the nodejieba native asset so packaged binaries keep working.

## 0.2.0 - 2026-05-12

### Highlights

- Azure Foundry image support is now a single `azure` provider that can route Azure OpenAI image models, Microsoft MAI Image models, and Foundry-hosted FLUX deployments from one endpoint + key.
- The bundled catalog now includes the new canonical MAI Image ids (`MAI-Image-2`, `MAI-Image-2e`) plus additional FLUX families (`flux-kontext-pro`, `flux-pro-1.1`) with their documented capability limits.
- The CLI and docs now better reflect the current workflow: use `imagent doctor`, `imagent models`, and `imagent options` to discover configured providers, concrete deployment mappings, and model-specific request options before generation.

### Azure Foundry

- Azure deployment routing now dispatches by canonical model family instead of assuming a single Azure OpenAI image path.
- `gpt-image-*` deployments use the OpenAI-compatible `/openai/v1/images/...` surface.
- `MAI-Image-2` and `MAI-Image-2e` use `/mai/v1/images/generations` with raw `width` / `height`, PNG-only output, and no reference-image support.
- Foundry-hosted FLUX models use the Black Forest Labs provider API on Azure, including async submit + poll handling with sync-response fallback.

### CLI and packaging

- The CLI help and command layout emphasize the current generation flow (`image generate`, `video generate`, `video task`, `models`, `options`, `doctor`) and remove stale top-level command references.
- Workspace version sync now updates the CLI-reported version string too, so the published package version and `imagent --version` stay aligned.

### Documentation

- `docs/providers.md` documents mixed Azure deployment mappings across Azure OpenAI, MAI Image, and FLUX families.
- `docs/models.md` now calls out the MAI Image size rules, PNG-only output, and lack of reference-image support more explicitly.

## 0.1.0 - 2026-05-07

### Breaking changes

- Provider id `azure-openai` is now `azure`. Update `config.json`, `secrets.json`, CLI flags (`--provider azure`), and any scripts that referenced the old id.
- Environment variables `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_ENDPOINT` are now `AZURE_API_KEY` / `AZURE_ENDPOINT`. The unused `AZURE_OPENAI_API_VERSION` is gone (the v1 surface needs no api-version).
- The `AzureOpenAIImageProvider` class (and `AzureOpenAIImageProviderOptions`) is renamed to `AzureImageProvider` (`AzureImageProviderOptions`); the back-compat alias was removed.

### Azure Foundry — multi-family support

The Azure provider now dispatches on each deployment's canonical model id, so one Azure resource can host multiple model families behind a single endpoint + key:

- **Azure OpenAI Image** (`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini`) — `/openai/v1/images/{generations,edits}` via the OpenAI SDK.
- **Microsoft MAI Image** (new — `MAI-Image-2`, `MAI-Image-2e`) — `/mai/v1/images/generations` with raw `width`/`height`, `api-key` header, PNG-only output, no reference images.
- **Black Forest Labs FLUX** (new — `flux-2-pro`, `flux-2-flex`, `flux-kontext-pro`, `flux-pro-1.1`) — `/providers/blackforestlabs/v1/<path>?api-version=preview`, `Authorization: Bearer` auth, async submit + poll with sync-response fallback. Multi-reference editing (`input_image`, `input_image_2`, …) supported on FLUX.2 [pro|flex].

Adding a new family is now: add a case in `azureModelFamily()`, add a generator method, add a canonical catalog entry — no registry, config, or UI changes required.

### Catalog

- Added canonical models `MAI-Image-2` and `MAI-Image-2e` (PNG-only, arbitrary `WIDTHxHEIGHT` size with the 768-min / 1,048,576-total-pixel constraint enforced upstream).
- Added canonical FLUX models `flux-kontext-pro` (1 reference, character consistency) and `flux-pro-1.1` (no references, arbitrary size). Both wired into the `flux-bfl` direct provider too — canonical ids match BFL's URL paths.

### CLI / desktop

- `imagent config set azure.endpoint <url>` and `imagent config set azure.apiKey <key>` (renamed from `azure-openai.*`).
- `imagent config provider add azure <deployment-id> --model <canonical>` accepts deployment names mapped to any of the new canonical ids — `MAI-Image-2`, `flux-2-pro`, etc.
- Desktop **Providers** card description updated; the provider modal still uses the same deployment-mapping flow regardless of family.

### Documentation

- [docs/providers.md](docs/providers.md) Azure section rewritten to cover all three families with a mixed-deployment routing example and the MAI Image pixel constraints.
- [docs/configuration.md](docs/configuration.md) updated env var table; legacy-migration paragraph removed.
- [architecture.md](architecture.md) provider id list updated.

## 0.0.4 - 2026-05-06

- Initial release for IMAGENT.

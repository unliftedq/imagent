# Changelog

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

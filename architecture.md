# imagent Architecture

imagent is a local-first image, video, and speech generation workspace. It ships two user-facing surfaces from one TypeScript monorepo: an Electron desktop application for visual workflows and a Node CLI for automation. Both surfaces share the same workspace under `~/.imagent/`, including SQLite state, provider configuration, reusable assets, generated files, and gallery history. The project has no remote backend and no multi-user authentication layer.

## Scope

The application supports:

- Image generation through OpenAI, Azure, Google, Flux/BFL, BytePlus, 火山引擎, xAI, and custom OpenAI-compatible providers.
- Video generation through BytePlus, 火山引擎, Google, and xAI providers when configured.
- Speech generation (text-to-speech) through ElevenLabs and MiniMax.
- Reusable assets for characters, objects, backgrounds, and styles.
- Gallery and board-oriented curation in the desktop app.
- CLI workflows for provider setup, model discovery, generation, video task tracking, gallery inspection, and MCP integration.

Out of scope for the current architecture are cloud sync, social feeds, multi-user collaboration, fine-tuning workflows, and graph-based node editors.

## Technology Stack

- TypeScript with NodeNext modules across all packages.
- Bun workspaces and Turborepo for workspace scripts.
- Electron, Vite, React, Tailwind CSS, Radix UI, and Zustand for the desktop app.
- Commander for the CLI.
- better-sqlite3 for local persistence, with migrations owned by `@imagent/persistence`.
- Provider SDKs or direct HTTP clients inside `@imagent/providers`.
- Biome for formatting and linting.

## Package Layout

```text
packages/
  core/         domain types, ports, use cases, and job orchestration primitives
  providers/    provider implementations, catalog loading, model resolution, registries
  persistence/  SQLite migrations, repositories, workspace paths, file and thumbnail helpers
  config/       configuration schema, defaults, file-backed config and secrets stores
  ipc/          typed desktop IPC contracts and bindings
  ui/           shared React UI primitives

apps/
  desktop/      Electron main, preload, and renderer application
  cli/          Commander-based `imagent` binary and MCP bridge
```

`@imagent/core` is intentionally free of filesystem, database, and network I/O. Runtime packages compose it with persistence, configuration, and provider adapters.

## Runtime State

The default workspace is `~/.imagent/`:

```text
config.json     non-sensitive preferences and provider routing
secrets.json    provider credentials; written with restrictive permissions when supported
catalog.json    optional model/provider catalog overlay
data/           generated assets, gallery files, thumbnails, and SQLite database files
```

The bundled catalog in `@imagent/providers` is the authoritative base. If `catalog.json` exists, it is parsed as an overlay for additions or overrides and merged over the bundled base. Invalid overlays are preserved on disk and ignored for that run, with the bundled catalog used in memory.

## Core Domain

The core domain separates image, video, and speech generation because their lifecycles differ:

- Image providers expose a synchronous `generate` operation that returns completed media.
- Video providers expose `submit`, `poll`, `fetch`, and optional `cancel` operations for asynchronous provider tasks.
- Speech providers expose text-to-speech `generate` operations that return completed speech files.

The job runner coordinates generation across all three media kinds. It persists state transitions to SQLite, emits progress events, stores completed files, and creates gallery records for image, video, and speech results. Persisted queued/running jobs allow long-running video work to be inspected or resumed by later desktop or CLI sessions.

## Providers and Model Catalog

Providers are configured at the provider/vendor level, while models are resolved from the catalog. The catalog has canonical image/video/speech model definitions and provider-specific offerings. An offering maps the provider-facing model or deployment ID to a canonical model and may override capabilities or defaults.

Provider registries are built from three inputs:

1. Provider credentials from `secrets.json` or environment variables.
2. Provider routing/preferences from `config.json`.
3. The effective catalog after applying any user overlay.

Providers missing required credentials or routing are skipped. `imagent doctor` reports configured providers and the models that would be available. `imagent models` and `imagent options` expose the effective catalog so scripts can avoid guessing model IDs or supported `--option key=value` settings.

## Persistence

`@imagent/persistence` owns the SQLite schema and filesystem layout. The main database stores assets, asset files, gallery items, boards, jobs, and search indexes. File paths stored in the database are relative workspace paths so the workspace can be moved as a unit. Media files and thumbnails are written through persistence helpers rather than directly by UI components.

SQLite is accessed from the Electron main process and CLI processes, not from the renderer. Desktop renderer code communicates through typed IPC contracts.

## Desktop Application

The desktop app is split into Electron main, preload, and renderer builds. Main-process services initialize configuration, catalog, persistence, provider registries, and IPC handlers. The preload layer exposes the typed IPC client to the renderer. The renderer provides workspace-oriented flows for provider setup, asset management, generation, boards, and gallery review.

Renderer state is UI state only. Durable application state is read through repositories and IPC handlers backed by the shared workspace.

## CLI Surface

The CLI is the automation surface for the same runtime services. The top-level command order is:

```text
imagent image generate <prompt>
imagent video generate <prompt>
imagent speech synthesize <text>
imagent speech voices
imagent gallery {ls|show|remix|rm|favorite}
imagent asset {add|list|show|rm}
imagent models
imagent options --provider <id> --model <id>
imagent doctor
imagent config {get|set|path|reset|provider}
imagent mcp
```

Image and speech generation wait for completion and print the completed file path. Video generation submits a provider task and prints tracking commands; `--wait` polls until completion and downloads the result. Submitted video tasks are managed with `imagent video task ...` and completed results are fetched with `imagent video download ...`.

## Security and Data Handling

Secrets are stored separately from non-sensitive preferences. The CLI and desktop app avoid printing raw API keys and prefer environment variables for one-off automation. Provider calls are made directly from the local runtime to the configured providers; imagent does not proxy requests through a project-operated service.

User-generated media, prompts, assets, and gallery metadata remain in the local workspace unless the user explicitly sends requests to configured providers or copies files elsewhere.

## Build and Validation

Workspace-level scripts are defined in the root `package.json` and package-level scripts are defined beside each package. Common validation entry points are:

```bash
bun run lint
bun run typecheck
bun run test
bun run --filter @imagent/cli build
bun run --filter @imagent/cli test
```

Desktop packaging uses Electron Builder targets for Windows, macOS, and Linux. Native modules are rebuilt for the Electron runtime before packaging or launching packaged desktop builds.

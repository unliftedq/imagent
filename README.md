# imagent

A localized image and video generation studio that ships as both an Electron desktop app (**Imagent**) and a Node CLI from one greenfield monorepo. Single-user, fully local: SQLite plus filesystem under `~/.imagent/`, no remote backend, no auth. Build reusable assets (characters / objects / backgrounds / styles), generate images and videos against six providers (OpenAI, Azure OpenAI, Google Imagen/Gemini, Flux/BFL, ByteDance for Seedream image + Seedance video, xAI Grok), organise outputs into Boards, and remix prior generations.

## Status: prototype

Personal-use prototype, not a shipped product. The schema may change between milestones — expect to wipe `~/.imagent/` between major changes if you upgrade across milestone boundaries. The Windows NSIS installer ships **unsigned** at v1; users get a SmartScreen warning on first install. There is no telemetry, no auto-update, no cloud sync.

## Quick start

```bash
# 1. Install dependencies (Bun-managed monorepo).
bun install

# 2. Verify the setup with the CLI's doctor command.
bun run --filter @imagent/cli dev doctor
# → imagent v0.0.1
# → DB:        ~/.imagent/studio.db (FTS=ok)
# → Config:    ~/.imagent/config.json (loaded)
# → Providers: 0 / 6 configured

# 3. Configure at least one provider (CLI):
bun run --filter @imagent/cli dev config set openai.apiKey sk-...

# 4. Launch the desktop app. The first launch needs an Electron-ABI rebuild
#    of the native modules (better-sqlite3 + sharp).
bun run --filter @imagent/studio rebuild
bun run --filter @imagent/studio dev
```

When switching back to the CLI or persistence tests after running the desktop app, rebuild for the host Node ABI:

```bash
( cd node_modules/.bun/better-sqlite3@*/node_modules/better-sqlite3 && npm rebuild better-sqlite3 )
```

The dual-rebuild dance is documented in [`architecture.md`](./architecture.md) §11.

## Project layout

```
imagent/
  packages/
    core/         # domain types, ports (ImageProvider, VideoProvider), JobRunner
    providers/    # six vendor impls + shared HTTP wrapper + registry factories
    persistence/  # better-sqlite3, migrations, repositories, file/thumbnail helpers
    config/       # zod schema, ConfigStore + SecretsStore (Electron / file / env)
    ipc/          # zod-validated contract, hand-rolled client/server bindings
    ui/           # Radix-wrapped primitives + Tailwind v4 composites
  apps/
    desktop/      # @imagent/studio — Imagent Electron app (3 Vite configs)
    cli/          # @imagent/cli — Commander 12, ships as a Node SEA single-file binary
```

See [`architecture.md`](./architecture.md) for the full architectural map (domain model, schema, IPC, provider catalog, build/dev/packaging).

## Configuration

User-facing config splits into three categories by sensitivity and write frequency: secrets, preferences, workspace state. Detail in [`architecture.md`](./architecture.md) §7. After the "minimum-auth" reshape, the model catalog is built into the providers package — users only configure authentication. The minimal `~/.imagent/config.json` looks like:

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
    "openai":         {},
    "azure-openai":   {},
    "google":         {},
    "flux-bfl":       {},
    "bytedance":      {},
    "xai":            {}
  }
}
```

Provider model lists come from `~/.imagent/catalog.json`. Azure OpenAI deployment names are modeled there as provider-facing offerings, for example `{ "id": "my-prod-deployment", "modelId": "gpt-image-2" }`, so the deployment can differ from the underlying model while inheriting the right capabilities.

Secrets land in `~/.imagent/secrets.json` (chmod 600) for both desktop and CLI. `OPENAI_API_KEY` and the rest can also be set as environment variables to override the file-backed values for one-off CLI runs. A `baseUrl` field is accepted in `secrets.json` for any well-known provider as an advanced override (e.g. point at a proxy); it isn't surfaced in the desktop UI.

## CLI usage

The CLI imports the same packages as the desktop main process — anything generated from the shell shows up next time the desktop opens.

```
imagent doctor                                           # health check
imagent config {get|set|path}                            # secrets + preferences
imagent image "<prompt>"    [--provider ...] [--model ...] [--ref ...]
                            [--character slug] [--object slug] [--background slug] [--style slug]
                            [--count 4] [--out dir]
imagent video <prompt>      [--provider bytedance] [--model seedance-1.0-pro]
                            [--duration 5] [--ref ...] [--character slug] [--wait]
imagent asset {add|list|rm|show} ...
imagent gallery {ls|remix|rm|favorite} ...
imagent job {status|cancel|watch} <jobId>
```

## Desktop usage

Six pages, accessible from the left sidebar:

- **Studio** — image generation. PromptComposer with provider/model selectors, asset slot pickers (character / object / background / style), parameter rail, *Generate* button, recent results strip.
- **Video Studio** — Seedance jobs with duration / fps / aspect / first-frame controls. Inline JobProgress streams `job.progress` events from the main process; jobs survive app restart and resume against Seedance's 12h server-side TTL.
- **Gallery** — masonry grid with Boards sidebar (drag-and-drop), favorites filter, and a lineage drawer showing parent / siblings / children. M8 adds a search bar backed by SQLite FTS5: type `prompt:otter` to match only the prompt column.
- **Assets** — five tabs (Characters / Objects / Backgrounds / Styles / Trash). Soft-delete archives an asset to Trash without removing files; restore from the Trash tab brings it back. Permanent delete is the second-step destructive action.
- **Providers** — the six vendors with key + endpoint fields and a Test button per row.
- **Settings** — theme, default provider, default output directory, generation concurrency, prompt history toggle.

## Building installers

```bash
# Windows NSIS installer for the desktop app.
bun run --filter @imagent/studio package
# → apps/desktop/release/Imagent Setup <version>.exe

# Single-file CLI binary (Node SEA).
bun run --filter @imagent/cli build:binary
# → apps/cli/dist/imagent.exe (host platform; ~90 MB)
```

Notes:

- **NSIS is unsigned.** A SmartScreen warning appears on first install. Code-signing requires a paid certificate and is deferred past v1.
- **macOS / Linux installers are configured but unverified** in the `electron-builder.yml` block — Windows is the v1 host.
- **The SEA binary needs adjacent `node_modules/`** holding `better-sqlite3` and `sharp`. Native modules can't be embedded in a Node SEA blob; the binary uses `createRequire` to resolve them against the workspace's installed `node_modules/` at runtime. To redistribute, ship `imagent.exe` together with at minimum `packages/persistence/node_modules/{better-sqlite3,sharp,ffmpeg-static}/`.

## License

TBD.

## Acknowledgements

[Phosphor icons](https://phosphoricons.com/), [Radix UI](https://www.radix-ui.com/), [Tailwind CSS v4](https://tailwindcss.com/), [Bun](https://bun.sh/), [Turborepo](https://turborepo.com/), [Vite](https://vite.dev/), [Electron](https://www.electronjs.org/), [Commander](https://github.com/tj/commander.js), [zod](https://zod.dev/), [zustand](https://zustand-demo.pmnd.rs/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [sharp](https://sharp.pixelplumbing.com/), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), [@dnd-kit](https://dndkit.com/).

# @imagent/studio

`@imagent/studio` is the Electron desktop application for imagent. It is intended for individual workflows that benefit from visual creation, asset management, and result curation. The desktop application shares the same `~/.imagent/` workspace as the CLI.

## Quick start

```bash
bun install
bun run --filter @imagent/studio rebuild
bun run --filter @imagent/studio dev
```

Run `rebuild` before the first launch so `better-sqlite3` and `sharp` are rebuilt for the Electron ABI.

If you later switch back to the CLI or persistence tests, rebuild `better-sqlite3` for the host Node ABI:

```bash
( cd node_modules/.bun/better-sqlite3@*/node_modules/better-sqlite3 && npm rebuild better-sqlite3 )
```

## Pages

- **Studio**: the main image and video creation workspace, including prompts, provider/model selection, generation parameters, reference images, and asset slots.
- **Gallery**: review generated results with search, favorites, Boards organization, lineage inspection, and remix workflows.
- **Assets**: manage Characters, Objects, Backgrounds, and Styles, including archive and restore flows.
- **Models**: inspect and manage the model catalog.
- **Providers**: configure keys and endpoints for OpenAI, Azure OpenAI, Google, Flux/BFL, BytePlus, 火山引擎, xAI, and other supported providers.
- **Settings**: control theme, default provider, output directory, concurrency, prompt history, and related preferences.

## Typical workflow

1. Configure at least one provider in **Providers**.
2. Register reusable characters, objects, backgrounds, or styles in **Assets**.
3. Choose the generation mode, model, parameters, and asset slots in **Studio**, then start a run.
4. Organize, favorite, search, or remix results in **Gallery**.
5. Adjust defaults such as output directory, concurrency, and UI preferences in **Settings**.

## Data location

The desktop application uses `~/.imagent/` as its default workspace:

- `studio.db`: local SQLite database.
- `config.json`: preferences and non-sensitive configuration.
- `secrets.json`: provider keys and endpoints.
- `catalog.json`: model catalog.
- `assets/`: asset files.
- `gallery/`: generated outputs.

## Build and package

```bash
bun run --filter @imagent/studio typecheck
bun run --filter @imagent/studio build
bun run --filter @imagent/studio package
```

`package` rebuilds native modules, runs the frontend build, and then creates the Windows NSIS installer. The installer is currently unsigned and may trigger a SmartScreen warning on first install. macOS and Linux packaging remain configured but are not yet validated as primary release targets.

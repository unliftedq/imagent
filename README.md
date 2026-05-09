# imagent

**imagent** means **imagine agent**: a local-first image and video generation workspace for individual creators, automation-heavy workflows, and AI agents.

It ships as a desktop application, a command-line tool, and an installable agent skill. All surfaces share the same local workspace, provider configuration, asset library, generated outputs, and result history.

[Documentation](https://unliftedq.github.io/imagent/docs) · [Desktop app](./apps/desktop/README.md) · [CLI](./apps/cli/README.md) · [Architecture](./architecture.md)

## Why imagent?

| Capability | What it gives you |
| --- | --- |
| **Local-first workspace** | Data lives under `~/.imagent/`, including SQLite state, configuration, assets, and generated outputs. No remote account or backend is required. |
| **One library across interfaces** | The desktop app, CLI, and agent integrations work against the same gallery, boards, favorites, and reusable assets. |
| **Multi-provider generation** | OpenAI, Azure OpenAI, Google Imagen/Gemini, Flux/BFL, ByteDance Seedream/Seedance, and xAI Grok can be configured side by side. |
| **Asset-driven creation** | Reusable characters, objects, backgrounds, styles, and references help keep ongoing projects visually consistent. |
| **Agent-ready automation** | The bundled skill lets compatible agents call the `imagent` CLI instead of using a one-off image or video tool. |

## Quick start

Install the CLI:

```bash
npm install -g @imagent/cli
imagent doctor
```

Generate with defaults:

```bash
imagent image "minimal product photo of a ceramic mug"
imagent video "a slow dolly shot through a rainy alley"
```

Need setup details, provider configuration, desktop installation, or troubleshooting? Visit the documentation site:

<https://unliftedq.github.io/imagent/docs>

## Agent skill integration

The repository includes a ready-to-install skill at [`skills/imagent`](./skills/imagent). Install it into any compatible agent runtime, then make sure the `imagent` CLI is available on that agent's `PATH`.

```bash
npx skills add unliftedq/imagent
```

Use the same install flow for Claude Code, Codex, OpenClaw, Hermes, or other compatible agents. After installation, the agent can run `imagent doctor` to decide whether to use the shared local gallery and configured providers, or fall back to another generation tool when imagent is not configured.

## Typical workflows

- Build a local AI-assisted visual creation workflow for individual use.
- Compare image and video outputs across multiple generation providers.
- Maintain reusable characters, styles, and reference-image assets over time.
- Combine terminal automation with desktop-based review and curation.
- Let coding agents generate creative assets through the same audited CLI workflow.

## Project structure

```text
imagent/
  apps/
    desktop/      # @imagent/studio, Electron desktop application
    cli/          # @imagent/cli, command-line interface
  packages/
    core/         # domain types, ports, and job runtime logic
    providers/    # provider adapters and model catalog
    persistence/  # SQLite, migrations, repositories, file and thumbnail handling
    config/       # configuration and secret management
    ipc/          # desktop IPC contract
    ui/           # shared UI components
```

## Current status

imagent remains in an early stage. Data structures, packaging, and parts of the feature set may continue to evolve. The current version does not include telemetry, automatic updates, cloud sync, or account systems. The Windows installer is unsigned and may trigger a SmartScreen warning on first launch.

## License

TBD.

## Acknowledgements

[Phosphor icons](https://phosphoricons.com/), [Radix UI](https://www.radix-ui.com/), [Tailwind CSS v4](https://tailwindcss.com/), [Bun](https://bun.sh/), [Turborepo](https://turborepo.com/), [Vite](https://vite.dev/), [Electron](https://www.electronjs.org/), [Commander](https://github.com/tj/commander.js), [zod](https://zod.dev/), [zustand](https://zustand-demo.pmnd.rs/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [sharp](https://sharp.pixelplumbing.com/), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), [@dnd-kit](https://dndkit.com/).

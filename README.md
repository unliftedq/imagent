# imagent

imagent takes its name from **imagine agent** and is designed as a local-first image and video generation studio for individual creators.

The project ships as both a desktop application and a command-line tool, sharing the same core capabilities, configuration, asset library, and local workspace. It enables users to manage reusable characters, objects, backgrounds, and styles, connect multiple generation providers, and organize, search, and remix generated results.

## Core capabilities

- **Local-first by default**: data lives under `~/.imagent/`, including the SQLite database, configuration, assets, and generated outputs, with no required remote backend.
- **Consistent across interfaces**: the desktop application and CLI share one workspace, so content created in either interface remains available in the other.
- **Multi-provider support**: works with OpenAI, Azure OpenAI, Google Imagen/Gemini, Flux/BFL, ByteDance Seedream/Seedance, and xAI Grok for image and video generation.
- **Asset-driven workflows**: reusable characters, objects, backgrounds, and styles help maintain consistency across ongoing creative projects.
- **Result management**: Gallery, Boards, favorites, search, and lineage views support review, retrieval, and remix workflows.

## Typical use cases

- Building a local AI-assisted visual creation workflow for individual use.
- Comparing outputs across multiple generation providers within one workspace.
- Maintaining reusable character, style, and reference-image assets over time.
- Combining terminal automation with desktop-based review and curation.

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

## Documentation entry points

- User documentation:
  [`Quick Start`](./docs/quick-start.md),
  [`Installation`](./docs/installation.md),
  [`Updates`](./docs/updates.md),
  [`CLI Usage`](./docs/cli.md),
  [`Providers`](./docs/providers.md),
  [`Configuration`](./docs/configuration.md),
  [`Best Practices`](./docs/best-practices.md)
- Desktop application: [`apps/desktop/README.md`](./apps/desktop/README.md)
- CLI: [`apps/cli/README.md`](./apps/cli/README.md)
- Architecture overview: [`architecture.md`](./architecture.md)

## Current status

imagent remains in an early stage. Data structures, packaging, and parts of the feature set may continue to evolve. The current version does not include telemetry, automatic updates, cloud sync, or account systems. The Windows installer is unsigned and may trigger a SmartScreen warning on first launch.

## License

TBD.

## Acknowledgements

[Phosphor icons](https://phosphoricons.com/), [Radix UI](https://www.radix-ui.com/), [Tailwind CSS v4](https://tailwindcss.com/), [Bun](https://bun.sh/), [Turborepo](https://turborepo.com/), [Vite](https://vite.dev/), [Electron](https://www.electronjs.org/), [Commander](https://github.com/tj/commander.js), [zod](https://zod.dev/), [zustand](https://zustand-demo.pmnd.rs/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [sharp](https://sharp.pixelplumbing.com/), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), [@dnd-kit](https://dndkit.com/).

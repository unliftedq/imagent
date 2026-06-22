<p align="center">
  <img src="./assets/banner.png" alt="Imagent" width="100%">
</p>

<p align="center">English · <a href="./README.zh-CN.md">简体中文</a></p>

**Imagent** means **Imagine agent**: it gives AI agents the ability to generate images, video, and speech as a first-class step in their workflows, behind a single interface that hides the differences between providers and models — and it keeps every generated asset organized for reuse instead of throwing it away.

It ships as a command-line tool and a desktop application. All surfaces share the same local workspace, unified provider interface, asset library, generated outputs, and result history.

[Documentation](https://unliftedq.github.io/imagent/docs) · [Desktop app](./apps/desktop/README.md) · [CLI](./apps/cli/README.md) · [Architecture](./architecture.md)

<p align="center">
  <a href="https://youtu.be/qeZXnmGw_8s">
    <img src="./assets/youtube_thumbnail.png" alt="Watch Imagent on YouTube" width="100%">
  </a>
</p>

## Why imagent?

Most agents can reason and write code, but they can't *create* images, video, or audio — and the ad-hoc scripts people wire up for it are throwaway, provider-locked, and forget every asset the moment they finish. Imagent solves three problems at once:

| | What it gives you |
| --- | --- |
| **Generation as an agent capability** | The bundled skill lets any compatible agent call the `imagent` CLI to generate images, video, and speech as a native step in its workflow — no bespoke per-tool integration, no one-off glue code. |
| **One interface, every provider and model** | OpenAI, Azure OpenAI, Google Imagen/Gemini, Flux/BFL, BytePlus / 火山引擎 Seedream/Seedance, xAI Grok, MiniMax TTS, and ElevenLabs TTS sit behind a single, consistent interface. Users and agents swap providers or models without rewriting prompts, parameters, or calling conventions. |
| **Assets that outlive the prompt** | Every generated image, video, and clip — plus reusable characters, objects, backgrounds, styles, and references — is captured in a managed local library. Curate, search, and reuse outputs across projects instead of regenerating them from scratch. |

## Quick start

Install the CLI:

```bash
npm install -g @imagent/cli
imagent doctor
```

Install the desktop app:

- Download the macOS or Windows installer from the [latest release](https://github.com/unliftedq/imagent/releases/latest).
- The desktop app is not signed yet. On macOS, remove quarantine before opening the app:

  ```bash
  xattr -cr Imagent.app
  ```

- On Windows, bypass the SmartScreen warning by choosing **More info** → **Run anyway**.

Generate with defaults:

```bash
imagent image generate "minimal product photo of a ceramic mug"
imagent video generate "a slow dolly shot through a rainy alley"
imagent speech synthesize "Welcome to imagent, your local creative workspace."
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

- Give a coding or automation agent the ability to produce visual and audio assets mid-task, through one audited CLI.
- Switch between providers and models for the same prompt without changing how you call them.
- Build up a reusable library of characters, styles, and reference assets that compounds across projects.
- Curate and revisit everything an agent generated, instead of losing it once the script exits.
- Combine terminal automation with desktop-based review and curation over a shared local workspace.

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

imagent remains in an early stage. Data structures, packaging, and parts of the feature set may continue to evolve. The current version does not include telemetry, automatic updates, cloud sync, or account systems. Desktop packages are unsigned, so macOS may require removing quarantine and Windows may show a SmartScreen warning on first launch.

## License

By contributing to imagent, you agree that your contributions will be licensed under the project's [Apache License 2.0](./LICENSE). You also confirm that you have the right to submit the work under that license.

## Acknowledgements

[Phosphor icons](https://phosphoricons.com/), [Radix UI](https://www.radix-ui.com/), [Tailwind CSS v4](https://tailwindcss.com/), [Bun](https://bun.sh/), [Turborepo](https://turborepo.com/), [Vite](https://vite.dev/), [Electron](https://www.electronjs.org/), [Commander](https://github.com/tj/commander.js), [zod](https://zod.dev/), [zustand](https://zustand-demo.pmnd.rs/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [sharp](https://sharp.pixelplumbing.com/), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), [@dnd-kit](https://dndkit.com/).

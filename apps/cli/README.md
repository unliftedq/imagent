# @imagent/cli

`@imagent/cli` is the command-line entry point for imagent. It is intended for generation, configuration, asset management, result inspection, and automation workflows in the terminal. The CLI shares the same `~/.imagent/` workspace as the desktop application, so content created or updated from the command line is available in the desktop app as well.

## Quick start

```bash
bun install
bun run --filter @imagent/cli dev doctor
```

Configure at least one provider key:

```bash
bun run --filter @imagent/cli dev config set openai.apiKey sk-...
```

Generate an image:

```bash
bun run --filter @imagent/cli dev image "a cinematic portrait of a red fox"
```

Generate a video:

```bash
bun run --filter @imagent/cli dev video "a slow camera move through a neon city" --provider bytedance --wait
```

## Common commands

```text
imagent doctor
imagent config {get|set|path}
imagent catalog {path|show|reset}
imagent image "<prompt>" [--provider <id>] [--model <id>] [--count <n>] [--out <dir>]
imagent video "<prompt>" [--provider <id>] [--model <id>] [--duration <sec>] [--wait]
imagent asset {add|list|show|rm}
imagent gallery {ls|show|remix|rm|favorite}
imagent job {ls|status|cancel|watch}
imagent mcp
```

## Configuration

Configuration files live under `~/.imagent/` by default:

- `config.json`: preferences and non-sensitive configuration.
- `secrets.json`: provider keys and endpoint settings, written with `chmod 600` by default.
- `catalog.json`: available providers, models, and capability catalog.

Show the active paths:

```bash
bun run --filter @imagent/cli dev config path
bun run --filter @imagent/cli dev catalog path
```

Environment variables can override matching secrets for one-off runs, for example:

```bash
OPENAI_API_KEY=sk-... imagent image "minimal product photo"
```

## Image generation

```bash
imagent image "prompt" \
  --provider openai \
  --model gpt-image-1 \
  --count 2 \
  --aspect 1:1 \
  --character hero \
  --style watercolor \
  --out ./outputs
```

Common options:

- `--provider`, `--model`: choose the provider and model.
- `--count`: set the number of outputs.
- `--size`, `--aspect`, `--seed`, `--negative`: model-specific generation parameters.
- `--ref`: attach one or more reference images.
- `--character`, `--object`, `--background`, `--style`: attach registered assets.
- `--out`: override the default output directory.

## Video generation

```bash
imagent video "prompt" \
  --provider bytedance \
  --model seedance-1.0-pro \
  --duration 5 \
  --aspect 16:9 \
  --ref ./first-frame.png \
  --wait
```

`--wait` blocks the command and streams job progress. Without it, the job can be followed later with `imagent job watch <jobId>`.

## Asset and result management

Add assets:

```bash
imagent asset add character --name "Nova" --description "main character" --ref ./nova.png
imagent asset add style --name "Soft watercolor" --prompt "soft watercolor, muted palette"
```

Inspect and reuse results:

```bash
imagent gallery ls --search "prompt:fox"
imagent gallery show <itemId>
imagent gallery remix <itemId> --prompt-suffix "at sunset"
imagent gallery favorite <itemId>
```

## Build

```bash
bun run --filter @imagent/cli build
bun run --filter @imagent/cli test
```

The npm CLI entry point is written to `apps/cli/dist/cli.js`. The build bundles the internal `@imagent/*` workspace packages into that file, while third-party runtime dependencies such as `better-sqlite3`, `sharp`, provider SDKs, and `commander` remain normal npm dependencies installed alongside the package.

The experimental Node SEA binary build is still available with:

```bash
bun run --filter @imagent/cli build:binary
```

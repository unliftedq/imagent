# @imagent/cli

`@imagent/cli` is the command-line entry point for imagent. It is intended for generation, configuration, asset management, result inspection, and automation workflows in the terminal. The CLI shares the same `~/.imagent/` workspace as the desktop application, so content created or updated from the command line is available in the desktop app as well.

## Quick start

Install the CLI globally:

```bash
npm install -g @imagent/cli
imagent doctor
```

Or run it without installing:

```bash
npx -y @imagent/cli doctor
```

Configure at least one provider key:

```bash
imagent config set openai.apiKey sk-...
```

Generate an image:

```bash
imagent image "a cinematic portrait of a red fox"
```

Generate a video:

```bash
imagent video "a slow camera move through a neon city" --provider bytedance --wait
```

## Common commands

```text
imagent doctor
imagent models [--kind image|video] [--provider <id>] [--configured]
imagent options --provider <id> --model <id> [--kind image|video]
imagent config {get|set|path|reset <catalog|secrets|config>}
imagent image "<prompt>" [--provider <id>] [--model <id>] [--option k=v ...] [--out <dir>]
imagent video "<prompt>" [--provider <id>] [--model <id>] [--option k=v ...] [--wait]
imagent asset {add|list|show|rm}
imagent gallery {ls|show|remix|rm|favorite}
imagent job {ls|status|cancel|watch}
imagent mcp
```

## Configuration

Configuration files live under `~/.imagent/` by default:

- `config.json`: preferences and non-sensitive provider routing such as endpoints and base URLs.
- `secrets.json`: provider API keys only, written with `chmod 600` by default.
- `catalog.json`: available providers, models, and capability catalog.

Show the active paths (config.json, catalog.json, and secrets.json):

```bash
imagent config path
```

Reset a state file when you need to start clean (`--force` skips the y/N prompt):

```bash
imagent config reset catalog --force   # bundled-default model catalog
imagent config reset secrets           # clear all stored credentials
imagent config reset config            # restore default preferences
```

Environment variables can override matching secrets for one-off runs, for example:

```bash
OPENAI_API_KEY=sk-... imagent image "minimal product photo"
```

## Discovering providers, models, and options

```bash
imagent doctor                                 # what's configured + which models would be exposed
imagent models --kind image --configured       # provider × model inventory (filterable)
imagent options --provider openai --model gpt-image-2  # model's exact request options + defaults
```

`imagent options` is the canonical way to learn which `--option key=value` pairs (e.g. `size`, `quality`, `aspectRatio`, `durationSec`) a given model accepts before invoking `imagent image|video`.

## Image generation

```bash
imagent image "prompt" \
  --provider openai \
  --model gpt-image-2 \
  --option size=1024x1024 \
  --option count=2 \
  --character hero \
  --style watercolor \
  --out ./outputs
```

Common options:

- `--provider`, `--model`: choose the provider and model (see `imagent models`).
- `--option key=value` (repeatable): model capability options like `size`, `aspectRatio`, `quality`, `outputFormat`, `count`, `seed`, `negativePrompt`. Run `imagent options --provider <id> --model <id>` for the exact list.
- `--ref`: attach one or more reference images.
- `--character`, `--object`, `--background`, `--style`: attach registered assets by slug.
- `--out`: copy the completed result to a local directory (the gallery copy is always retained).

## Video generation

```bash
imagent video "prompt" \
  --provider bytedance \
  --model doubao-seedance-1-0-pro-250528 \
  --option durationSec=5 \
  --option aspectRatio=16:9 \
  --ref ./first-frame.png \
  --wait
```

`--wait` blocks the command and streams job progress. Without it, the job runs in the background and can be followed later with `imagent job watch <jobId>`.

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

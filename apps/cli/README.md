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
imagent config {get|set|path}
imagent catalog {path|show|reset}
imagent providers [--kind image|video] [--json]
imagent models [--provider <id>] [--kind image|video] [--json]
imagent options [--provider <id>] [--model <id>] [--kind image|video] [--json]
imagent image "<prompt>" [--provider <id>] [--model <id>] [--option <key=value>] [--out <dir>]
imagent video "<prompt>" [--provider <id>] [--model <id>] [--option <key=value>] [--wait]
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
imagent config path
imagent catalog path
```

Environment variables can override matching secrets for one-off runs, for example:

```bash
OPENAI_API_KEY=sk-... imagent image "minimal product photo"
```

Discover providers, model ids, and exact model options without reading the underlying catalog files:

```bash
imagent providers --json
imagent models --provider openai
imagent options --provider openai --model gpt-image-2
```

## Image generation

```bash
imagent image "prompt" \
  --provider openai \
  --model gpt-image-2 \
  --option count=2 \
  --option size=1024x1024 \
  --character hero \
  --style watercolor \
  --out ./outputs
```

Common options:

- `--provider`, `--model`: choose the provider and model.
- `--option key=value`: set model-specific generation parameters shown by `imagent options`.
- `--ref`: attach one or more reference images.
- `--character`, `--object`, `--background`, `--style`: attach registered assets.
- `--out`: override the default output directory.

## Video generation

```bash
imagent video "prompt" \
  --provider bytedance \
  --model seedance-1.0-pro \
  --option durationSec=5 \
  --option aspectRatio=16:9 \
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

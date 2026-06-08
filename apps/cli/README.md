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
imagent image generate "a cinematic portrait of a red fox"
```

Generate a video:

```bash
imagent video generate "a slow camera move through a neon city" --provider volcengine
```

Generate speech:

```bash
imagent speech synthesize "Welcome to imagent" --provider elevenlabs
```

## Common commands

```text
imagent image generate "<prompt>" [--provider <id>] [--model <id>] [--option k=v ...] [--out <dir>]
imagent video generate "<prompt>" [--provider <id>] [--model <id>] [--option k=v ...] [--wait [--out <dir>]]
imagent video task ls [--state <state>] [--limit <n>]
imagent video task get --id <jobId>
imagent video task cancel --id <jobId>
imagent video download [jobId] [--out <dir>]
imagent speech synthesize "<text>" [--provider <id>] [--model <id>] [--option k=v ...] [--out <dir>]
imagent speech voices --provider <id> [--model <id>] [--json]
imagent gallery {ls|show|remix|rm|favorite}
imagent asset {add|list|show|rm}
imagent models [--kind image|video|speech] [--provider <id>] [--configured]
imagent options --provider <id> --model <id> [--kind image|video|speech]
imagent doctor
imagent config {get|set|path|reset <catalog|secrets|config>}
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
imagent config reset catalog --force   # remove user catalog overlay
imagent config reset secrets           # clear all stored credentials
imagent config reset config            # restore default preferences
```

Environment variables can override matching secrets for one-off runs, for example:

```bash
OPENAI_API_KEY=sk-... imagent image generate "minimal product photo"
```

## Discovering providers, models, and options

```bash
imagent doctor                                 # what's configured + which models would be exposed
imagent models --kind image --configured       # provider × model inventory (filterable)
imagent options --provider openai --model gpt-image-2  # model's exact request options + defaults
```

`imagent options` is the canonical way to learn which `--option key=value` pairs (e.g. `size`, `quality`, `aspectRatio`, `durationSec`, `voice`) a given model accepts before invoking `imagent image generate`, `imagent video generate`, or `imagent speech synthesize`.

## Image generation

```bash
imagent image generate "prompt" \
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
- `--option key=value` (repeatable): model capability options like `size`, `aspectRatio`, `quality`, `outputFormat`, `count`. Run `imagent options --provider <id> --model <id>` for the exact list.
- `--ref`: attach one or more reference images.
- `--character`, `--object`, `--background`, `--style`: attach registered assets by slug.
- `--out`: copy the completed result to a local directory (the gallery copy is always retained).

## Video generation

```bash
imagent video generate "prompt" \
  --provider volcengine \
  --model doubao-seedance-2-0-260128 \
  --option durationSec=5 \
  --option aspectRatio=16:9 \
  --ref ./first-frame.png \
  --wait
```

By default the command exits after the provider accepts the job and prints the job id for later tracking. Pass `--wait` to poll until completion and download the video into the gallery.

### Managing video tasks

After submission without `--wait`, use these commands to track and retrieve results:

```bash
imagent video task ls                  # list submitted video jobs
imagent video task get --id <jobId>         # show status of a specific job
imagent video task cancel --id <jobId>      # cancel a running job
imagent video download <jobId> --out ./videos  # wait for completion and download
```

## Speech generation

```bash
imagent speech synthesize "Welcome to imagent" \
  --provider elevenlabs \
  --option voice=Rachel \
  --option outputFormat=mp3 \
  --out ./speech
```

Speech (text-to-speech) generation waits for completion and prints the result path. List the voices a provider/model exposes before picking one:

```bash
imagent speech voices --provider elevenlabs           # list of available voices
imagent speech voices --provider minimax --json        # machine-readable output
```

Common options (validated per model — run `imagent options --provider <id> --model <id> --kind speech` for the exact set): `voice`, `speed`, `outputFormat`. Provider-specific extras are passed through.

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

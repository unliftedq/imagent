---
description: Use IMAGENT from scripts for provider setup, generation jobs, gallery queries, and maintenance.
---

# CLI Usage

### Command overview

```text
imagent image generate <prompt> [--provider <id>] [--model <id>] [--option k=v ...] [--out <dir>]
imagent video generate <prompt> [--provider <id>] [--model <id>] [--option k=v ...] [--wait [--out <dir>]]
imagent video task ls [--state <state>] [--limit <n>]
imagent video task get --id <jobId>
imagent video task cancel --id <jobId>
imagent video download [jobId] [--out <dir>]
imagent gallery {ls|show|remix|rm|favorite}
imagent asset {add|list|show|rm}
imagent models [--kind image|video] [--provider <id>] [--configured] [--json]
imagent options --provider <id> --model <id> [--kind image|video] [--json]
imagent doctor
imagent config {get|set|path|reset}
imagent mcp
```

### Health checks

```bash
imagent doctor
```

`doctor` verifies the workspace, database, FTS tables, and config file, and prints each catalog provider with the concrete image/video models it would expose plus a configured/missing-credentials marker. It does not perform provider network calls.

### Discovery commands

List every provider/model pair the catalog advertises:

```bash
imagent models
imagent models --kind image
imagent models --provider openai --json
imagent models --configured           # only providers with credentials
```

Inspect the request options, defaults, and reference limits for a specific model:

```bash
imagent options --provider openai --model gpt-image-2
imagent options --provider google --model veo-3.0-generate-001 --kind video --json
```

Use `imagent options` before crafting an `imagent image` or `imagent video` invocation — it lists the exact `--option key=value` pairs and allowed values for that model.

### Configuration commands

Print active paths:

```bash
imagent config path
```

Set a provider secret:

```bash
imagent config set openai.apiKey sk-...
imagent config set bytedance.endpoint https://ark.cn-beijing.volces.com/api/v3
```

Read provider secrets with API keys masked:

```bash
imagent config get
imagent config get openai.apiKey
```

The CLI config command writes API keys to `secrets.json` and non-sensitive routing fields such as `endpoint` / `baseUrl` to `config.json` under `providers.<id>`. General app preferences such as theme, default output directory, default provider, and concurrency are managed by the desktop **Settings** page or by carefully editing the local workspace `config.json` file.

Reset a state file when you need to start clean:

```bash
imagent config reset catalog          # restore the bundled-default model catalog
imagent config reset secrets          # clear all stored credentials
imagent config reset config           # restore default preferences
imagent config reset catalog --force  # skip the y/N prompt
```

The catalog defines supported models, model capabilities, and bundled provider-facing model IDs. Azure OpenAI deployment names and custom provider model mappings live in `config.json` under `providers.<id>` / `providers.customOpenAI.<id>` and overlay the catalog at runtime. Manage them with `imagent config provider add|rm|list` or the desktop **Providers** page, and use `imagent models` / `imagent options` to inspect the effective result.

### Image generation

Basic image generation:

```bash
imagent image generate "minimal product photo of a ceramic mug"
```

Select provider and model:

```bash
imagent image generate "editorial fashion portrait" \
  --provider google \
  --model gemini-2.5-flash-image
```

Pass model options with repeatable `--option key=value` flags:

```bash
imagent image generate "studio portrait, soft rim light" \
  --provider openai \
  --model gpt-image-2 \
  --option size=1024x1536 \
  --option quality=high \
  --option outputFormat=png \
  --option count=2
```

Common image options are:

- `size`
- `aspectRatio` or alias `aspect`
- `quality`
- `outputFormat` or alias `format`
- `count`
- `raw.<vendorOption>` for advanced provider-specific values

Options are validated against the selected model's catalog capabilities.

Attach references and reusable assets:

```bash
imagent image generate "Nova exploring a glass greenhouse" \
  --character nova \
  --style watercolor \
  --ref ./moodboard.png
```

Copy the completed result to a specific directory:

```bash
imagent image generate "poster art for a synthwave festival" --out ./outputs
```

### Video generation

Basic video generation:

```bash
imagent video generate "a slow dolly shot through a rainy alley"
```

Select provider, model, and options:

```bash
imagent video generate "a crane shot over a futuristic coastline" \
  --provider google \
  --model veo-3.0-generate-001 \
  --option durationSec=8 \
  --option resolution=720p
```

Common video options are:

- `durationSec` or alias `duration`
- `fps`
- `resolution`
- `firstFrame`
- `lastFrame`
- `raw.<vendorOption>` for advanced provider-specific values

Attach reference images and assets:

```bash
imagent video generate "Nova turns toward the camera as leaves drift past" \
  --provider bytedance \
  --character nova \
  --ref ./first-frame.png \
  --option duration=5
```

Wait for completion inline:

```bash
imagent video generate "a quiet sunrise timelapse over mountains" --provider xai --wait
```

Submit without waiting, then track and download:

```bash
imagent video generate "a quiet sunrise timelapse over mountains" --provider xai
imagent video task ls
imagent video task get --id <jobId>
imagent video task cancel --id <jobId>
imagent video download <jobId> --out ./videos
```

Video task commands accept unique ID prefixes of at least 6 characters.

### Asset management

Assets help keep recurring characters, objects, backgrounds, and styles consistent.

Supported asset kinds:

- `character`
- `object`
- `background`
- `style`

Add a character, object, or background with one reference image:

```bash
imagent asset add character \
  --name "Nova" \
  --description "main character, silver jacket" \
  --ref ./nova.png
```

Add a style with a prompt snippet, a reference image, or both:

```bash
imagent asset add style \
  --name "Soft watercolor" \
  --prompt "soft watercolor, muted palette, paper texture"
```

List and inspect assets:

```bash
imagent asset list
imagent asset list --kind character
imagent asset list --search "watercolor"
imagent asset show <assetId>
```

Delete an asset:

```bash
imagent asset rm <assetId>
imagent asset rm <assetId> --force
```

When generating, attach assets by slug or ID:

```bash
imagent image generate "portrait in a moonlit forest" --character nova --style soft-watercolor
```

Style assets append their prompt snippet to the generation prompt. Asset reference images are added to the request and capped according to the selected model's catalog capabilities.

### Gallery management

List generated results:

```bash
imagent gallery ls
imagent gallery ls --kind image
imagent gallery ls --provider openai
imagent gallery ls --favorite
imagent gallery ls --search "fox"
```

Show a result:

```bash
imagent gallery show <itemId>
```

Favorite or unfavorite:

```bash
imagent gallery favorite <itemId>
imagent gallery favorite <itemId> --off
```

Remix an existing result:

```bash
imagent gallery remix <itemId> --prompt-suffix "at sunset"
```

Delete a result and its file:

```bash
imagent gallery rm <itemId>
imagent gallery rm <itemId> --force
```

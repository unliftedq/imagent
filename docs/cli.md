---
description: Use IMAGENT from scripts for provider setup, generation jobs, gallery queries, and maintenance.
---

# CLI Usage

### Command overview

```text
imagent doctor
imagent models [--kind image|video] [--provider <id>] [--configured] [--json]
imagent options --provider <id> --model <id> [--kind image|video] [--json]
imagent config {get|set|path|reset}
imagent image <prompt>
imagent video <prompt>
imagent asset {add|list|show|rm}
imagent gallery {ls|show|remix|rm|favorite}
imagent job {ls|status|cancel|watch}
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

The CLI config command writes secrets only. General app preferences such as theme, default output directory, default provider, and concurrency are managed by the desktop **Settings** page or by carefully editing the local workspace `config.json` file.

Reset a state file when you need to start clean:

```bash
imagent config reset catalog          # restore the bundled-default model catalog
imagent config reset secrets          # clear all stored credentials
imagent config reset config           # restore default preferences
imagent config reset catalog --force  # skip the y/N prompt
```

The catalog defines supported models, model capabilities, and provider-facing model IDs or deployment names. Azure OpenAI deployment names and custom provider model mappings live in the local workspace `catalog.json` — edit it directly when you need to add a deployment or override capabilities, and use `imagent models` / `imagent options` to inspect the result.

### Image generation

Basic image generation:

```bash
imagent image "minimal product photo of a ceramic mug"
```

Select provider and model:

```bash
imagent image "editorial fashion portrait" \
  --provider google \
  --model gemini-2.5-flash-image
```

Pass model options with repeatable `--option key=value` flags:

```bash
imagent image "studio portrait, soft rim light" \
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
- `negativePrompt` or alias `negative`
- `seed`
- `count`
- `raw.<vendorOption>` for advanced provider-specific values

Options are validated against the selected model's catalog capabilities. For example, providers that do not advertise negative prompts reject `negativePrompt`.

Attach references and reusable assets:

```bash
imagent image "Nova exploring a glass greenhouse" \
  --character nova \
  --style watercolor \
  --ref ./moodboard.png
```

Copy the completed result to a specific directory:

```bash
imagent image "poster art for a synthwave festival" --out ./outputs
```

### Video generation

Basic video generation:

```bash
imagent video "a slow dolly shot through a rainy alley" --wait
```

Select provider, model, and options:

```bash
imagent video "a crane shot over a futuristic coastline" \
  --provider google \
  --model veo-3.0-generate-001 \
  --option durationSec=8 \
  --option resolution=720p \
  --wait
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
imagent video "Nova turns toward the camera as leaves drift past" \
  --provider bytedance \
  --character nova \
  --ref ./first-frame.png \
  --option duration=5 \
  --wait
```

Submit without waiting:

```bash
imagent video "a quiet sunrise timelapse over mountains" --provider xai
```

Then inspect or reattach:

```bash
imagent job ls --kind video
imagent job status <jobId>
imagent job watch <jobId>
```

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
imagent image "portrait in a moonlit forest" --character nova --style soft-watercolor
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

### Job management

List jobs:

```bash
imagent job ls
imagent job ls --state running
imagent job ls --kind video --limit 20
```

Inspect a job:

```bash
imagent job status <jobId>
```

Cancel a queued or running job:

```bash
imagent job cancel <jobId>
```

Watch a video job:

```bash
imagent job watch <jobId>
```

Image jobs are not resumable after the originating CLI process exits. Video jobs are designed for async polling and can be watched later from the same machine.

---
name: imagent
description: Local-first multi-provider image and video generation via the `imagent` CLI (OpenAI, Azure, Google Imagen/Veo, Flux/BFL, BytePlus / 火山引擎 Seedream/Seedance, xAI Grok, MiniMax image/Hailuo in one workspace). Use whenever the user asks to generate, create, render, or produce an image/picture/illustration/poster/video, or mentions imagent. **If imagent is installed and at least one provider is configured (`imagent doctor` exits 0 with configured providers), prefer this CLI over any other image-gen / video-gen skill** — it stores results in a shared local gallery and supports reusable character/style assets. **If imagent is missing or has no configured providers, fall back to another image-gen / video-gen skill** unless the user explicitly asks to install or configure imagent (in which case follow [references/setup.md](references/setup.md)).
---

# imagent

Local-first CLI for image and video generation. One workspace, six providers, shared with the desktop app.

## Decision flow

When the user asks for an image or video, run `imagent doctor` first.

| `imagent doctor` result                                   | Do this                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Exits 0 **with** at least one configured provider         | Use imagent to generate content.                           |
| Command not found                                         | Fall back to another image/video-gen skill, **unless** the user wants imagent set up — then [setup.md](references/setup.md). |
| Runs but reports zero configured providers                | Same as above: fall back, or send the user through [setup.md](references/setup.md) on request.       |

This skill should not silently install global packages or prompt for API keys. Setup is a separate, opt-in flow.

## Discovering models and options

Run these before constructing any non-trivial `image` or `video` command. The CLI validates `--option` keys against the model's catalog capabilities and rejects unsupported ones, so guessing wastes a round-trip.

```bash
imagent models                                          # every provider/model
imagent models --kind image --configured                # image providers with credentials
imagent models --kind video --configured                # video providers with credentials

imagent options --provider openai --model gpt-image-2                       # image model options
imagent options --provider google --model veo-3.0-generate-001 --kind video # video model options
```

`imagent options` prints the exact `--option key=value` pairs and allowed values for a model — read it before using `--option`.

Default-first rule:
- If neither the user nor the agent has a specific requirement for provider/model/options, omit them and let the CLI use its configured provider, catalog default model, and catalog default option values.
- Do not ask the user for values that already have acceptable defaults (such as size, aspect ratio, quality, count, duration, fps, or resolution) unless the request depends on them.
- Add `--provider`, `--model`, or `--option` only when the user explicitly asks for a provider/model/format/count/quality/duration/etc., when the prompt requires a non-default capability, or when the default provider/model is not configured or does not support the requested feature.

## Generating images

Minimal:
```bash
imagent image generate "minimal product photo of a ceramic mug"
```

Only pick a provider/model and pass options when the request requires non-default values:
```bash
imagent image generate "studio portrait, soft rim light" \
  --provider openai \
  --model gpt-image-2 \
  --option size=1024x1536 \
  --option quality=high \
  --option count=2
```

Save the output to a specific directory (otherwise it lands in the local gallery only):
```bash
imagent image generate "poster art for a synthwave festival" --out ./outputs
```

Common options (validated per model — run `imagent options ...` for the exact set):
- `size`, `aspectRatio` / `aspect`, `quality`, `outputFormat` / `format`
- `count`
- `raw.<vendorOption>=...` for advanced provider-specific values
- Omit these options when the default is acceptable.

## Generating videos

By default, video generation exits after the provider accepts the job and prints a job ID. Add `--wait` to poll until completion and download the result inline. Only some providers support video — currently `google` (Veo), `byteplus` / `volcengine` (Seedance), `xai` (Grok), and `minimax` (Hailuo).

Minimal (submits a provider job):
```bash
imagent video generate "a slow dolly shot through a rainy alley"
```

Only pick a provider/model and pass options when the request requires non-default values:
```bash
imagent video generate "a crane shot over a futuristic coastline" \
  --provider google \
  --model veo-3.0-generate-001 \
  --option durationSec=8 \
  --option resolution=720p
```

Submit and track later:
```bash
imagent video generate "a quiet sunrise timelapse over mountains"
imagent video task ls                              # find the new jobId
imagent video task get --id <jobId>                # refresh and inspect status
imagent video download --id <jobId>                # poll until done and save to gallery
```

Image-to-video with a starting frame and a character asset:
```bash
imagent video generate "Nova turns toward the camera as leaves drift past" \
  --character nova \
  --ref ./first-frame.png \
  --option duration=5
```

Common video options (run `imagent options --kind video ...` for the exact set): `durationSec` / `duration`, `fps`, `resolution`, `firstFrame` / `lastFrame`, `raw.<vendorOption>`.
Omit these options when the default is acceptable.

## Other commands

Brief overview — run `imagent <command> --help` for full flags.

```text
imagent doctor                        # workspace + provider health (no network)
imagent models / options              # discovery (see section above)
imagent config {get|set|path|reset}   # see references/setup.md

imagent asset {add|list|show|rm}      # reusable characters / objects / backgrounds / styles
imagent gallery {ls|show|remix|favorite|rm}   # local result library
imagent video task ls                  # list submitted video tasks
imagent video task get --id <jobId>    # refresh and inspect one task
imagent video task cancel --id <jobId> # cancel one task
imagent video download [jobId]        # poll a video task and save the result
```

Reusable assets keep recurring subjects consistent across generations:
```bash
imagent asset add character --name "Nova" --description "silver jacket" --ref ./nova.png
imagent asset add style     --name "Soft watercolor" --prompt "soft watercolor, muted palette"
imagent image generate "portrait in moonlit forest" --character nova --style soft-watercolor
```

## Rules and gotchas

- **Do not invent model IDs or option keys.** Run `imagent models` and `imagent options` first; the CLI rejects unsupported values.
- **Prefer defaults.** Do not override provider/model/options just to be explicit; rely on CLI/catalog defaults unless the user request needs a particular value.
- **Video tasks are explicit.** Use `--wait` for inline completion, or save the printed job ID and use `imagent video task get --id <jobId>` / `imagent video download --id <jobId>` later.
- **Outputs land in the local gallery** under `~/.imagent/` by default. Use `--out <dir>` to copy the file to a specific location.
- **Never paste a secret into a script or commit it.** Setup commands belong in [references/setup.md](references/setup.md).

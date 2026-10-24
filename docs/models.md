---
description: Default image, video, and speech model capabilities.
---

# Model capabilities

This page summarizes the bundled default model catalog in `packages/providers/src/catalog.default.json`. Limits are included only when provider documentation or the bundled catalog confirms them.

## October 2026 catalog review

Reviewed on **2026-10-23** against the providers' official SDKs, cookbooks, and model guides. The bundled catalog is curated: removal from imagent does **not** necessarily mean a provider has shut down that model.

| Provider | Review outcome |
| --- | --- |
| OpenAI | Added `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare`, including `xhigh` / `max` quality. Retained the still-listed GPT Image 2, 1.5, Mini and mini TTS offerings. |
| Azure | Retained verified OpenAI, MAI and FLUX deployment families. New OpenAI releases are not automatically advertised as available on Azure. Microsoft documentation could not be accessed in this review, so no unverified MAI 2.6 or Azure GPT Image 2.5 capability claims were added. |
| Google | Added Nano Banana 2.1, stable Nano Banana Pro, Nano Banana 2 Lite, Omni 1.1 Flash, Veo 3.1 Fast, and Gemini 3.8 Flash / Flash Lite TTS. Current Gemini image and speech models use Interactions rather than the legacy `generateContent` request. |
| BFL | Retained the five documented FLUX.2 image endpoints. FLUX 3 video is announced in BFL's official skills, but those sources defer to an inaccessible API reference for the endpoint and request contract; it is not advertised as supported. |
| BytePlus / 火山引擎 | Kept Seedream 5.x and Seedance 2.x. Removed legacy Seedream 4.0 / 4.5 and Seedance 1.5 from both regional offering lists. No newer exact regional IDs could be verified. |
| xAI | Added `grok-imagine-image-2.0`; retained still-listed Quality and video models. The official TypeScript SDK also lists `grok-imagine-video-1.5-lite`, but a model-specific capability matrix could not be verified, so it is not yet bundled. |
| MiniMax | Official guidance still recommends Image 01, Hailuo 2.3 and Speech 2.8; retained these models. |
| ElevenLabs | Retained the three main expressive, multilingual and low-latency offerings; removed the stale alpha label from Eleven v3. |

### Upgrading from 0.3.x

The following canonical IDs and their bundled offerings were removed. Update saved defaults, Azure/custom-provider mappings, scripts and catalog overlays before generating. Existing gallery outputs and jobs are not rewritten.

| Removed ID | Replacement |
| --- | --- |
| `gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview` | `gemini-nano-banana-2.1` (or `gemini-3.1-flash-lite-image` for lower latency) |
| `gemini-3-pro-image-preview` | `gemini-3-pro-image` |
| `gemini-3.1-flash-tts-preview` | `gemini-3.8-flash-tts` or `gemini-3.8-flash-lite-tts` |
| `veo-3.0-generate-001`, `veo-3.0-fast-generate-001` | `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview` |
| `seedream-4-0-250828`, `seedream-4-5-251128` | `seedream-5-0-260128` or `dola-seedream-5-0-pro-260628` |
| `seedance-1-5-pro-251215` | `dreamina-seedance-2-0-260128` or `dreamina-seedance-2-5-260628` |

For 火山引擎, replace the corresponding `doubao-` offering with the regional ID shown below. Google's official migration guide marks `gemini-3.1-flash-image` deprecated with shutdown on **2026-10-29**, so that intermediate stable model is deliberately not added. Veo 3.0 and the older Ark models are removed as legacy catalog choices, not asserted to be shut down upstream. Explicitly configured legacy models can still be supplied with complete canonical definitions in a user `catalog.json` overlay, subject to upstream availability.

Use `imagent models --kind speech` to list available TTS offerings, and `imagent options --provider <id> --model <id> --kind speech` to inspect exact `--option key=value` settings.

## Reference-image fields

- **Reference images** means image inputs attached to an image edit/generation request, video first/last-frame input, or provider-specific multimodal reference input.
- **Max references** is the maximum number of image references accepted by the model where the provider documents one or the catalog sets one.
- **Max reference size** is the provider-documented per-image upload/input limit. Empty values mean no official limit was confirmed.

## Image models

### OpenAI: `gpt-image-2.5-sunburst` / `gpt-image-2.5-flare`

- **Size / ratio controls:** Presets up to `3840x2160` / `2160x3840`; arbitrary `WIDTHxHEIGHT` with dimensions divisible by 16, aspect ratio between 1:3 and 3:1, maximum edge 3840 and at most 8,294,400 pixels. Resolutions above `2560x1440` are experimental upstream.
- **Output controls:** `quality`: `low`, `medium`, `high`, `xhigh`, `max`; `outputFormat`: `png`, `jpeg`, `webp`; max outputs 10.
- **Reference-image support:** Up to 16 PNG/JPEG/WebP images, each under 50 MB. Generation and editing use the same quality and size controls.
- **Availability:** Bundled for OpenAI only. Azure availability must be verified separately.

### OpenAI / Azure OpenAI: `gpt-image-2`

- **Size / ratio controls:** Presets `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `1152x2048`, `3840x2160`, and `2160x3840`; arbitrary `WIDTHxHEIGHT` also supported when dimensions are divisible by 16, aspect ratio is between 1:3 and 3:1, and total pixels are ≤ 8,294,400.
- **Output controls:** `quality`: `low`, `medium`, `high`; `outputFormat`: `png`, `jpeg`, `webp`; max outputs 10.
- **Reference-image support:** Supported; max 16 images; each PNG/JPEG/WebP reference must be under 50 MB.

### OpenAI / Azure OpenAI: `gpt-image-1.5`

- **Size / ratio controls:** `1024x1024`, `1024x1536`, `1536x1024`.
- **Output controls:** `quality`: `low`, `medium`, `high`; `outputFormat`: `png`, `jpeg`, `webp`; max outputs 10.
- **Reference-image support:** Supported; max 16 images; each PNG/JPEG/WebP reference must be under 50 MB.

### OpenAI / Azure OpenAI: `gpt-image-1-mini`

- **Size / ratio controls:** `1024x1024`, `1024x1536`, `1536x1024`.
- **Output controls:** `quality`: `low`, `medium`, `high`; `outputFormat`: `png`, `jpeg`, `webp`; max outputs 10.
- **Reference-image support:** Supported; max 16 images; each PNG/JPEG/WebP reference must be under 50 MB.

### Azure Foundry / Microsoft MAI Image: `MAI-Image-2` / `MAI-Image-2e`

- **Request shape:** These models do not use OpenAI-style image generation parameters on Azure. imagent sends them to `/mai/v1/images/generations` with raw `width` / `height` integers derived from the CLI `size=WIDTHxHEIGHT` option.
- **Size controls:** Presets `1024x1024`, `1024x768`, `768x1024`, `1280x768`, `768x1280`, `1365x768`, and `768x1365`. Arbitrary `WIDTHxHEIGHT` values are also supported, but both dimensions must stay within 768–1365 pixels and `width × height` must be ≤ 1,048,576.
- **Output controls:** PNG only; default size `1024x1024`; max outputs 1.
- **Reference-image support:** Not supported. MAI Image does not accept reference-image or style-reference inputs in the current Azure route.

### Google AI Studio: `gemini-3.1-flash-lite-image`

- **Size / ratio controls:** Aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`.
- **Output controls:** `quality`: `512`, `1K`; max outputs 1. Uses the Interactions API.
- **Reference-image support:** Supported; max 3 images. Official per-image size limit was not found.

### Google AI Studio: `gemini-nano-banana-2.1`

- **Size / ratio controls:** Aspect ratios: `1:1`, `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9`.
- **Output controls:** `quality`: `1K`, `2K`, `4K`; max outputs 1. Uses the Interactions API with inline image output.
- **Reference-image support:** Up to 14 images; the official migration guide describes fidelity for up to 4 characters and 10 objects.

### Google AI Studio: `gemini-3-pro-image`

- **Size / ratio controls:** Aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `1:4`, `4:1`, `1:8`, `8:1`.
- **Output controls:** `quality`: `1K`, `2K`, `4K`; max outputs 1. Uses the Interactions API.
- **Reference-image support:** Supported; max 14 images. Official per-image size limit was not found.

### Black Forest Labs: `flux-2-pro` / `flux-2-max` / `flux-2-flex`

- **Size controls:** Presets `1024x1024`, `1024x768`, `768x1024`, `1280x720`, `720x1280`, `1440x720`, and `720x1440`; arbitrary `WIDTHxHEIGHT` values are also supported, with width and height 256–2048 pixels and multiples of 32.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 8 input images.

### Black Forest Labs: `flux-2-klein-9b` / `flux-2-klein-4b`

- **Size controls:** Same common `WIDTHxHEIGHT` presets and arbitrary-size support as the other FLUX.2 endpoints; custom width/height must be 256–2048 pixels and multiples of 32.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 4 input images.

### xAI: `grok-imagine-image-2.0` / `grok-imagine-image-quality`

- **Size / ratio controls:** Aspect ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20`, `auto`; resolutions `1k`, `2k`.
- **Output controls:** Max outputs 10.
- **Reference-image support:** Supported; max 5 images. Official per-image size limit was not found.
- **Image 2.0 generation quality:** The common `quality=1k|2k` option controls resolution. Separately, `--option raw.quality=low` or `--option raw.quality=medium` controls generation effort on Image 2.0 only; other values and models are rejected. References use the SDK's image-edit input, not an ignored provider option.

### MiniMax: `image-01`

- **Provider-facing id:** Offering id `image-01` (the MiniMax API model name); canonical catalog model `minimax-image-01`.
- **Size / ratio controls:** Aspect ratios `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16`, `21:9`; or explicit width/height from 512–2048 pixels per edge in multiples of 8.
- **Output controls:** Max outputs 9.
- **Reference-image support:** Supported; max 1 image (mapped to a `character` subject reference).

### BytePlus / Volcano Ark: `dola-seedream-5-0-pro-260628`

- **Provider-facing ids:** BytePlus uses `dola-seedream-5-0-pro-260628`; 火山引擎 uses `doubao-seedream-5-0-pro-260628`.
- **Size / ratio controls:** Aspect ratios `auto`, `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `16:9`, `9:16`, `21:9`; `1k` or `2k`.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 10 images; each image under 30 MB.

### BytePlus / Volcano Ark: `seedream-5-0-260128`

- **Provider-facing ids:** BytePlus uses `seedream-5-0-260128`; 火山引擎 uses `doubao-seedream-5-0-260128`.
- **Size / ratio controls:** Aspect ratios `auto`, `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `16:9`, `9:16`, `21:9`; arbitrary dimensions from 256–8192 pixels per edge, aspect ratio between 1:16 and 16:1, and total pixels ≤ 16,777,216.
- **Output controls:** `quality`: `2k`, `3k`, `4k`; max outputs 15.
- **Reference-image support:** Supported; max 10 images; each image under 30 MB.

## Video models

### Google AI Studio: `gemini-omni-1.1-flash`

- **Duration:** Any integer from 3 to 10 seconds; default 5 seconds.
- **Resolution / aspect ratio:** `360p`, `720p`, `1080p`, `4k`; `16:9`, `9:16`; default `720p`.
- **Request lifecycle:** Interactions API background submission, persisted interaction IDs, remote polling, download and cancellation. Jobs can be resumed after restarting imagent.
- **Reference-image support:** Not enabled in this adapter. Upstream supports frame pins, image/video references and video extensions, but those require a separate Files API upload workflow and are not advertised by this text-to-video integration.

### Google AI Studio: `veo-3.1-generate-preview`

- **Duration / FPS:** 4, 6, or 8 seconds.
- **Resolution / aspect ratio:** `720p`, `1080p`, `4k`; `16:9`, `9:16`. The `4k` resolution is available for 8-second generations.
- **Reference-image support:** Not enabled in the default catalog because the current provider adapter does not yet serialize first/last-frame or ingredient inputs.
- **Other capabilities:** Preview model; max outputs 1. The catalog defaults to 8 seconds at `1080p`.

### Google AI Studio: `veo-3.1-lite-generate-preview`

- **Duration / FPS:** 4, 6, or 8 seconds.
- **Resolution / aspect ratio:** `720p`, `1080p`; `16:9`, `9:16`.
- **Reference-image support:** Not enabled in the default catalog.
- **Other capabilities:** Preview model; max outputs 1. The catalog defaults to 8 seconds at `720p`.

### Google AI Studio: `veo-3.1-fast-generate-preview`

- **Duration:** 4, 6, or 8 seconds.
- **Resolution / aspect ratio:** `720p`, `1080p`; `16:9`, `9:16`.
- **Reference-image support:** Not enabled in the default catalog.
- **Other capabilities:** Max outputs 1; default 8 seconds at `720p`.

### xAI: `grok-imagine-video-1.5`

- **Duration / FPS:** 1–15 seconds; the catalog default is 8 seconds at 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`, `1080p`; `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`. Native `1080p` applies to text-to-video and image-to-video.
- **Reference-image support:** xAI supports image-to-video and reference-to-video, but the current imagent adapter does not send those inputs.
- **Other capabilities:** Default resolution is `480p`; xAI caps reference-to-video at `720p`.

### xAI: `grok-imagine-video`

- **Duration / FPS:** 1–15 seconds; the catalog default is 8 seconds at 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`; `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`.
- **Reference-image support:** Not enabled in the default catalog.
- **Other capabilities:** Default resolution is `480p`.

### MiniMax: `MiniMax-Hailuo-2.3`

- **Provider-facing id:** `MiniMax-Hailuo-2.3` (same id used in the catalog and the MiniMax API).
- **Duration / FPS:** 6 or 10 seconds; the catalog default is 6 seconds.
- **Resolution / aspect ratio:** `768P`, `1080P`; aspect ratio is controlled by the prompt/first frame rather than a dedicated parameter.
- **Reference-image support:** First-frame image is supported; multimodal reference images are not.
- **Other capabilities:** Default resolution is `1080P`.

### BytePlus / Volcano Ark: `dreamina-seedance-2-5-260628`

- **Provider-facing ids:** BytePlus uses `dreamina-seedance-2-5-260628`; 火山引擎 uses `doubao-seedance-2-5-260628`.
- **Duration:** 4–30 seconds.
- **Resolution / aspect ratio:** `480p`, `720p`; `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`, or `adaptive`.
- **Reference-image support:** First frame, last frame, and reference images are supported; max 30 images; each image under 30 MB.
- **Other capabilities:** The BytePlus model also accepts reference video/audio and can generate audio, but the current imagent adapter only sends text and image inputs. Default duration is 5 seconds; default resolution is `720p`.

### BytePlus / Volcano Ark: `dreamina-seedance-2-0-260128`

- **Provider-facing ids:** BytePlus uses `dreamina-seedance-2-0-260128`; 火山引擎 uses `doubao-seedance-2-0-260128`.
- **Duration / FPS:** 4–15 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`; `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`.
- **Reference-image support:** First frame, last frame, and multimodal references are supported; max 9 images; each image under 30 MB.
- **Other capabilities:** Default duration is 5 seconds; default resolution is `720p`.

### BytePlus / Volcano Ark: `dreamina-seedance-2-0-fast-260128`

- **Provider-facing ids:** BytePlus uses `dreamina-seedance-2-0-fast-260128`; 火山引擎 uses `doubao-seedance-2-0-fast-260128`.
- **Duration / FPS:** 4–15 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`; `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`.
- **Reference-image support:** First frame, last frame, and multimodal references are supported; max 9 images; each image under 30 MB.
- **Other capabilities:** Fast Seedance 2.0 variant; default duration is 5 seconds and default resolution is `720p`.

## Speech models

### OpenAI: `gpt-4o-mini-tts`

- **Provider-facing id:** `gpt-4o-mini-tts` (OpenAI's steerable mini text-to-speech model).
- **Voice support:** Static catalog voices (no live discovery): `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`, `verse`, `marin`, `cedar`; default `alloy`.
- **Output controls:** `outputFormat` (codec): `mp3`, `opus`, `aac`, `flac`, `wav`, `pcm`; default `mp3`. `speed` ranges from 0.25 to 4; default 1.
- **Extra controls:** `instructions` — free-form text that steers tone, accent, and delivery (e.g. `--option instructions="speak cheerfully"`).

### Google: `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts`

- **Provider-facing ids:** `gemini-3.8-flash-tts` for expressive generation and `gemini-3.8-flash-lite-tts` for lower latency/cost. Single-speaker generation uses the Interactions API.
- **Voice support:** Static catalog voices (no live discovery): 30 prebuilt voices including `Zephyr`, `Puck`, `Charon`, `Kore`, `Fenrir`, `Leda`, `Orus`, `Aoede`, and more; default `Zephyr`.
- **Output controls:** `outputFormat`: `wav`. Native WAV responses are preserved without a second RIFF header; explicit PCM responses are wrapped using their reported sample rate. `speed` is not supported. Voice Design, Voice Replication and multi-speaker annotations are not exposed by imagent's single-speaker adapter.

### ElevenLabs: `eleven_multilingual_v2`

- **Provider-facing id:** `eleven_multilingual_v2`.
- **Voice support:** Dynamic voice discovery is supported; run `imagent speech voices --provider elevenlabs`.
- **Output controls:** `outputFormat`: `mp3_44100_128`, `mp3_44100_192`, `mp3_22050_32`, `pcm_16000`, `pcm_24000`, `ulaw_8000`; default `mp3_44100_128`. `speed` ranges from 0.7 to 1.2.
- **Extra controls:** `stability`, `similarity_boost`, and `style` from 0 to 1.

### ElevenLabs: `eleven_v3`

- **Provider-facing id:** `eleven_v3` (ElevenLabs' expressive speech model).
- **Voice support:** Dynamic voice discovery is supported; run `imagent speech voices --provider elevenlabs`.
- **Output controls:** `outputFormat`: `mp3_44100_128`, `mp3_44100_192`, `mp3_22050_32`, `pcm_16000`, `pcm_24000`, `ulaw_8000`; default `mp3_44100_128`. Note: `eleven_v3` does not support a `speed` control.
- **Extra controls:** `stability` and `similarity_boost` from 0 to 1.

### ElevenLabs: `eleven_flash_v2_5`

- **Provider-facing id:** `eleven_flash_v2_5`.
- **Voice support:** Dynamic voice discovery is supported; run `imagent speech voices --provider elevenlabs`.
- **Output controls:** `outputFormat`: `mp3_44100_128`, `mp3_44100_192`, `mp3_22050_32`, `pcm_16000`, `pcm_24000`, `ulaw_8000`; default `mp3_44100_128`. `speed` ranges from 0.7 to 1.2.
- **Extra controls:** `stability`, `similarity_boost`, and `style` from 0 to 1.

### MiniMax: `speech-2.8-hd` and `speech-2.8-turbo`

- **Provider-facing ids:** Offering ids `speech-2.8-hd` (ultra-realistic quality) and `speech-2.8-turbo` (low latency); mapping to canonical catalog models `minimax-speech-2.8-hd` and `minimax-speech-2.8-turbo`. Each supports 40 languages and 7 emotions.
- **Voice support:** Dynamic voice discovery is supported via MiniMax's `get_voice` API; run `imagent speech voices --provider minimax --model speech-2.8-hd` to list system, cloned, and generated voices on your account. The catalog does not include static fallback voices, so discovery must succeed before the CLI or desktop can show a voice list.
- **Output controls:** `outputFormat`: `mp3`, `wav`, `pcm`; default `mp3`. `speed` ranges from 0.5 to 2; default 1.
- **Extra controls:** `emotion`, `vol` from 0 to 10, and `pitch` from -12 to 12.
- **Note:** MiniMax TTS requires a Group ID — `imagent config set minimax.groupId <GroupId>`.

## Official documentation links reviewed

- OpenAI current model IDs and image parameters: <https://github.com/openai/openai-python/blob/main/src/openai/types/image_model.py>, <https://github.com/openai/openai-python/blob/main/src/openai/types/image_generate_params.py>, <https://github.com/openai/openai-python/blob/main/src/openai/types/image_edit_params.py>
- Google current models and migration / shutdown guidance: <https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-api-dev/SKILL.md>, <https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-api-dev/references/migration.md>
- Google image / Veo cookbook: <https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_Started_Nano_Banana.ipynb>, <https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_Veo.ipynb>
- Google Omni request contract and constraints: <https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-omni-flash-api/scripts/video/generate_video.py>
- Google speech request and audio handling: <https://github.com/google-gemini/gemini-api-cli/blob/main/internal/cli/custom/tts.go>
- xAI release notes, current model IDs and REST contract: <https://github.com/xai-org/xai-sdk-python/blob/main/CHANGELOG.md>, <https://github.com/xai-org/xai-sdk-ts/blob/main/src/models.ts>, <https://github.com/xai-org/xai-sdk-ts/blob/main/README.md>
- Black Forest Labs current image endpoints and the video API documentation caveat: <https://github.com/black-forest-labs/skills/blob/master/skills/bfl-api/references/endpoints.md>, <https://github.com/black-forest-labs/skills/blob/master/skills/flux-3-generate/references/api-quick-reference.md>
- BytePlus model recommendations and legacy upgrade guidance: <https://github.com/byteplus-sdk/ark-cli/blob/main/skills/arkcli-models/references/arkcli-models-scenario-table.md>
- MiniMax current image, video and TTS guides: <https://github.com/MiniMax-AI/skills/tree/main/skills/frontend-dev/references>
- ElevenLabs current main TTS models: <https://github.com/elevenlabs/elevenlabs-python/blob/main/README.md>

The following hosted references were recorded by earlier reviews; their hosts were not reachable from the October review environment. SDK / cookbook sources above were used instead where available.

- OpenAI image generation guide: <https://platform.openai.com/docs/guides/image-generation>
- OpenAI SDK image parameter types: <https://github.com/openai/openai-python/tree/main/src/openai/types>
- Azure OpenAI image generation: <https://learn.microsoft.com/azure/ai-foundry/openai/how-to/dall-e>
- Google Gemini image generation: <https://ai.google.dev/gemini-api/docs/image-generation>
- Google Veo video generation: <https://ai.google.dev/gemini-api/docs/video>
- Google Gen AI SDK: <https://github.com/googleapis/python-genai>
- Black Forest Labs API docs: <https://docs.bfl.ai/>
- ByteDance / Volcano Ark image generation API: <https://www.volcengine.com/docs/82379/1541523>
- ByteDance / Volcano Ark video generation API: <https://www.volcengine.com/docs/82379>
- BytePlus Seedream 5.0 model card: <https://ai.byteplus.com/ark/region:ap-southeast-1/model/detail?Id=seedream-5-0>
- BytePlus Seedance 2.5 model card: <https://ai.byteplus.com/ark/region:ap-southeast-1/model/detail?Id=dreamina-seedance-2-5>
- xAI Imagine model capabilities: <https://docs.x.ai/developers/model-capabilities/imagine>
- xAI Python SDK: <https://github.com/xai-org/xai-sdk-python>
- MiniMax image generation guide: <https://platform.minimax.io/docs/guides/image-generation>
- MiniMax video generation guide: <https://platform.minimax.io/docs/guides/video-generation>

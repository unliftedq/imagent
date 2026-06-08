---
description: Default image, video, and speech model capabilities.
---

# Model capabilities

This page summarizes the bundled default model catalog in `packages/providers/src/catalog.default.json`. Limits are included only when provider documentation or the bundled catalog confirms them.

Use `imagent models --kind speech` to list available TTS offerings, and `imagent options --provider <id> --model <id> --kind speech` to inspect exact `--option key=value` settings.

## Reference-image fields

- **Reference images** means image inputs attached to an image edit/generation request, video first/last-frame input, or provider-specific multimodal reference input.
- **Max references** is the maximum number of image references accepted by the model where the provider documents one or the catalog sets one.
- **Max reference size** is the provider-documented per-image upload/input limit. Empty values mean no official limit was found during the 2026-05-07 review.

## Image models

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

### Google AI Studio: `gemini-2.5-flash-image`

- **Size / ratio controls:** Aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 3 images. Official per-image size limit was not found.

### Google AI Studio: `gemini-3.1-flash-image-preview`

- **Size / ratio controls:** Aspect ratios: `1:1`, `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9`.
- **Output controls:** `quality`: `512`, `1K`, `2K`, `4K`; max outputs 1.
- **Reference-image support:** Supported in catalog with max 14 images; official sources found during review did not explicitly confirm the exact count for this preview model.

### Google AI Studio: `gemini-3-pro-image-preview`

- **Size / ratio controls:** Aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`.
- **Output controls:** `quality`: `1K`, `2K`, `4K`; max outputs 1.
- **Reference-image support:** Supported; max 14 images. Official per-image size limit was not found.

### Black Forest Labs: `flux-2-pro` / `flux-2-max` / `flux-2-flex`

- **Size controls:** Presets `1024x1024`, `1024x768`, `768x1024`, `1280x720`, `720x1280`, `1440x720`, and `720x1440`; arbitrary `WIDTHxHEIGHT` values are also supported, with width and height 256–2048 pixels and multiples of 32.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 8 input images.

### Black Forest Labs: `flux-2-klein-9b` / `flux-2-klein-4b`

- **Size controls:** Same common `WIDTHxHEIGHT` presets and arbitrary-size support as the other FLUX.2 endpoints; custom width/height must be 256–2048 pixels and multiples of 32.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 4 input images.

### xAI: `grok-imagine-image`

- **Size / ratio controls:** Aspect ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20`, `auto`; resolutions `1k`, `2k`.
- **Output controls:** Max outputs 10.
- **Reference-image support:** Supported; max 5 images. Official per-image size limit was not found.

### MiniMax: `image-01`

- **Provider-facing id:** Offering id `image-01` (the MiniMax API model name); canonical catalog model `minimax-image-01`.
- **Size / ratio controls:** Aspect ratios `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16`, `21:9`; or explicit width/height from 512–2048 pixels per edge in multiples of 8.
- **Output controls:** Max outputs 9.
- **Reference-image support:** Supported; max 1 image (mapped to a `character` subject reference).

### BytePlus / Volcano Ark: `seedream-5-0-260128`

- **Provider-facing ids:** BytePlus uses `seedream-5-0-260128`; 火山引擎 uses `doubao-seedream-5-0-260128`.
- **Size / ratio controls:** Aspect ratios `auto`, `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `16:9`, `9:16`, `21:9`; arbitrary dimensions from 256–8192 pixels per edge, aspect ratio between 1:16 and 16:1, and total pixels ≤ 16,777,216.
- **Output controls:** `quality`: `2k`, `3k`, `4k`; max outputs 15.
- **Reference-image support:** Supported; max 10 images; each image under 30 MB.

### BytePlus / Volcano Ark: `seedream-4-5-251128`

- **Provider-facing ids:** BytePlus uses `seedream-4-5-251128`; 火山引擎 uses `doubao-seedream-4-5-251128`.
- **Size / ratio controls:** Same aspect ratios and arbitrary-size bounds as Seedream 5.0.
- **Output controls:** `quality`: `2k`, `4k`; max outputs 15.
- **Reference-image support:** Supported; max 10 images; each image under 30 MB.

### BytePlus / Volcano Ark: `seedream-4-0-250828`

- **Provider-facing ids:** BytePlus uses `seedream-4-0-250828`; 火山引擎 uses `doubao-seedream-4-0-250828`.
- **Size / ratio controls:** Same aspect ratios and arbitrary-size bounds as Seedream 5.0.
- **Output controls:** `quality`: `1k`, `2k`, `4k`; max outputs 15.
- **Reference-image support:** Supported; max 10 images; each image under 30 MB.

## Video models

### Google AI Studio: `veo-3.0-generate-001`

- **Duration / FPS:** 8 seconds; 24 FPS.
- **Resolution / aspect ratio:** `720p`, `1080p`; `16:9`, `9:16`.
- **Reference-image support:** Not enabled in the default catalog.
- **Other capabilities:** Max outputs 1.

### Google AI Studio: `veo-3.0-fast-generate-001`

- **Duration / FPS:** 8 seconds; 24 FPS.
- **Resolution / aspect ratio:** `720p`, `1080p`; `16:9`, `9:16`.
- **Reference-image support:** Not enabled in the default catalog.
- **Other capabilities:** Max outputs 1.

### xAI: `grok-imagine-video`

- **Duration / FPS:** 1–15 seconds; the catalog default is 8 seconds at 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`; `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`.
- **Reference-image support:** Not enabled in the default catalog.
- **Other capabilities:** Default resolution is `720p`.

### MiniMax: `MiniMax-Hailuo-2.3`

- **Provider-facing id:** `MiniMax-Hailuo-2.3` (same id used in the catalog and the MiniMax API).
- **Duration / FPS:** 6 or 10 seconds; the catalog default is 6 seconds.
- **Resolution / aspect ratio:** `768P`, `1080P`; aspect ratio is controlled by the prompt/first frame rather than a dedicated parameter.
- **Reference-image support:** First-frame image is supported; multimodal reference images are not.
- **Other capabilities:** Default resolution is `1080P`.

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

### BytePlus / Volcano Ark: `seedance-1-5-pro-251215`

- **Provider-facing ids:** BytePlus uses `seedance-1-5-pro-251215`; 火山引擎 uses `doubao-seedance-1-5-pro-251215`.
- **Duration / FPS:** 4–12 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`, `1080p`; `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`.
- **Reference-image support:** First and last frame are supported; multimodal reference images are not supported. Input images must be under 30 MB.
- **Other capabilities:** Default duration is 5 seconds; default resolution is `720p`.

## Speech models

### ElevenLabs: `eleven_multilingual_v2`

- **Provider-facing id:** `eleven_multilingual_v2`.
- **Voice support:** Dynamic voice discovery is supported; run `imagent speech voices --provider elevenlabs`.
- **Output controls:** `outputFormat`: `mp3_44100_128`, `mp3_44100_192`, `mp3_22050_32`, `pcm_16000`, `pcm_24000`, `ulaw_8000`; default `mp3_44100_128`. `speed` ranges from 0.7 to 1.2.
- **Extra controls:** `stability`, `similarity_boost`, and `style` from 0 to 1.

### ElevenLabs: `eleven_v3`

- **Provider-facing id:** `eleven_v3` (ElevenLabs' most expressive model; currently in alpha).
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

- OpenAI image generation guide: <https://platform.openai.com/docs/guides/image-generation>
- OpenAI SDK image parameter types: <https://github.com/openai/openai-python/tree/main/src/openai/types>
- Azure OpenAI image generation: <https://learn.microsoft.com/azure/ai-foundry/openai/how-to/dall-e>
- Google Gemini image generation: <https://ai.google.dev/gemini-api/docs/image-generation>
- Google Veo video generation: <https://ai.google.dev/gemini-api/docs/video>
- Google Gen AI SDK: <https://github.com/googleapis/python-genai>
- Black Forest Labs API docs: <https://docs.bfl.ai/>
- Black Forest Labs API skill and model guides: <https://github.com/black-forest-labs/skills>
- ByteDance / Volcano Ark image generation API: <https://www.volcengine.com/docs/82379/1541523>
- ByteDance / Volcano Ark video generation API: <https://www.volcengine.com/docs/82379>
- xAI image/video generation docs: <https://docs.x.ai/developers/model-capabilities/images/generation>
- xAI Python SDK: <https://github.com/xai-org/xai-sdk-python>
- MiniMax image generation guide: <https://platform.minimax.io/docs/guides/image-generation>
- MiniMax video generation guide: <https://platform.minimax.io/docs/guides/video-generation>

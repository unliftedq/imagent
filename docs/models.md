---
description: Default image and video model capabilities.
---

# Model capabilities

This page summarizes the bundled default model catalog in `packages/providers/src/catalog.default.json`. Limits are included only when provider documentation confirms them.

## Reference-image fields

- **Reference images** means image inputs attached to an image edit/generation request, video first/last-frame input, or provider-specific multimodal reference input.
- **Max references** is the maximum number of image references accepted by the model where the provider documents one.
- **Max reference size** is the provider-documented per-image upload/input limit. Empty values mean no official limit was found during the 2026-05-07 review.

## Image models

### OpenAI / Azure OpenAI: `gpt-image-2`

- **Size / ratio controls:** Standard presets `1024x1024`, `1536x1024`, `1024x1536`, `auto`; arbitrary `WIDTHxHEIGHT` also supported when dimensions are divisible by 16, aspect ratio is between 1:3 and 3:1, and resolution is within current OpenAI limits.
- **Output controls:** `quality`: `low`, `medium`, `high`, `auto`; `outputFormat`: `png`, `jpeg`, `webp`; max outputs 10.
- **Reference-image support:** Supported; max 16 images; each PNG/JPEG/WebP reference must be under 50 MB.
- **Other capabilities:** No negative prompt; no seed.

### OpenAI / Azure OpenAI: `gpt-image-1.5`

- **Size / ratio controls:** `1024x1024`, `1024x1536`, `1536x1024`.
- **Output controls:** `quality`: `low`, `medium`, `high`, `auto`; `outputFormat`: `png`, `jpeg`, `webp`; max outputs 10.
- **Reference-image support:** Supported; max 16 images; each PNG/JPEG/WebP reference must be under 50 MB.
- **Other capabilities:** No negative prompt; no seed.

### OpenAI / Azure OpenAI: `gpt-image-1-mini`

- **Size / ratio controls:** `1024x1024`, `1024x1536`, `1536x1024`.
- **Output controls:** `quality`: `low`, `medium`, `high`, `auto`; `outputFormat`: `png`, `jpeg`, `webp`; max outputs 10.
- **Reference-image support:** Supported; max 16 images; each PNG/JPEG/WebP reference must be under 50 MB.
- **Other capabilities:** No negative prompt; no seed.

### Google AI Studio: `gemini-2.5-flash-image`

- **Size / ratio controls:** Aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`; default resolution `1K`.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 3 images. Official per-image size limit was not found.
- **Other capabilities:** No negative prompt; no confirmed seed support.

### Google AI Studio: `gemini-3.1-flash-image-preview`

- **Size / ratio controls:** Aspect ratios include standard ratios plus extreme ratios `1:4`, `1:8`, `4:1`, `8:1`; default resolution `1K`.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported in catalog with max 14 images; official sources found during review did not explicitly confirm the exact count for this preview model.
- **Other capabilities:** No negative prompt; no confirmed seed support.

### Google AI Studio: `gemini-3-pro-image-preview`

- **Size / ratio controls:** Aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`; default resolution `1K`. Official examples also describe 2K and 4K generation.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 14 images. Official per-image size limit was not found.
- **Other capabilities:** No negative prompt; no confirmed seed support.

### Black Forest Labs: `flux-2-pro`

- **Size / ratio controls:** Catalog exposes common aspect-ratio presets, but the API accepts free-form `width`/`height` within provider constraints.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 8 input images. Official per-image file-size limit was not found.
- **Other capabilities:** Supports seed; no negative prompt.

### Black Forest Labs: `flux-2-max`

- **Size / ratio controls:** Same FLUX.2 aspect-ratio presets as `flux-2-pro`; the API uses free-form dimensions.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 8 input images through the API.
- **Other capabilities:** Supports seed; no negative prompt.

### Black Forest Labs: `flux-2-flex`

- **Size / ratio controls:** Same FLUX.2 aspect-ratio presets as `flux-2-pro`; the API uses free-form dimensions.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 8 input images.
- **Other capabilities:** Supports seed; no negative prompt. Flex also has provider-specific raw controls such as steps and guidance.

### Black Forest Labs: `flux-2-klein-9b`

- **Size / ratio controls:** Same FLUX.2 aspect-ratio presets as the other FLUX.2 endpoints.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 4 input images.
- **Other capabilities:** Supports seed; no negative prompt.

### Black Forest Labs: `flux-2-klein-4b`

- **Size / ratio controls:** Same FLUX.2 aspect-ratio presets as the other FLUX.2 endpoints.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Supported; max 4 input images.
- **Other capabilities:** Supports seed; no negative prompt.

### ByteDance / Volcano Ark: `doubao-seedream-4-0-250828`

- **Size / ratio controls:** Resolution tokens `1K`, `2K`, `4K`.
- **Output controls:** Max outputs 15.
- **Reference-image support:** Supported by the API's image input field; catalog keeps the existing conservative max of 3 because an official maximum was not found.
- **Other capabilities:** No negative prompt; no seed.

### ByteDance / Volcano Ark: `doubao-seedream-3-0-t2i-250415`

- **Size / ratio controls:** `1024x1024`, `864x1152`, `1152x864`, `1280x720`, `720x1280`, `832x1248`, `1248x832`, `1512x648`.
- **Output controls:** Max outputs 1.
- **Reference-image support:** Not supported for this text-to-image model in the default catalog.
- **Other capabilities:** Supports seed; no negative prompt.

### xAI: `grok-imagine-image`

- **Size / ratio controls:** Aspect ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20`, `auto`; resolutions `1k`, `2k`.
- **Output controls:** Max outputs 10.
- **Reference-image support:** Supported; max 5 images. Official per-image size limit was not found.
- **Other capabilities:** No negative prompt; no seed.

## Video models

### Google AI Studio: `veo-3.0-generate-001`

- **Duration / FPS:** 8 seconds; 24 FPS.
- **Resolution / aspect ratio:** `720p`, `1080p`; `16:9`, `9:16`.
- **Reference-image support:** First frame and last frame are supported; multimodal reference images are not enabled for Veo 3.0 in the default catalog because official examples scope reference-to-video to Veo 3.1.
- **Other capabilities:** Max outputs 1.

### Google AI Studio: `veo-3.0-fast-generate-001`

- **Duration / FPS:** 8 seconds; 24 FPS.
- **Resolution / aspect ratio:** `720p`, `1080p`; `16:9`, `9:16`.
- **Reference-image support:** First frame and last frame are supported; multimodal reference images are not enabled for Veo 3.0 Fast.
- **Other capabilities:** Max outputs 1.

### ByteDance / Volcano Ark: `doubao-seedance-1-0-pro-250528`

- **Duration / FPS:** 2-12 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`, `1080p`; `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`.
- **Reference-image support:** First and last frame are supported; multimodal reference images are not supported. Input images must be under 30 MB.
- **Other capabilities:** The prior `250428` suffix was replaced with the official `250528` model ID.

### ByteDance / Volcano Ark: `doubao-seedance-1-0-lite-t2v-250428`

- **Duration / FPS:** 2-12 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`, `1080p`; same Seedance aspect ratios.
- **Reference-image support:** No first frame, last frame, or reference images.
- **Other capabilities:** Text-to-video variant.

### ByteDance / Volcano Ark: `doubao-seedance-1-0-lite-i2v-250428`

- **Duration / FPS:** 2-12 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`, `1080p`; same Seedance aspect ratios.
- **Reference-image support:** First frame, last frame, and image references are supported; max 4 images; each image under 30 MB.
- **Other capabilities:** Image-to-video variant.

### ByteDance / Volcano Ark: `doubao-seedance-1-5-pro-251215`

- **Duration / FPS:** 4-12 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`, `1080p`; same Seedance aspect ratios.
- **Reference-image support:** First and last frame are supported; multimodal reference images are not supported. Input images must be under 30 MB.
- **Other capabilities:** Draft mode is provider-specific and can be passed through raw options if exposed later.

### ByteDance / Volcano Ark: `doubao-seedance-2-0-260128`

- **Duration / FPS:** 4-15 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`; same Seedance aspect ratios.
- **Reference-image support:** First frame, last frame, and multimodal references are supported. Official per-count limit was not found; image inputs must be under 30 MB.
- **Other capabilities:** Default resolution is `720p`.

### ByteDance / Volcano Ark: `doubao-seedance-2-0-fast-260128`

- **Duration / FPS:** 4-15 seconds; fixed 24 FPS.
- **Resolution / aspect ratio:** `480p`, `720p`; same Seedance aspect ratios.
- **Reference-image support:** First frame, last frame, and multimodal references are supported. Official per-count limit was not found; image inputs must be under 30 MB.
- **Other capabilities:** Fast Seedance 2.0 variant.

### xAI: `grok-imagine-video`

- **Duration / FPS:** 1-15 seconds; the API does not expose configurable FPS.
- **Resolution / aspect ratio:** `480p`, `720p`; `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`.
- **Reference-image support:** First-frame and reference-image inputs are supported; last-frame input is not supported. Official reference count and file-size limits were not found.
- **Other capabilities:** Default duration is 8 seconds.

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

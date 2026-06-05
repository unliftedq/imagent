# Audio (TTS) Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **audio** as a first-class media type (text-to-speech) alongside image and video, with ElevenLabs (new vendor) and MiniMax (existing vendor) TTS providers, surfaced across core, providers, persistence, config, IPC, CLI, Studio, and Gallery.

**Architecture:** Audio mirrors the **synchronous image lifecycle** (one-shot `generate`). A new first-class `AudioProvider` port runs through the existing `JobRunner` synchronous path, persists `gallery_items` rows with `kind:"audio"`, and is exposed through new registries/contracts/UI. Voice is a model option in the CLI; the Studio voice picker uses each provider's voice-list API with a static catalog fallback.

**Tech Stack:** TypeScript (NodeNext), Zod, Bun workspaces + Turborepo, better-sqlite3 (persistence), Commander (CLI), Electron + React + Zustand (desktop), Vitest, Biome.

**Reference spec:** `docs/superpowers/specs/2026-06-05-audio-tts-support-design.md`

---

## Provider API reference (verified)

**ElevenLabs** — `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- Header: `xi-api-key: <key>`. Query: `output_format` (default `mp3_44100_128`).
- JSON body: `{ text, model_id, voice_settings?: { stability, similarity_boost, style, use_speaker_boost } }`.
- Response: **binary** audio (`application/octet-stream`). mp3 by default.
- Voices: `GET /v1/voices` → `{ voices: [{ voice_id, name, preview_url, labels }] }`.

**MiniMax T2A v2** — `POST {baseUrl}/t2a_v2?GroupId=<groupId>` (baseUrl default `https://api.minimax.io/v1`)
- Header: `Authorization: Bearer <key>`.
- JSON body: `{ model, text, stream:false, voice_setting:{ voice_id, speed, vol, pitch, emotion }, audio_setting:{ format, sample_rate, bitrate } }`.
- Response: `{ data: { audio: "<hex>" }, base_resp: { status_code, status_msg } }`. `data.audio` is a **hex** string → decode with `Buffer.from(hex,"hex")`. Reuse `assertMiniMaxOk`.
- No public voice-list API assumed → static catalog voices (`supportsVoiceDiscovery:false`).

---

## Conventions for this plan

- Run package-scoped commands from the repo root: `bun run --filter @imagent/<pkg> <script>`.
- Tests use Vitest: `bun run --filter @imagent/<pkg> test`.
- Build order matters: `core` → `config` → `providers`/`persistence` → `ipc` → `cli`/`desktop`. Rebuild a dependency before testing a dependent (`*.tsbuildinfo`/`dist`).
- Commit after every green step. Append the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` to every commit.
- DRY/YAGNI/TDD. Keep image/video paths untouched — audio is purely additive.

---

# Phase 1 — Core domain: the `audio` media kind

### Task 1.1: Add `"audio"` to `MediaKind`

**Files:**
- Modify: `packages/core/src/domain/media.ts`
- Test: `packages/core/src/domain/media.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/domain/media.test.ts
import { describe, expect, it } from "vitest";
import { MediaKindSchema } from "./media.js";

describe("MediaKindSchema", () => {
  it("accepts image, video and audio", () => {
    expect(MediaKindSchema.parse("image")).toBe("image");
    expect(MediaKindSchema.parse("video")).toBe("video");
    expect(MediaKindSchema.parse("audio")).toBe("audio");
  });

  it("rejects unknown kinds", () => {
    expect(() => MediaKindSchema.parse("text")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @imagent/core test -- media.test`
Expected: FAIL on `"audio"` parse.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/domain/media.ts
import { z } from "zod";

export const MediaKindSchema = z.enum(["image", "video", "audio"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @imagent/core test -- media.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/media.ts packages/core/src/domain/media.test.ts
git commit -m "feat(core): add audio to MediaKind"
```

### Task 1.2: Audio model capability + def schemas

**Files:**
- Modify: `packages/core/src/domain/model.ts` (append after the video schemas)
- Test: `packages/core/src/domain/model.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/domain/model.audio.test.ts
import { describe, expect, it } from "vitest";
import {
  AudioModelCapsSchema,
  AudioModelCapsOverrideSchema,
  AudioModelDefSchema,
  AudioProviderModelSchema,
} from "./model.js";

describe("audio model schemas", () => {
  it("parses full caps with defaults", () => {
    const caps = AudioModelCapsSchema.parse({
      voices: [{ id: "rachel", name: "Rachel" }],
      outputFormats: ["mp3_44100_128"],
      speedRange: { min: 0.5, max: 2 },
    });
    expect(caps.supportsVoiceDiscovery).toBe(false);
    expect(caps.voices?.[0]?.id).toBe("rachel");
  });

  it("override schema leaves all fields optional", () => {
    expect(AudioModelCapsOverrideSchema.parse({})).toEqual({});
  });

  it("parses model + provider offering defs", () => {
    expect(AudioModelDefSchema.parse({ id: "eleven_multilingual_v2" }).id).toBe(
      "eleven_multilingual_v2",
    );
    expect(
      AudioProviderModelSchema.parse({ id: "tts-rachel", modelId: "eleven_multilingual_v2" })
        .modelId,
    ).toBe("eleven_multilingual_v2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @imagent/core test -- model.audio`
Expected: FAIL — schemas undefined.

- [ ] **Step 3: Implement (append to `packages/core/src/domain/model.ts`)**

```ts
// ---- Audio ----------------------------------------------------------------

export const VoiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Optional preview audio URL surfaced by the voice-list API. */
  previewUrl: z.string().optional(),
  /** Free-form provider labels (gender, accent, use case, ...). */
  labels: z.record(z.string(), z.string()).optional(),
});
export type VoiceInfo = z.infer<typeof VoiceInfoSchema>;

/** Declares an extra per-model knob (e.g. ElevenLabs stability). */
export const AudioKnobSchema = z.object({
  /** number ⇒ numeric range; enum ⇒ one of `values`. */
  type: z.enum(["number", "enum"]),
  min: z.number().optional(),
  max: z.number().optional(),
  values: z.array(z.string()).optional(),
});
export type AudioKnob = z.infer<typeof AudioKnobSchema>;

export const AudioModelCapsSchema = z.object({
  /** Static fallback voices when the provider has no list API. */
  voices: z.array(VoiceInfoSchema).optional(),
  /** Provider exposes a live voice-list endpoint. */
  supportsVoiceDiscovery: z.boolean().default(false),
  outputFormats: z.array(z.string()).optional(),
  speedRange: z.object({ min: z.number(), max: z.number() }).optional(),
  /** Extra knobs keyed by request `raw` key (e.g. stability, emotion). */
  extraKnobs: z.record(z.string(), AudioKnobSchema).optional(),
});
export type AudioModelCaps = z.infer<typeof AudioModelCapsSchema>;

export const AudioModelCapsOverrideSchema = z.object({
  voices: z.array(VoiceInfoSchema).optional(),
  supportsVoiceDiscovery: z.boolean().optional(),
  outputFormats: z.array(z.string()).optional(),
  speedRange: z.object({ min: z.number(), max: z.number() }).optional(),
  extraKnobs: z.record(z.string(), AudioKnobSchema).optional(),
});
export type AudioModelCapsOverride = z.infer<typeof AudioModelCapsOverrideSchema>;

export const AudioModelDefSchema = z.object({
  id: z.string(),
  baseModelId: z.string().optional(),
  displayName: z.string().optional(),
  capabilities: AudioModelCapsSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type AudioModelDef = z.infer<typeof AudioModelDefSchema>;

export const AudioProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: AudioModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type AudioProviderModel = z.infer<typeof AudioProviderModelSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @imagent/core test -- model.audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/model.ts packages/core/src/domain/model.audio.test.ts
git commit -m "feat(core): add audio model capability + def schemas"
```

### Task 1.3: `AudioRequest` + audio arm on `GenerationIntent`

**Files:**
- Modify: `packages/core/src/domain/request.ts`
- Test: `packages/core/src/domain/request.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/domain/request.audio.test.ts
import { describe, expect, it } from "vitest";
import { AudioRequestSchema, GenerationIntentSchema } from "./request.js";

describe("AudioRequest", () => {
  it("requires non-empty prompt and defaults assetIds", () => {
    const req = AudioRequestSchema.parse({
      prompt: "Hello world",
      providerId: "elevenlabs",
      model: "tts-rachel",
    });
    expect(req.assetIds).toEqual([]);
  });

  it("rejects empty text", () => {
    expect(() =>
      AudioRequestSchema.parse({ prompt: "", providerId: "elevenlabs", model: "x" }),
    ).toThrow();
  });

  it("is a valid audio generation intent", () => {
    const intent = GenerationIntentSchema.parse({
      kind: "audio",
      request: { prompt: "hi", providerId: "minimax", model: "speech-02" },
    });
    expect(intent.kind).toBe("audio");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @imagent/core test -- request.audio`
Expected: FAIL — `AudioRequestSchema` undefined / no audio arm.

- [ ] **Step 3: Implement**

In `packages/core/src/domain/request.ts`, add after `VideoRequestSchema`:

```ts
export const AudioRequestSchema = z.object({
  /** The text to synthesize. */
  prompt: z.string().min(1),
  providerId: z.string(),
  model: z.string(),
  /** Provider voice id (e.g. ElevenLabs voice_id, MiniMax voice_id). */
  voice: z.string().optional(),
  /** Playback/synthesis speed multiplier. */
  speed: z.number().positive().optional(),
  /** Output audio format token (e.g. mp3_44100_128, mp3, wav). */
  outputFormat: z.string().optional(),
  /** Asset ids to record on the resulting gallery_item (usually empty for TTS). */
  assetIds: z.array(z.string()).default([]),
  boardId: z.string().optional(),
  parentId: z.string().optional(),
  /** Per-model extra knobs passthrough (stability, emotion, vol, pitch, ...). */
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type AudioRequest = z.infer<typeof AudioRequestSchema>;
```

Then add a third member to `GenerationIntentSchema`'s `z.discriminatedUnion("kind", [...])`:

```ts
  z.object({
    kind: z.literal("audio"),
    request: AudioRequestSchema,
    parentId: z.string().optional(),
    boardId: z.string().optional(),
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @imagent/core test -- request.audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/request.ts packages/core/src/domain/request.audio.test.ts
git commit -m "feat(core): add AudioRequest and audio generation intent"
```

### Task 1.4: `AudioOutput` + `AudioGenerationResult`

**Files:**
- Modify: `packages/core/src/domain/result.ts`
- Test: `packages/core/src/domain/result.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/domain/result.audio.test.ts
import { describe, expect, it } from "vitest";
import { AudioGenerationResultSchema, AudioOutputSchema } from "./result.js";

describe("audio result schemas", () => {
  it("parses an audio output", () => {
    const out = AudioOutputSchema.parse({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/mpeg",
      durationMs: 1200,
    });
    expect(out.mimeType).toBe("audio/mpeg");
  });

  it("wraps a single output in a result", () => {
    const res = AudioGenerationResultSchema.parse({
      output: { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" },
    });
    expect(res.output.bytes.byteLength).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @imagent/core test -- result.audio`
Expected: FAIL — schemas undefined.

- [ ] **Step 3: Implement (append to `packages/core/src/domain/result.ts`)**

```ts
export const AudioOutputSchema = z.object({
  bytes: z.instanceof(Uint8Array),
  mimeType: z.string(),
  durationMs: z.number().int().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type AudioOutput = z.infer<typeof AudioOutputSchema>;

export const AudioGenerationResultSchema = z.object({
  output: AudioOutputSchema,
});
export type AudioGenerationResult = z.infer<typeof AudioGenerationResultSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @imagent/core test -- result.audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/result.ts packages/core/src/domain/result.audio.test.ts
git commit -m "feat(core): add AudioOutput and AudioGenerationResult"
```

### Task 1.5: `AudioProvider` port

**Files:**
- Create: `packages/core/src/ports/audio-provider.ts`
- Modify: `packages/core/src/ports/index.ts`
- Test: `packages/core/src/ports/audio-provider.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/ports/audio-provider.test.ts
import { describe, expect, it } from "vitest";
import type { AudioProvider } from "./audio-provider.js";

describe("AudioProvider port", () => {
  it("can be implemented as a minimal stub", async () => {
    const provider: AudioProvider = {
      id: "stub",
      displayName: "Stub",
      capabilities: { outputFormats: ["mp3"], supportsVoiceDiscovery: false },
      models: new Map(),
      async generate() {
        return { output: { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" } };
      },
    };
    const res = await provider.generate({
      prompt: "hi",
      providerId: "stub",
      model: "m",
      assetIds: [],
    });
    expect(res.output.mimeType).toBe("audio/mpeg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @imagent/core test -- audio-provider`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/ports/audio-provider.ts
import type { AudioModelDef, VoiceInfo } from "../domain/model.js";
import type { AudioRequest } from "../domain/request.js";
import type { AudioGenerationResult } from "../domain/result.js";
import type { ProviderTestResult } from "./image-provider.js";

/** Aggregate audio capability snapshot across the provider's enabled models. */
export interface AudioCapabilities {
  readonly outputFormats: readonly string[];
  readonly supportsVoiceDiscovery: boolean;
}

export interface AudioProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: AudioCapabilities;
  readonly models: ReadonlyMap<string, AudioModelDef>;
  generate(req: AudioRequest, signal?: AbortSignal): Promise<AudioGenerationResult>;
  /** Optional live voice discovery. Implementations MUST NOT throw on auth/network — wrap and rethrow as ProviderError so callers can fall back. */
  listVoices?(signal?: AbortSignal): Promise<VoiceInfo[]>;
  /** Optional minimal authenticated probe. Never throws; returns `{ ok:false }`. */
  test?(signal?: AbortSignal): Promise<ProviderTestResult>;
}

export type { VoiceInfo };
```

Then add to `packages/core/src/ports/index.ts`:

```ts
export * from "./audio-provider.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @imagent/core test -- audio-provider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ports/audio-provider.ts packages/core/src/ports/index.ts packages/core/src/ports/audio-provider.test.ts
git commit -m "feat(core): add AudioProvider port"
```

---

# Phase 2 — Core: validation + job-runner audio path

### Task 2.1: `validateAudioRequestAgainstModel` + `applyAudioDefaults`

**Files:**
- Modify: `packages/core/src/application/validate.ts`
- Test: `packages/core/src/application/validate.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/application/validate.audio.test.ts
import { describe, expect, it } from "vitest";
import type { AudioModelDef } from "../domain/model.js";
import type { AudioRequest } from "../domain/request.js";
import { applyAudioDefaults, validateAudioRequestAgainstModel } from "./validate.js";

const model: AudioModelDef = {
  id: "tts",
  capabilities: {
    supportsVoiceDiscovery: false,
    outputFormats: ["mp3_44100_128", "wav_44100"],
    speedRange: { min: 0.5, max: 2 },
    voices: [{ id: "rachel", name: "Rachel" }],
  },
  defaults: { voice: "rachel", outputFormat: "mp3_44100_128", speed: 1 },
};

const base: AudioRequest = { prompt: "hi", providerId: "p", model: "tts", assetIds: [] };

describe("validateAudioRequestAgainstModel", () => {
  it("rejects unsupported outputFormat", () => {
    expect(() =>
      validateAudioRequestAgainstModel("p", { ...base, outputFormat: "flac" }, model),
    ).toThrow(/outputFormat/);
  });

  it("rejects out-of-range speed", () => {
    expect(() => validateAudioRequestAgainstModel("p", { ...base, speed: 5 }, model)).toThrow(
      /speed/,
    );
  });

  it("accepts a valid request", () => {
    expect(() =>
      validateAudioRequestAgainstModel("p", { ...base, outputFormat: "wav_44100", speed: 1.2 }, model),
    ).not.toThrow();
  });
});

describe("applyAudioDefaults", () => {
  it("fills missing voice/format/speed from defaults", () => {
    const merged = applyAudioDefaults(base, model);
    expect(merged.voice).toBe("rachel");
    expect(merged.outputFormat).toBe("mp3_44100_128");
    expect(merged.speed).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @imagent/core test -- validate.audio`
Expected: FAIL — functions undefined.

- [ ] **Step 3: Implement (append to `packages/core/src/application/validate.ts`)**

```ts
import type { AudioModelDef } from "../domain/model.js";
import type { AudioRequest } from "../domain/request.js";

export function validateAudioRequestAgainstModel(
  vendorId: string,
  req: AudioRequest,
  model: AudioModelDef,
): void {
  const caps = model.capabilities;
  if (!caps) return;

  if (
    req.outputFormat !== undefined &&
    caps.outputFormats &&
    caps.outputFormats.length > 0 &&
    !caps.outputFormats.includes(req.outputFormat)
  ) {
    throw new ProviderRequestError(
      `model ${model.id} does not support outputFormat '${req.outputFormat}'. ` +
        `Supported: ${caps.outputFormats.join(", ")}`,
      { vendorId },
    );
  }

  if (req.speed !== undefined && caps.speedRange) {
    const { min, max } = caps.speedRange;
    if (req.speed < min || req.speed > max) {
      throw new ProviderRequestError(
        `model ${model.id} requires speed in [${min}, ${max}] (got ${req.speed})`,
        { vendorId },
      );
    }
  }

  if (req.voice !== undefined && caps.voices && caps.voices.length > 0) {
    // Static voice lists are validated; discovery-backed models accept any id.
    if (!caps.supportsVoiceDiscovery && !caps.voices.some((v) => v.id === req.voice)) {
      throw new ProviderRequestError(
        `model ${model.id} does not offer voice '${req.voice}'. ` +
          `Known voices: ${caps.voices.map((v) => v.id).join(", ")}`,
        { vendorId },
      );
    }
  }
}

export function applyAudioDefaults(req: AudioRequest, model: AudioModelDef): AudioRequest {
  const d = (model.defaults ?? {}) as { voice?: string; outputFormat?: string; speed?: number };
  return {
    ...req,
    voice: req.voice ?? d.voice,
    outputFormat: req.outputFormat ?? d.outputFormat,
    speed: req.speed ?? d.speed,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @imagent/core test -- validate.audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application/validate.ts packages/core/src/application/validate.audio.test.ts
git commit -m "feat(core): add audio request validation + defaults"
```

### Task 2.2: Wire an audio path into `JobRunner`

**Files:**
- Modify: `packages/core/src/application/job-runner.ts`
- Test: `packages/core/src/application/job-runner.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/application/job-runner.audio.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "../domain/gallery.js";
import type { Job } from "../domain/job.js";
import type { AudioProvider } from "../ports/audio-provider.js";
import { JobRunner } from "./job-runner.js";

function makeDeps(audioProvider: AudioProvider) {
  const created: GalleryItem[] = [];
  const jobs = new Map<string, Job>();
  let seq = 0;
  return {
    created,
    deps: {
      jobs: {
        create: (j: Job) => (jobs.set(j.id, j), j),
        get: (id: string) => jobs.get(id) ?? null,
        updateState: (id: string, patch: Partial<Job>) => {
          const j = { ...(jobs.get(id) as Job), ...patch } as Job;
          jobs.set(id, j);
          return j;
        },
        listByStates: () => [],
      },
      gallery: { create: (i: GalleryItem) => (created.push(i), i) },
      files: {
        dataDir: "/data",
        galleryDir: () => "/data/gallery",
        galleryItemFile: (id: string, ext: string) => `/data/gallery/${id}.${ext}`,
      },
      imageRegistry: new Map(),
      videoRegistry: new Map(),
      audioRegistry: new Map([[audioProvider.id, audioProvider]]),
      writeFile: vi.fn(async () => {}),
      ensureDir: vi.fn(async () => {}),
      idFactory: () => `id-${seq++}`,
      now: () => 1_000,
    },
  };
}

describe("JobRunner audio", () => {
  it("generates audio, writes bytes, creates an audio gallery item", async () => {
    const provider: AudioProvider = {
      id: "elevenlabs",
      displayName: "ElevenLabs",
      capabilities: { outputFormats: ["mp3_44100_128"], supportsVoiceDiscovery: true },
      models: new Map(),
      async generate() {
        return { output: { bytes: new Uint8Array([1, 2]), mimeType: "audio/mpeg", durationMs: 900 } };
      },
    };
    const { created, deps } = makeDeps(provider);
    const runner = new JobRunner(deps as never);
    const completed = new Promise<Job>((res) => runner.once("job.completed", res));
    await runner.start({
      kind: "audio",
      request: { prompt: "hi", providerId: "elevenlabs", model: "tts", assetIds: [] },
    });
    const job = await completed;
    expect(job.state).toBe("succeeded");
    expect(created).toHaveLength(1);
    expect(created[0]?.kind).toBe("audio");
    expect(created[0]?.durationMs).toBe(900);
    expect(deps.writeFile).toHaveBeenCalledWith("/data/gallery/id-1.mp3", new Uint8Array([1, 2]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @imagent/core test -- job-runner.audio`
Expected: FAIL — `audioRegistry` not a dep / audio intent unhandled.

- [ ] **Step 3: Implement**

In `packages/core/src/application/job-runner.ts`:

1. Add import near the top:

```ts
import type { AudioRequest } from "../domain/request.js";
import type { AudioProvider } from "../ports/audio-provider.js";
```

2. Add the registry type alias next to the existing ones:

```ts
export type AudioRegistry = ReadonlyMap<string, AudioProvider>;
```

3. Add to `JobRunnerDeps`:

```ts
  audioRegistry: AudioRegistry;
```

4. In the `deps` assignment inside the constructor (the `Required<Omit<...>>` object), add:

```ts
      audioRegistry: deps.audioRegistry,
```

   and include `audioRegistry` in the `Required<Omit<...>>` base by leaving it as a required key (it is not in the omit list, so no further change needed).

5. In `start()`, replace the image/video branch tail so audio is handled:

```ts
    if (intent.kind === "image") {
      return this.startImage(intent.request, overrides);
    }
    if (intent.kind === "audio") {
      return this.startAudio(intent.request, overrides);
    }
    return this.startVideo(intent.request, overrides);
```

6. In `resumeRunningJobs()`, treat audio like image. Change the guard:

```ts
      if (job.kind === "image" || job.kind === "audio") {
```

7. Add the audio methods (mirror the image path; single output, no thumbnail):

```ts
  // ----- audio path -----------------------------------------------------

  private async startAudio(req: AudioRequest, overrides: IntentOverrides = {}): Promise<JobId> {
    const provider = this.deps.audioRegistry.get(req.providerId);
    if (!provider) {
      throw new ProviderError(`audio provider '${req.providerId}' is not configured`, {
        vendorId: req.providerId,
      });
    }
    const id = this.deps.idFactory();
    const now = this.deps.now();
    const job = this.deps.jobs.create({
      id,
      kind: "audio",
      state: "running",
      providerId: req.providerId,
      providerJobId: null,
      requestJson: JSON.stringify(req),
      progress: 0,
      errorMessage: null,
      resultItemId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });
    const abort = new AbortController();
    this.running.set(id, { abort, pollIndex: 0 });
    if (overrides.parentId || overrides.boardId) {
      this.intentOverrides.set(id, overrides);
    }
    this.emit("job.progress", { id, progress: 0, state: job.state });
    this.audioGenerationLoop(job, req, provider, abort.signal).catch((err) => {
      this.deps.logger.error("audio job loop crashed", { id, err: String(err) });
    });
    return id;
  }

  private async audioGenerationLoop(
    job: Job,
    req: AudioRequest,
    provider: AudioProvider,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const result = await provider.generate(req, signal);
      this.throwIfPersistedCancelled(job.id, req.providerId);
      const out = result.output;

      const overrides = this.intentOverrides.get(job.id) ?? {};
      const now = this.deps.now();
      const date = new Date(now);
      const dir = this.deps.files.galleryDir(date);
      await this.deps.ensureDir(dir);

      const ext = mimeToExt(out.mimeType);
      const itemId = this.deps.idFactory();
      const absPath = this.deps.files.galleryItemFile(itemId, ext, date);
      await this.deps.writeFile(absPath, out.bytes);
      const relPath = relativeToData(absPath, this.deps.files.dataDir);
      const item = this.deps.gallery.create({
        id: itemId,
        kind: "audio",
        parentId: overrides.parentId ?? null,
        prompt: req.prompt,
        providerId: req.providerId,
        model: req.model,
        paramsJson: JSON.stringify({
          voice: req.voice,
          speed: req.speed,
          outputFormat: req.outputFormat,
          raw: { ...(req.raw ?? {}), ...(out.raw ?? {}) },
        }),
        relPath,
        thumbPath: null,
        durationMs: out.durationMs ?? null,
        width: null,
        height: null,
        bytes: out.bytes.byteLength,
        jobId: job.id,
        favorited: false,
        createdAt: now,
      });

      if (overrides.boardId && this.deps.boards) {
        try {
          if (!this.deps.boards.hasItem(overrides.boardId, item.id)) {
            this.deps.boards.appendItem(overrides.boardId, item.id);
          }
        } catch (err) {
          this.deps.logger.warn("appendItem failed", {
            id: job.id,
            boardId: overrides.boardId,
            err: String(err),
          });
        }
      }
      this.intentOverrides.delete(job.id);
      this.throwIfPersistedCancelled(job.id, req.providerId);

      const updated = this.deps.jobs.updateState(job.id, {
        state: "succeeded",
        progress: 1,
        resultItemId: item.id,
        finishedAt: now,
      });
      this.running.delete(job.id);
      this.emit("job.completed", updated);
    } catch (err) {
      this.running.delete(job.id);
      this.intentOverrides.delete(job.id);
      const aborted = isAbortError(err) || err instanceof ProviderAbortError;
      if (!aborted) {
        this.deps.logger.error("audio generation failed", {
          jobId: job.id,
          providerId: job.providerId,
          model: req.model,
          err,
        });
      }
      const updated = this.updateFailedState(job.id, aborted, err);
      this.emit("job.failed", updated);
    }
  }
```

> Note: `mimeToExt`, `relativeToData`, `throwIfPersistedCancelled`, `updateFailedState` already exist in this file (used by the image path). Ensure `mimeToExt` maps audio mime types — see Task 2.3.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @imagent/core test -- job-runner.audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application/job-runner.ts packages/core/src/application/job-runner.audio.test.ts
git commit -m "feat(core): add audio generation path to JobRunner"
```

### Task 2.3: Map audio MIME types to file extensions

**Files:**
- Modify: `packages/core/src/application/job-runner.ts` (the `mimeToExt` helper near the bottom)
- Test: extend `packages/core/src/application/job-runner.audio.test.ts`

- [ ] **Step 1: Find the helper**

Run: `grep -n "function mimeToExt" packages/core/src/application/job-runner.ts`

- [ ] **Step 2: Write the failing assertion**

Add to the audio test file a case where the provider returns `audio/wav` and assert the written path ends in `.wav`:

```ts
  it("maps audio/wav to .wav", async () => {
    const provider: AudioProvider = {
      id: "elevenlabs",
      displayName: "ElevenLabs",
      capabilities: { outputFormats: ["wav_44100"], supportsVoiceDiscovery: true },
      models: new Map(),
      async generate() {
        return { output: { bytes: new Uint8Array([9]), mimeType: "audio/wav" } };
      },
    };
    const { deps } = makeDeps(provider);
    const runner = new JobRunner(deps as never);
    const done = new Promise((res) => runner.once("job.completed", res));
    await runner.start({
      kind: "audio",
      request: { prompt: "hi", providerId: "elevenlabs", model: "tts", assetIds: [] },
    });
    await done;
    expect(deps.writeFile).toHaveBeenCalledWith("/data/gallery/id-1.wav", new Uint8Array([9]));
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun run --filter @imagent/core test -- job-runner.audio`
Expected: FAIL — wav maps to a fallback extension.

- [ ] **Step 4: Implement**

In `mimeToExt`, add audio cases (keep existing image/video cases). Example shape:

```ts
function mimeToExt(mime: string): string {
  switch (mime) {
    // ... existing image/video cases ...
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
    case "audio/opus":
      return "ogg";
    case "audio/aac":
      return "aac";
    case "audio/pcm":
    case "audio/L16":
      return "pcm";
    default:
      // ... existing default ...
  }
}
```

(Preserve the existing `default` behavior — only add the new audio `case`s above it.)

- [ ] **Step 5: Run to verify it passes & commit**

```bash
bun run --filter @imagent/core test -- job-runner.audio
git add packages/core/src/application/job-runner.ts packages/core/src/application/job-runner.audio.test.ts
git commit -m "feat(core): map audio mime types to file extensions"
```

### Task 2.4: Build core + run full core test suite

- [ ] **Step 1: Build & test**

Run:
```bash
bun run --filter @imagent/core build && bun run --filter @imagent/core test
```
Expected: PASS (all core tests, including pre-existing).

- [ ] **Step 2: Commit (only if generated dist is tracked; otherwise skip)**

```bash
git add -A packages/core && git commit -m "chore(core): rebuild after audio domain additions" || echo "nothing to commit"
```

---

# Phase 3 — Persistence: widen `kind` CHECK to allow `audio`

The `jobs` and `gallery_items` tables both carry `CHECK (kind IN ('image','video'))`. SQLite cannot `ALTER` a CHECK constraint, and `gallery_items` is the content table for `gallery_items_fts` (with rowid-keyed triggers) and is referenced by foreign keys (`board_items`, `gallery_item_assets`). The safe, minimal way to **relax** (widen) a CHECK is to patch the stored schema text via `writable_schema`, which preserves rowids, FTS mapping, and FKs. `PRAGMA writable_schema=RESET` forces the connection to reload the patched schema.

### Task 3.1: Add migration `004_audio.sql`

**Files:**
- Create: `packages/persistence/src/migrations/004_audio.sql`

- [ ] **Step 1: Create the migration**

```sql
-- 004_audio.sql — widen jobs/gallery_items kind CHECK to include 'audio'.
--
-- SQLite cannot ALTER a CHECK constraint. Recreating these tables would break
-- the gallery_items_fts content mapping (rowid-keyed) and the foreign keys
-- that reference gallery_items. Instead we relax the constraint by patching
-- the stored CREATE TABLE text via writable_schema — this preserves rowids,
-- FTS, and FKs. The patched substring is identical on both tables. Widening a
-- CHECK can never invalidate existing rows, so this is safe. RESET reloads the
-- schema on this connection so the new constraint takes effect immediately.
PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(
  sql,
  'kind IN (''image'',''video'')',
  'kind IN (''image'',''video'',''audio'')'
)
WHERE type = 'table' AND name IN ('jobs', 'gallery_items');

PRAGMA writable_schema = RESET;
```

- [ ] **Step 2: Commit**

```bash
git add packages/persistence/src/migrations/004_audio.sql
git commit -m "feat(persistence): add 004 migration widening kind CHECK for audio"
```

### Task 3.2: Register migration 004 in the loader (both SEA + filesystem branches)

**Files:**
- Modify: `packages/persistence/src/db.ts` (`loadBuiltinMigrations`)
- Modify: `apps/cli/sea-config.json`

- [ ] **Step 1: Patch the SEA branch**

In `loadBuiltinMigrations`, add the SEA asset read and entry:

```ts
  const seaInit = readSeaAsset("001_init.sql");
  const seaFts = readSeaAsset("002_fts.sql");
  const seaJiebaFts = readSeaAsset("003_jieba_fts.sql");
  const seaAudio = readSeaAsset("004_audio.sql");
  if (seaInit && seaFts && seaJiebaFts && seaAudio) {
    return [
      { version: 1, name: "001_init", sql: seaInit },
      { version: 2, name: "002_fts", sql: seaFts },
      { version: 3, name: "003_jieba_fts", sql: seaJiebaFts },
      { version: 4, name: "004_audio", sql: seaAudio },
    ];
  }
```

- [ ] **Step 2: Patch the filesystem branch**

At the bottom of `loadBuiltinMigrations`:

```ts
  const init = readFileSync(path.join(dir, "001_init.sql"), "utf8");
  const fts = readFileSync(path.join(dir, "002_fts.sql"), "utf8");
  const jiebaFts = readFileSync(path.join(dir, "003_jieba_fts.sql"), "utf8");
  const audio = readFileSync(path.join(dir, "004_audio.sql"), "utf8");
  return [
    { version: 1, name: "001_init", sql: init },
    { version: 2, name: "002_fts", sql: fts },
    { version: 3, name: "003_jieba_fts", sql: jiebaFts },
    { version: 4, name: "004_audio", sql: audio },
  ];
```

- [ ] **Step 3: Add the SEA asset mapping**

In `apps/cli/sea-config.json`, add to `assets`:

```json
    "004_audio.sql": "../../packages/persistence/src/migrations/004_audio.sql"
```

(Add a comma after the `003_jieba_fts.sql` line.)

- [ ] **Step 4: Commit**

```bash
git add packages/persistence/src/db.ts apps/cli/sea-config.json
git commit -m "feat(persistence): register 004 audio migration (sea + fs)"
```

### Task 3.3: Test the migration end-to-end

**Files:**
- Test: `packages/persistence/src/migrations.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/persistence/src/migrations.audio.test.ts
import { describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";

function insertGalleryItem(db: ReturnType<typeof openDatabase>, id: string, kind: string): void {
  db.prepare(
    `INSERT INTO gallery_items (id, kind, prompt, provider_id, model, params_json, rel_path, bytes, created_at)
     VALUES (?, ?, ?, 'p', 'm', '{}', 'g/x', 1, 1000)`,
  ).run(id, kind, `${kind} prompt`);
}

describe("004 audio migration", () => {
  it("allows kind='audio' on gallery_items and jobs", () => {
    const db = openDatabase(":memory:");
    expect(() => insertGalleryItem(db, "a1", "audio")).not.toThrow();
    expect(() =>
      db
        .prepare(
          `INSERT INTO jobs (id, kind, state, provider_id, request_json, created_at, updated_at)
           VALUES ('j1','audio','running','p','{}',1,1)`,
        )
        .run(),
    ).not.toThrow();
    db.close();
  });

  it("still rejects unknown kinds (constraint intact)", () => {
    const db = openDatabase(":memory:");
    expect(() => insertGalleryItem(db, "x1", "text")).toThrow();
    db.close();
  });

  it("keeps FTS search working for audio rows", () => {
    const db = openDatabase(":memory:");
    insertGalleryItem(db, "a2", "audio");
    const rows = db
      .prepare(
        `SELECT g.id FROM gallery_items g
         JOIN gallery_items_fts f ON f.rowid = g.rowid
         WHERE gallery_items_fts MATCH 'audio'`,
      )
      .all() as { id: string }[];
    expect(rows.some((r) => r.id === "a2")).toBe(true);
    db.close();
  });
});
```

> If `jobs`/`gallery_items` column names differ from the guesses above, run
> `sqlite3` mentally against `001_init.sql` and adjust the INSERT column lists.
> Confirm exact columns first: `grep -A40 "CREATE TABLE gallery_items" packages/persistence/src/migrations/001_init.sql`.

- [ ] **Step 2: Verify column names, then run the test**

Run:
```bash
grep -n -A40 "CREATE TABLE gallery_items" packages/persistence/src/migrations/001_init.sql
grep -n -A20 "CREATE TABLE jobs" packages/persistence/src/migrations/001_init.sql
bun run --filter @imagent/persistence test -- migrations.audio
```
Expected: PASS (after correcting any column names in the INSERTs).

- [ ] **Step 3: Build + full persistence suite**

Run:
```bash
bun run --filter @imagent/core build
bun run --filter @imagent/persistence build && bun run --filter @imagent/persistence test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/persistence/src/migrations.audio.test.ts
git commit -m "test(persistence): cover audio kind migration + FTS"
```

---

# Phase 4 — Config: ElevenLabs secret, MiniMax groupId, audio routing + default

### Task 4.1: Add `elevenlabs` secret + audio routing + `groupId` + audio default model

**Files:**
- Modify: `packages/config/src/schema.ts`
- Test: `packages/config/src/schema.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/config/src/schema.audio.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  ProviderPreferencesSchema,
  ProviderSecretsSchema,
} from "./schema.js";

describe("audio config", () => {
  it("parses an elevenlabs secret", () => {
    const s = ProviderSecretsSchema.parse({ elevenlabs: { apiKey: "k" } });
    expect(s.elevenlabs?.apiKey).toBe("k");
  });

  it("accepts minimax.groupId and audio offerings in prefs", () => {
    const p = ProviderPreferencesSchema.parse({
      minimax: { groupId: "g123", audio: [{ id: "speech-02", modelId: "minimax-speech-02" }] },
      elevenlabs: { audio: [{ id: "rachel", modelId: "eleven_multilingual_v2" }] },
    });
    expect(p.minimax.groupId).toBe("g123");
    expect(p.elevenlabs.audio?.[0]?.id).toBe("rachel");
  });

  it("DEFAULT_CONFIG has an elevenlabs routing slot and null audio default", () => {
    expect(DEFAULT_CONFIG.providers.elevenlabs).toEqual({});
    expect(DEFAULT_CONFIG.app.defaultAudioModel).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @imagent/config test -- schema.audio`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `packages/config/src/schema.ts`:

1. Import the audio offering schema at the top (with the existing core imports):

```ts
import { AudioProviderModelSchema } from "@imagent/core";
```

2. Add `elevenlabs` to `ProviderSecretsSchema`'s object (after `minimax`):

```ts
    elevenlabs: z.object({ apiKey: z.string() }).optional(),
```

3. Extend `ProviderRoutingSchema` with `audio` offerings and a `groupId`:

```ts
export const ProviderRoutingSchema = z.object({
  displayName: z.string().optional(),
  endpoint: z.string().optional(),
  baseUrl: z.string().optional(),
  /** MiniMax T2A v2 GroupId — required only for MiniMax audio generation. */
  groupId: z.string().optional(),
  image: z.array(ImageProviderModelSchema).optional(),
  video: z.array(VideoProviderModelSchema).optional(),
  audio: z.array(AudioProviderModelSchema).optional(),
});
```

4. Add `elevenlabs` to `ProviderPreferencesSchema`'s object (after `minimax`):

```ts
    elevenlabs: ProviderRoutingSchema.default({}),
```

5. Add `defaultAudioModel` to `AppPreferencesSchema` (after `defaultVideoModel`):

```ts
  defaultAudioModel: DefaultModelPreferenceSchema.nullable().default(null),
```

6. Add `elevenlabs: {}` to `DEFAULT_CONFIG.providers` (after `minimax: {}`).

- [ ] **Step 4: Run to verify it passes**

Run: `bun run --filter @imagent/config test -- schema.audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/schema.ts packages/config/src/schema.audio.test.ts
git commit -m "feat(config): add elevenlabs secret, audio routing, groupId, audio default"
```

### Task 4.2: Read `ELEVENLABS_API_KEY` from env

**Files:**
- Modify: `packages/config/src/secrets.ts`
- Test: `packages/config/src/secrets.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/config/src/secrets.audio.test.ts
import { describe, expect, it } from "vitest";
import { createEnvSecretsStore } from "./secrets.js";

describe("env secrets — elevenlabs", () => {
  it("reads ELEVENLABS_API_KEY", async () => {
    const store = createEnvSecretsStore({ ELEVENLABS_API_KEY: "k" });
    const s = await store.loadSecrets();
    expect(s.elevenlabs?.apiKey).toBe("k");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @imagent/config test -- secrets.audio`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `packages/config/src/secrets.ts`:

1. Add to the `ENV_KEYS` object:

```ts
  elevenlabs: { apiKey: "ELEVENLABS_API_KEY" },
```

2. In the env-reading function (next to the other `out.<vendor>` blocks):

```ts
      const elevenKey = env[ENV_KEYS.elevenlabs.apiKey];
      if (elevenKey) out.elevenlabs = { apiKey: elevenKey };
```

- [ ] **Step 4: Run to verify it passes & build**

Run:
```bash
bun run --filter @imagent/config test -- secrets.audio
bun run --filter @imagent/config build && bun run --filter @imagent/config test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/secrets.ts packages/config/src/secrets.audio.test.ts
git commit -m "feat(config): read ELEVENLABS_API_KEY from env"
```

### Task 4.3: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the env var** near the other API keys:

```bash
# ElevenLabs (text-to-speech)
ELEVENLABS_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document ELEVENLABS_API_KEY"
```

---

# Phase 5 — Catalog: thread `audio` through schema, defaults, loader, resolve

### Task 5.1: Add `audio` to the catalog schema

**Files:**
- Modify: `packages/providers/src/catalog/schema.ts`
- Test: `packages/providers/src/catalog/schema.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/providers/src/catalog/schema.audio.test.ts
import { describe, expect, it } from "vitest";
import { ModelCatalogSchema } from "./schema.js";

const base = {
  version: 2 as const,
  models: {
    image: {},
    video: {},
    audio: {
      "eleven_multilingual_v2": {
        id: "eleven_multilingual_v2",
        capabilities: { supportsVoiceDiscovery: true, outputFormats: ["mp3_44100_128"] },
      },
    },
  },
  providers: {
    elevenlabs: { displayName: "ElevenLabs", audio: [{ id: "rachel", modelId: "eleven_multilingual_v2" }] },
  },
};

describe("catalog audio schema", () => {
  it("parses a catalog with audio models + offerings", () => {
    const parsed = ModelCatalogSchema.parse(base);
    expect(parsed.models.audio.eleven_multilingual_v2.id).toBe("eleven_multilingual_v2");
  });

  it("defaults models.audio to {} when omitted", () => {
    const parsed = ModelCatalogSchema.parse({ version: 2, models: { image: {}, video: {} }, providers: {} });
    expect(parsed.models.audio).toEqual({});
  });

  it("rejects an audio offering referencing an unknown model", () => {
    expect(() =>
      ModelCatalogSchema.parse({
        ...base,
        providers: { elevenlabs: { audio: [{ id: "x", modelId: "nope" }] } },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @imagent/core build && bun run --filter @imagent/providers test -- catalog/schema.audio`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `packages/providers/src/catalog/schema.ts`:

1. Import audio schemas from core (extend the existing import block):

```ts
import {
  AudioModelCapsOverrideSchema,
  AudioModelDefSchema,
  type AudioProviderModel,
  AudioProviderModelSchema,
  // ...existing image/video imports...
} from "@imagent/core";
```

2. Extend the merged caps override (so `modelOverrides` can carry audio fields):

```ts
const ModelCapsOverrideSchema = ImageModelCapsOverrideSchema.merge(VideoModelCapsOverrideSchema).merge(
  AudioModelCapsOverrideSchema,
);
```

3. Re-export the audio offering schema next to the image/video re-exports:

```ts
export { type AudioProviderModel, AudioProviderModelSchema };
```

4. Add `audio` to `ProviderCatalogSchema`:

```ts
  audio: z.array(AudioProviderModelSchema).optional(),
```

5. Add `audio` to `ModelCatalogSchema.models` with a default:

```ts
    models: z.object({
      image: z.record(z.string(), ImageModelDefSchema),
      video: z.record(z.string(), VideoModelDefSchema),
      audio: z.record(z.string(), AudioModelDefSchema).default({}),
    }),
```

6. In the `superRefine`, add audio-model key check + audio-offering check (mirror the image/video loops):

```ts
    for (const [id, model] of Object.entries(catalog.models.audio)) {
      if (model.id !== id) {
        ctx.addIssue({
          code: "custom",
          path: ["models", "audio", id, "id"],
          message: `audio model key '${id}' must match model.id '${model.id}'`,
        });
      }
    }
    // inside the existing `for (const [providerId, provider] of ...)` loop:
    for (const offering of provider.audio ?? []) {
      if (!catalog.models.audio[offering.modelId]) {
        ctx.addIssue({
          code: "custom",
          path: ["providers", providerId, "audio", offering.id, "modelId"],
          message: `audio offering '${offering.id}' references unknown model '${offering.modelId}'`,
        });
      }
    }
```

7. Add an audio overlay def + thread it into `ModelCatalogOverlaySchema.models`:

```ts
const AudioModelDefOverlaySchema = AudioModelDefSchema.omit({ capabilities: true })
  .partial()
  .extend({ capabilities: AudioModelCapsOverrideSchema.optional() });
```
and in the overlay `models` object:
```ts
        audio: z.record(z.string(), AudioModelDefOverlaySchema).optional(),
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run --filter @imagent/providers test -- catalog/schema.audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/providers/src/catalog/schema.ts packages/providers/src/catalog/schema.audio.test.ts
git commit -m "feat(providers): thread audio through catalog schema"
```

### Task 5.2: Merge `audio` in the catalog overlay loader

**Files:**
- Modify: `packages/providers/src/catalog/loader.ts`

- [ ] **Step 1: Patch the model merge**

After the `overlay.models?.video` loop, add:

```ts
  for (const [id, model] of Object.entries(overlay.models?.audio ?? {})) {
    merged.models.audio[id] = mergeRecord(merged.models.audio[id], model);
  }
```

- [ ] **Step 2: Patch the provider offerings merge**

In the provider-merge object literal (alongside `image:`/`video:`), add:

```ts
      audio:
        providerOverlay.audio === undefined
          ? current.audio
          : mergeOfferings(current.audio, providerOverlay.audio),
```

- [ ] **Step 3: Build + run existing catalog tests**

Run: `bun run --filter @imagent/providers test -- catalog/`
Expected: PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add packages/providers/src/catalog/loader.ts
git commit -m "feat(providers): merge audio offerings in catalog overlay"
```

### Task 5.3: Audio resolve helpers

**Files:**
- Modify: `packages/providers/src/catalog/resolve.ts`
- Test: `packages/providers/src/catalog/resolve.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/providers/src/catalog/resolve.audio.test.ts
import { describe, expect, it } from "vitest";
import { ModelCatalogSchema } from "./schema.js";
import { resolveAudioProviderModels } from "./resolve.js";

const catalog = ModelCatalogSchema.parse({
  version: 2,
  models: {
    image: {},
    video: {},
    audio: {
      eleven_multilingual_v2: {
        id: "eleven_multilingual_v2",
        capabilities: { supportsVoiceDiscovery: true, outputFormats: ["mp3_44100_128"] },
        defaults: { outputFormat: "mp3_44100_128" },
      },
    },
  },
  providers: {
    elevenlabs: { audio: [{ id: "rachel", modelId: "eleven_multilingual_v2", defaults: { voice: "rachel" } }] },
  },
});

describe("resolveAudioProviderModels", () => {
  it("resolves offering → AudioModelDef with merged caps + defaults", () => {
    const models = resolveAudioProviderModels(catalog, "elevenlabs");
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe("rachel");
    expect(models[0]?.capabilities?.supportsVoiceDiscovery).toBe(true);
    expect(models[0]?.defaults?.voice).toBe("rachel");
    expect(models[0]?.defaults?.outputFormat).toBe("mp3_44100_128");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @imagent/providers test -- catalog/resolve.audio`
Expected: FAIL.

- [ ] **Step 3: Implement (append to `packages/providers/src/catalog/resolve.ts`)**

Extend the core import with `AudioModelDefSchema`, `type AudioModelDef`, `type AudioProviderModel`, then add:

```ts
export function effectiveAudioOfferings(
  catalog: ModelCatalog,
  prefs: ProviderPreferences | undefined,
  providerId: string,
): AudioProviderModel[] {
  const catalogList = catalog.providers[providerId]?.audio ?? [];
  const configList = readRouting(prefs, providerId)?.audio ?? [];
  return mergeOfferings(catalogList, configList);
}

export function resolveAudioProviderModels(
  catalog: ModelCatalog,
  providerId: string,
  prefs?: ProviderPreferences,
): AudioModelDef[] {
  return effectiveAudioOfferings(catalog, prefs, providerId).map((offering) =>
    resolveAudioProviderModel(catalog, providerId, offering),
  );
}

export function resolveAudioProviderModel(
  catalog: ModelCatalog,
  providerId: string,
  offering: AudioProviderModel,
): AudioModelDef {
  const baseModel = catalog.models.audio[offering.modelId];
  if (!baseModel) {
    throw new Error(
      `Provider '${providerId}' audio model '${offering.id}' references unknown canonical model '${offering.modelId}'`,
    );
  }
  const providerOverride = catalog.providers[providerId]?.modelOverrides?.[offering.modelId];
  return AudioModelDefSchema.parse({
    id: offering.id,
    baseModelId: offering.modelId,
    displayName: providerDisplayName(offering, baseModel),
    capabilities: {
      ...(baseModel.capabilities ?? {}),
      ...(providerOverride?.capabilities ?? {}),
      ...(offering.capabilities ?? {}),
    },
    defaults: {
      ...(baseModel.defaults ?? {}),
      ...(providerOverride?.defaults ?? {}),
      ...(offering.defaults ?? {}),
    },
  });
}
```

> `mergeOfferings`, `readRouting`, `providerDisplayName` already exist in this file.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run --filter @imagent/providers test -- catalog/resolve.audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/providers/src/catalog/resolve.ts packages/providers/src/catalog/resolve.audio.test.ts
git commit -m "feat(providers): add audio offering resolve helpers"
```

### Task 5.4: Seed the bundled catalog with audio models + offerings

**Files:**
- Modify: `packages/providers/src/catalog.default.json`

- [ ] **Step 1: Add `models.audio`** — inside `"models"`, after the `"video"` map, add:

```json
    "audio": {
      "eleven_multilingual_v2": {
        "id": "eleven_multilingual_v2",
        "displayName": "ElevenLabs Multilingual v2",
        "capabilities": {
          "supportsVoiceDiscovery": true,
          "outputFormats": ["mp3_44100_128", "mp3_44100_192", "mp3_22050_32", "pcm_16000", "pcm_24000", "ulaw_8000"],
          "extraKnobs": {
            "stability": { "type": "number", "min": 0, "max": 1 },
            "similarity_boost": { "type": "number", "min": 0, "max": 1 },
            "style": { "type": "number", "min": 0, "max": 1 }
          }
        },
        "defaults": { "outputFormat": "mp3_44100_128" }
      },
      "eleven_flash_v2_5": {
        "id": "eleven_flash_v2_5",
        "displayName": "ElevenLabs Flash v2.5",
        "capabilities": {
          "supportsVoiceDiscovery": true,
          "outputFormats": ["mp3_44100_128", "mp3_22050_32", "pcm_16000", "pcm_24000"]
        },
        "defaults": { "outputFormat": "mp3_44100_128" }
      },
      "minimax-speech-02": {
        "id": "minimax-speech-02",
        "displayName": "MiniMax Speech 02",
        "capabilities": {
          "supportsVoiceDiscovery": false,
          "outputFormats": ["mp3", "wav", "pcm"],
          "speedRange": { "min": 0.5, "max": 2 },
          "voices": [
            { "id": "male-qn-qingse", "name": "Qingse (M)" },
            { "id": "female-shaonv", "name": "Shaonv (F)" },
            { "id": "presenter_male", "name": "Presenter (M)" },
            { "id": "presenter_female", "name": "Presenter (F)" }
          ],
          "extraKnobs": {
            "emotion": { "type": "enum", "values": ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"] },
            "vol": { "type": "number", "min": 0, "max": 10 },
            "pitch": { "type": "number", "min": -12, "max": 12 }
          }
        },
        "defaults": { "outputFormat": "mp3", "voice": "presenter_female", "speed": 1 }
      }
    }
```

> Insert a comma after the closing brace of the `"video"` map so JSON stays valid.

- [ ] **Step 2: Add the `elevenlabs` provider + MiniMax audio offerings** — inside `"providers"`:

Add a new `elevenlabs` entry (place before `minimax`):

```json
    "elevenlabs": {
      "displayName": "ElevenLabs",
      "audio": [
        { "id": "eleven_multilingual_v2", "modelId": "eleven_multilingual_v2" },
        { "id": "eleven_flash_v2_5", "modelId": "eleven_flash_v2_5" }
      ]
    },
```

And add an `audio` array to the existing `minimax` provider object (after its `video` array):

```json
      "audio": [
        { "id": "speech-02-hd", "modelId": "minimax-speech-02" }
      ]
```

> The MiniMax offering id (`speech-02-hd`) is the provider-facing `model` value sent in the request body; adjust to the exact MiniMax model id you intend to call. Add a comma after the `video` array.

- [ ] **Step 3: Validate the catalog parses**

Run: `bun run --filter @imagent/providers test -- catalog/`
Expected: PASS (the loader test parses `catalog.default.json`).

- [ ] **Step 4: Commit**

```bash
git add packages/providers/src/catalog.default.json
git commit -m "feat(providers): seed catalog with ElevenLabs + MiniMax TTS models"
```

---

# Phase 6 — Providers: BaseAudioProvider, ElevenLabs, MiniMax TTS, registry

### Task 6.1: `aggregateAudioCapabilities` + `BaseAudioProvider`

**Files:**
- Modify: `packages/providers/src/common/capabilities.ts` (append)
- Create: `packages/providers/src/common/audio-provider.ts`
- Modify: `packages/providers/src/common/index.ts`
- Test: `packages/providers/src/common/audio-provider.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/providers/src/common/audio-provider.test.ts
import type { AudioModelDef, AudioRequest, AudioGenerationResult } from "@imagent/core";
import { describe, expect, it } from "vitest";
import { BaseAudioProvider } from "./audio-provider.js";

class StubAudio extends BaseAudioProvider {
  lastModelId?: string;
  protected async doGenerate(req: AudioRequest, model: AudioModelDef): Promise<AudioGenerationResult> {
    this.lastModelId = model.id;
    return { output: { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" } };
  }
  protected async doTest() {
    return { ok: true as const, latencyMs: 1 };
  }
}

const models = new Map<string, AudioModelDef>([
  [
    "m",
    {
      id: "m",
      capabilities: { supportsVoiceDiscovery: false, outputFormats: ["mp3"], voices: [{ id: "v", name: "V" }] },
      defaults: { voice: "v", outputFormat: "mp3" },
    },
  ],
]);

describe("BaseAudioProvider", () => {
  it("applies defaults + validates, then calls doGenerate", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    const res = await p.generate({ prompt: "hi", providerId: "p", model: "m", assetIds: [] });
    expect(res.output.mimeType).toBe("audio/mpeg");
    expect(p.lastModelId).toBe("m");
    expect(p.capabilities.outputFormats).toContain("mp3");
  });

  it("rejects an unknown model", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    await expect(p.generate({ prompt: "hi", providerId: "p", model: "nope", assetIds: [] })).rejects.toThrow();
  });

  it("rejects an unsupported voice via validation", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    await expect(
      p.generate({ prompt: "hi", providerId: "p", model: "m", voice: "bad", assetIds: [] }),
    ).rejects.toThrow(/voice/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @imagent/providers test -- common/audio-provider`
Expected: FAIL.

- [ ] **Step 3: Implement `aggregateAudioCapabilities`** (append to `common/capabilities.ts`)

Extend the core import to include `AudioCapabilities`, `AudioModelDef`, then add:

```ts
export function aggregateAudioCapabilities(
  models: ReadonlyMap<string, AudioModelDef>,
): AudioCapabilities {
  const outputFormats = new Set<string>();
  let supportsVoiceDiscovery = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const f of c.outputFormats ?? []) outputFormats.add(f);
    supportsVoiceDiscovery ||= c.supportsVoiceDiscovery === true;
  }
  return { outputFormats: [...outputFormats], supportsVoiceDiscovery };
}
```

- [ ] **Step 4: Implement `BaseAudioProvider`**

```ts
// packages/providers/src/common/audio-provider.ts
import {
  applyAudioDefaults,
  type AudioCapabilities,
  type AudioGenerationResult,
  type AudioModelDef,
  type AudioProvider,
  type AudioRequest,
  type Logger,
  ProviderRequestError,
  type ProviderTestResult,
  validateAudioRequestAgainstModel,
  type VoiceInfo,
} from "@imagent/core";
import { aggregateAudioCapabilities } from "./capabilities.js";

export interface BaseAudioProviderOptions {
  providerId: string;
  displayName: string;
  models: ReadonlyMap<string, AudioModelDef>;
  logger?: Logger;
}

export abstract class BaseAudioProvider implements AudioProvider {
  readonly id: string;
  readonly displayName: string;
  readonly models: ReadonlyMap<string, AudioModelDef>;
  readonly capabilities: AudioCapabilities;
  protected readonly logger?: Logger;

  constructor(options: BaseAudioProviderOptions) {
    this.id = options.providerId;
    this.displayName = options.displayName;
    this.models = options.models;
    this.capabilities = aggregateAudioCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
  }

  async generate(req: AudioRequest, signal?: AbortSignal): Promise<AudioGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) throw this.unknownModelError(req.model);
    const merged = applyAudioDefaults(req, model);
    validateAudioRequestAgainstModel(this.id, merged, model);
    return this.doGenerate(merged, model, signal);
  }

  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    try {
      return await this.doTest(signal);
    } catch (err) {
      this.logger?.debug?.(`${this.id} test() threw`, { err: String(err) });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Default: no live discovery. Subclasses override when an API exists. */
  listVoices?(signal?: AbortSignal): Promise<VoiceInfo[]>;

  protected unknownModelError(modelId: string): ProviderRequestError {
    return new ProviderRequestError(`unknown model '${modelId}' for ${this.id}`, {
      vendorId: this.id,
    });
  }

  protected abstract doGenerate(
    merged: AudioRequest,
    model: AudioModelDef,
    signal?: AbortSignal,
  ): Promise<AudioGenerationResult>;

  protected abstract doTest(signal?: AbortSignal): Promise<ProviderTestResult>;
}
```

Add to `common/index.ts`:

```ts
export * from "./audio-provider.js";
```

- [ ] **Step 5: Run to verify it passes & commit**

```bash
bun run --filter @imagent/core build
bun run --filter @imagent/providers test -- common/audio-provider
git add packages/providers/src/common/capabilities.ts packages/providers/src/common/audio-provider.ts packages/providers/src/common/index.ts packages/providers/src/common/audio-provider.test.ts
git commit -m "feat(providers): add BaseAudioProvider + audio capability aggregation"
```

### Task 6.2: ElevenLabs audio provider

**Files:**
- Create: `packages/providers/src/elevenlabs/audio.ts`
- Test: `packages/providers/src/elevenlabs/audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/providers/src/elevenlabs/audio.test.ts
import type { AudioModelDef } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { ElevenLabsAudioProvider } from "./audio.js";

const models = new Map<string, AudioModelDef>([
  [
    "eleven_multilingual_v2",
    {
      id: "eleven_multilingual_v2",
      capabilities: { supportsVoiceDiscovery: true, outputFormats: ["mp3_44100_128"] },
      defaults: { outputFormat: "mp3_44100_128", voice: "rachel" },
    },
  ],
]);

function mockFetch(body: BodyInit, init?: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(body, { status: 200, ...init })) as unknown as typeof fetch;
}

describe("ElevenLabsAudioProvider", () => {
  it("POSTs to /v1/text-to-speech/{voice} with output_format query and returns bytes", async () => {
    const fetchMock = mockFetch(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "audio/mpeg" },
    });
    const provider = new ElevenLabsAudioProvider({ apiKey: "k", models, fetch: fetchMock });
    const res = await provider.generate({
      prompt: "hello",
      providerId: "elevenlabs",
      model: "eleven_multilingual_v2",
      voice: "rachel",
      assetIds: [],
    });
    expect(res.output.mimeType).toBe("audio/mpeg");
    expect(res.output.bytes).toEqual(new Uint8Array([1, 2, 3]));
    const url = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;
    expect(url).toContain("/v1/text-to-speech/rachel");
    expect(url).toContain("output_format=mp3_44100_128");
  });

  it("lists voices from /v1/voices", async () => {
    const fetchMock = mockFetch(
      JSON.stringify({ voices: [{ voice_id: "rachel", name: "Rachel", preview_url: "u" }] }),
      { headers: { "content-type": "application/json" } },
    );
    const provider = new ElevenLabsAudioProvider({ apiKey: "k", models, fetch: fetchMock });
    const voices = await provider.listVoices();
    expect(voices[0]).toEqual({ id: "rachel", name: "Rachel", previewUrl: "u" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @imagent/providers test -- elevenlabs/audio`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/providers/src/elevenlabs/audio.ts
import {
  type AudioGenerationResult,
  type AudioModelDef,
  type AudioRequest,
  type Logger,
  ProviderResponseError,
  type ProviderTestResult,
  type VoiceInfo,
} from "@imagent/core";
import { BaseAudioProvider } from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";

export const DEFAULT_ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

export interface ElevenLabsAudioProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, AudioModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

interface ElevenVoicesResponse {
  voices?: Array<{
    voice_id?: string;
    name?: string;
    preview_url?: string;
    labels?: Record<string, string>;
  }> | null;
}

export class ElevenLabsAudioProvider extends BaseAudioProvider {
  private readonly http: HttpClient;

  constructor(options: ElevenLabsAudioProviderOptions) {
    super({
      providerId: "elevenlabs",
      displayName: "ElevenLabs",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    const baseUrl = (options.baseUrl ?? DEFAULT_ELEVENLABS_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      baseUrl,
      headers: { "xi-api-key": options.apiKey },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  protected async doGenerate(
    merged: AudioRequest,
    model: AudioModelDef,
    signal?: AbortSignal,
  ): Promise<AudioGenerationResult> {
    const voiceId = merged.voice;
    if (!voiceId) {
      throw new ProviderResponseError("ElevenLabs requires a voice id (set --option voice=<id>)", {
        vendorId: this.id,
      });
    }
    const format = merged.outputFormat ?? "mp3_44100_128";
    const path = `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(format)}`;
    const voiceSettings = pickVoiceSettings(merged.raw);
    const body: Record<string, unknown> = {
      text: merged.prompt,
      model_id: model.baseModelId ?? model.id,
      ...(voiceSettings ? { voice_settings: voiceSettings } : {}),
    };
    const init: RequestInit = { method: "POST", body: JSON.stringify(body) };
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.raw(path, init, opts);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.byteLength === 0) {
      throw new ProviderResponseError("ElevenLabs returned empty audio", { vendorId: this.id });
    }
    const mimeType = res.headers.get("content-type") ?? mimeForFormat(format);
    return { output: { bytes, mimeType, raw: { outputFormat: format } } };
  }

  async listVoices(signal?: AbortSignal): Promise<VoiceInfo[]> {
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.get<ElevenVoicesResponse>("/v1/voices", opts);
    return (res.voices ?? [])
      .filter((v): v is { voice_id: string; name?: string } => typeof v.voice_id === "string")
      .map((v) => ({
        id: v.voice_id,
        name: v.name ?? v.voice_id,
        ...(typeof (v as { preview_url?: string }).preview_url === "string"
          ? { previewUrl: (v as { preview_url?: string }).preview_url }
          : {}),
        ...((v as { labels?: Record<string, string> }).labels
          ? { labels: (v as { labels?: Record<string, string> }).labels }
          : {}),
      }));
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    await this.http.get("/v1/voices", opts);
    return { ok: true, latencyMs: Date.now() - started };
  }
}

function pickVoiceSettings(raw: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const keys = ["stability", "similarity_boost", "style", "use_speaker_boost"] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (raw[k] !== undefined) out[k] = raw[k];
  return Object.keys(out).length > 0 ? out : undefined;
}

function mimeForFormat(format: string): string {
  if (format.startsWith("mp3")) return "audio/mpeg";
  if (format.startsWith("wav")) return "audio/wav";
  if (format.startsWith("pcm")) return "audio/pcm";
  if (format.startsWith("opus")) return "audio/opus";
  if (format.startsWith("ulaw") || format.startsWith("alaw")) return "audio/basic";
  return "application/octet-stream";
}
```

- [ ] **Step 4: Run to verify it passes & commit**

```bash
bun run --filter @imagent/providers test -- elevenlabs/audio
git add packages/providers/src/elevenlabs/audio.ts packages/providers/src/elevenlabs/audio.test.ts
git commit -m "feat(providers): add ElevenLabs TTS provider"
```

### Task 6.3: MiniMax audio provider

**Files:**
- Create: `packages/providers/src/minimax/audio.ts`
- Test: `packages/providers/src/minimax/audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/providers/src/minimax/audio.test.ts
import type { AudioModelDef } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { MiniMaxAudioProvider } from "./audio.js";

const models = new Map<string, AudioModelDef>([
  [
    "speech-02-hd",
    {
      id: "speech-02-hd",
      baseModelId: "minimax-speech-02",
      capabilities: { supportsVoiceDiscovery: false, outputFormats: ["mp3"], voices: [{ id: "presenter_female", name: "PF" }] },
      defaults: { outputFormat: "mp3", voice: "presenter_female", speed: 1 },
    },
  ],
]);

describe("MiniMaxAudioProvider", () => {
  it("requires groupId", () => {
    expect(() => new MiniMaxAudioProvider({ apiKey: "k", models, groupId: undefined })).toThrow(/groupId/i);
  });

  it("POSTs t2a_v2 with GroupId query and decodes hex audio", async () => {
    // "010203" hex → bytes [1,2,3]
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { audio: "010203" }, base_resp: { status_code: 0 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const provider = new MiniMaxAudioProvider({ apiKey: "k", models, groupId: "g1", fetch: fetchMock });
    const res = await provider.generate({
      prompt: "hi",
      providerId: "minimax",
      model: "speech-02-hd",
      voice: "presenter_female",
      assetIds: [],
    });
    expect(res.output.bytes).toEqual(new Uint8Array([1, 2, 3]));
    const url = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;
    expect(url).toContain("/t2a_v2");
    expect(url).toContain("GroupId=g1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @imagent/providers test -- minimax/audio`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/providers/src/minimax/audio.ts
import {
  type AudioGenerationResult,
  type AudioModelDef,
  type AudioRequest,
  type Logger,
  ProviderRequestError,
  ProviderResponseError,
  type ProviderTestResult,
} from "@imagent/core";
import { BaseAudioProvider } from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import {
  assertMiniMaxOk,
  DEFAULT_MINIMAX_BASE_URL,
  type MiniMaxBaseResp,
  MINIMAX_AUTH_ERROR_CODES,
  probeMiniMaxAuth,
} from "./shared.js";

const T2A_PATH = "/t2a_v2";

export interface MiniMaxAudioProviderOptions {
  apiKey: string;
  /** Required for T2A v2 — passed as the GroupId query param. */
  groupId: string | undefined;
  baseUrl?: string | null;
  models: ReadonlyMap<string, AudioModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

interface MiniMaxT2AResponse {
  data?: { audio?: string | null } | null;
  base_resp?: MiniMaxBaseResp | null;
}

export class MiniMaxAudioProvider extends BaseAudioProvider {
  private readonly http: HttpClient;
  private readonly groupId: string;

  constructor(options: MiniMaxAudioProviderOptions) {
    super({
      providerId: "minimax",
      displayName: "MiniMax",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    if (!options.groupId) {
      throw new ProviderRequestError(
        "MiniMax audio requires a groupId. Run `imagent config set minimax.groupId <GroupId>`.",
        { vendorId: "minimax" },
      );
    }
    this.groupId = options.groupId;
    const baseUrl = (options.baseUrl ?? DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      baseUrl,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  protected async doGenerate(
    merged: AudioRequest,
    model: AudioModelDef,
    signal?: AbortSignal,
  ): Promise<AudioGenerationResult> {
    const format = merged.outputFormat ?? "mp3";
    const voiceSetting: Record<string, unknown> = {};
    if (merged.voice) voiceSetting.voice_id = merged.voice;
    if (merged.speed !== undefined) voiceSetting.speed = merged.speed;
    if (merged.raw?.vol !== undefined) voiceSetting.vol = merged.raw.vol;
    if (merged.raw?.pitch !== undefined) voiceSetting.pitch = merged.raw.pitch;
    if (merged.raw?.emotion !== undefined) voiceSetting.emotion = merged.raw.emotion;

    const body: Record<string, unknown> = {
      model: model.id,
      text: merged.prompt,
      stream: false,
      voice_setting: voiceSetting,
      audio_setting: { format },
    };
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.post<MiniMaxT2AResponse>(
      `${T2A_PATH}?GroupId=${encodeURIComponent(this.groupId)}`,
      body,
      opts,
    );
    assertMiniMaxOk(res.base_resp, this.id);
    const hex = res.data?.audio;
    if (typeof hex !== "string" || hex.length === 0) {
      throw new ProviderResponseError("MiniMax T2A response contained no audio", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(res).slice(0, 512),
      });
    }
    const bytes = new Uint8Array(Buffer.from(hex, "hex"));
    return { output: { bytes, mimeType: mimeForFormat(format), raw: { outputFormat: format } } };
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const code = await probeMiniMaxAuth(this.http, signal);
    if (code !== undefined && MINIMAX_AUTH_ERROR_CODES.has(code)) {
      return { ok: false, reason: `MiniMax authentication failed (status_code ${code})` };
    }
    return { ok: true, latencyMs: Date.now() - started };
  }
}

function mimeForFormat(format: string): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/pcm";
    case "flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}
```

- [ ] **Step 4: Run to verify it passes & commit**

```bash
bun run --filter @imagent/providers test -- minimax/audio
git add packages/providers/src/minimax/audio.ts packages/providers/src/minimax/audio.test.ts
git commit -m "feat(providers): add MiniMax T2A v2 audio provider"
```

### Task 6.4: `createAudioRegistry` + registry wiring + exports

**Files:**
- Modify: `packages/providers/src/registry.ts`
- Modify: `packages/providers/src/index.ts`
- Test: `packages/providers/src/registry.audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/providers/src/registry.audio.test.ts
import { describe, expect, it } from "vitest";
import { getBundledCatalog } from "./catalog/loader.js";
import { createAudioRegistry } from "./registry.js";

describe("createAudioRegistry", () => {
  const catalog = getBundledCatalog();

  it("includes elevenlabs when its secret is set", () => {
    const reg = createAudioRegistry({ elevenlabs: { apiKey: "k" } }, { elevenlabs: {} } as never, catalog);
    expect(reg.has("elevenlabs")).toBe(true);
  });

  it("includes minimax audio only when groupId is configured", () => {
    const without = createAudioRegistry({ minimax: { apiKey: "k" } }, { minimax: {} } as never, catalog);
    expect(without.has("minimax")).toBe(false);
    const withGroup = createAudioRegistry(
      { minimax: { apiKey: "k" } },
      { minimax: { groupId: "g1" } } as never,
      catalog,
    );
    expect(withGroup.has("minimax")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @imagent/providers test -- registry.audio`
Expected: FAIL — `createAudioRegistry` undefined.

- [ ] **Step 3: Implement**

In `packages/providers/src/registry.ts`:

1. Add imports:

```ts
import type { AudioProvider } from "@imagent/core";
import { ElevenLabsAudioProvider } from "./elevenlabs/audio.js";
import { MiniMaxAudioProvider } from "./minimax/audio.js";
import { resolveAudioProviderModels } from "./catalog/resolve.js";
```

2. Add the type + register `elevenlabs` in `BUILT_IN_PROVIDER_IDS`:

```ts
export type AudioRegistry = ReadonlyMap<string, AudioProvider>;
```
```ts
const BUILT_IN_PROVIDER_IDS = [
  "openai",
  "azure",
  "google",
  "flux-bfl",
  "byteplus",
  "volcengine",
  "xai",
  "minimax",
  "elevenlabs",
] as const;
```

3. Add `createAudioRegistry` (after `createVideoRegistry`):

```ts
/**
 * Audio (TTS) registry. ElevenLabs needs only an apiKey; MiniMax audio also
 * needs a GroupId (prefs.minimax.groupId) for the T2A v2 endpoint, so it is
 * skipped until that is configured.
 */
export function createAudioRegistry(
  secrets: ProviderSecrets,
  prefs: ProviderPreferences,
  catalog: ModelCatalog,
): AudioRegistry {
  const out = new Map<string, AudioProvider>();

  if (secrets.elevenlabs) {
    const opts: ConstructorParameters<typeof ElevenLabsAudioProvider>[0] = {
      apiKey: secrets.elevenlabs.apiKey,
      models: mapFromList(resolveAudioProviderModels(catalog, "elevenlabs", prefs)),
    };
    const baseUrl = prefs.elevenlabs?.baseUrl;
    if (baseUrl) opts.baseUrl = baseUrl;
    out.set("elevenlabs", new ElevenLabsAudioProvider(opts));
  }

  const minimaxGroupId = prefs.minimax?.groupId;
  if (secrets.minimax && minimaxGroupId) {
    const opts: ConstructorParameters<typeof MiniMaxAudioProvider>[0] = {
      apiKey: secrets.minimax.apiKey,
      groupId: minimaxGroupId,
      models: mapFromList(resolveAudioProviderModels(catalog, "minimax", prefs)),
    };
    const baseUrl = prefs.minimax?.baseUrl;
    if (baseUrl) opts.baseUrl = baseUrl;
    out.set("minimax", new MiniMaxAudioProvider(opts));
  }

  return out;
}
```

4. Update `configuredProviderCount` to count `elevenlabs`:

```ts
  if (secrets.elevenlabs) n += 1;
```

5. Export the audio resolve helpers in the existing re-export block:

```ts
  effectiveAudioOfferings,
  resolveAudioProviderModel,
  resolveAudioProviderModels,
```

In `packages/providers/src/index.ts`, add:

```ts
export * from "./elevenlabs/audio.js";
export * from "./minimax/audio.js";
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run --filter @imagent/providers test -- registry.audio`
Expected: PASS.

- [ ] **Step 5: Build + full providers suite + commit**

```bash
bun run --filter @imagent/providers build && bun run --filter @imagent/providers test
git add packages/providers/src/registry.ts packages/providers/src/index.ts packages/providers/src/registry.audio.test.ts
git commit -m "feat(providers): add audio registry + register ElevenLabs vendor"
```

> Note: `TOTAL_PROVIDER_COUNT` is derived from `BUILT_IN_PROVIDER_IDS.length` and now reports 9. Update any test that hard-codes the provider count (search: `grep -rn "/ 8 configured\|TOTAL_PROVIDER_COUNT\|6 configured" packages apps`).

---

# Phase 7 — CLI: audio generate + voices, runtime wiring, config, discovery

### Task 7.1: Wire the audio registry into the CLI runtime

**Files:**
- Modify: `apps/cli/src/support/runtime.ts`

- [ ] **Step 1: Extend imports**

```ts
import {
  // ...existing...
  type AudioRegistry,
} from "@imagent/core";
import {
  createAudioRegistry,
  createImageRegistry,
  createVideoRegistry,
  loadCatalog,
  type ModelCatalog,
} from "@imagent/providers";
```

- [ ] **Step 2: Add to `CliRuntime` + build it in `loadCliRuntime`**

In `CliRuntime`:
```ts
  audioRegistry: AudioRegistry;
```
In `loadCliRuntime`, after `videoRegistry`:
```ts
  const audioRegistry = createAudioRegistry(secrets, effectivePrefs, catalog);
```
and add `audioRegistry` to the returned object.

- [ ] **Step 3: Inject into `buildRunner`**

In the `new JobRunner({ ... })` call, add:
```ts
    audioRegistry: runtime.audioRegistry,
```

- [ ] **Step 4: Typecheck**

Run: `bun run --filter @imagent/core build && bun run --filter @imagent/providers build && bun run --filter @imagent/cli build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/support/runtime.ts
git commit -m "feat(cli): wire audio registry into runtime + runner"
```

### Task 7.2: `imagent audio` command (generate + voices)

**Files:**
- Create: `apps/cli/src/commands/audio.ts`
- Modify: `apps/cli/src/index.ts`

- [ ] **Step 1: Implement the command**

```ts
// apps/cli/src/commands/audio.ts
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  AudioModelDef,
  AudioRequest,
  GenerationIntent,
  Job,
} from "@imagent/core";
import chalk from "chalk";
import type { Command } from "commander";

import { installCancelOnInterrupt } from "../support/job-control.js";
import { buildRunner, loadCliRuntime } from "../support/runtime.js";
import { createSpinner } from "../support/spinner.js";
import { coerceScalar, collect, parseKeyValueOptions } from "../support/util.js";

interface AudioGenerateOptions {
  provider?: string;
  model?: string;
  option?: string[];
  out?: string;
}

interface AudioVoicesOptions {
  provider?: string;
  model?: string;
  json?: boolean;
}

export function registerAudioCommand(program: Command): void {
  const audio = program
    .command("audio")
    .summary("Audio (text-to-speech) commands")
    .description(
      [
        "Generate speech audio from text.",
        "Use `imagent audio generate <text>` to synthesize speech.",
        "Use `imagent audio voices --provider <id>` to discover available voices.",
        "Run `imagent models --kind audio` to list providers/models and `imagent options --provider <id> --model <id> --kind audio` for the exact `--option key=value` pairs.",
      ].join("\n"),
    );

  audio
    .command("generate <text>")
    .summary("Synthesize speech from text")
    .description("Generate speech audio. Waits for completion and prints the result path.")
    .option("--provider <id>", "Provider id (elevenlabs | minimax). See `imagent doctor`.")
    .option("--model <id>", "Model/offering id (see `imagent models --kind audio --provider <id>`)")
    .option(
      "-o, --option <key=value>",
      "Repeatable model option. Common keys: voice, speed, outputFormat. Provider extras (stability, emotion, vol, pitch) are passed through.",
      collect,
      [],
    )
    .option("--out <dir>", "Copy the completed audio to this directory after success")
    .action(async (text: string, options: AudioGenerateOptions) => {
      try {
        await runAudioGenerate(text, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("audio failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  audio
    .command("voices")
    .summary("List voices for an audio provider/model")
    .description(
      "List voices from the provider's voice-list API when available, falling back to the model's static catalog voices.",
    )
    .requiredOption("--provider <id>", "Provider id (elevenlabs | minimax)")
    .option("--model <id>", "Model/offering id (defaults to the provider's first audio model)")
    .option("--json", "Emit JSON instead of a table", false)
    .action(async (options: AudioVoicesOptions) => {
      try {
        await runAudioVoices(options);
      } catch (err) {
        process.stderr.write(`${chalk.red("voices failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runAudioGenerate(text: string, options: AudioGenerateOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const { providerId, model } = resolveAudioSelection(runtime, options.provider, options.model);
  const provider = runtime.audioRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `audio provider '${providerId}' is not configured. Run \`imagent config set ${providerId}.apiKey ...\` first.`,
    );
  }
  const resolved = provider.models.get(model);
  if (!resolved) throw new Error(`unknown model '${model}' for provider '${providerId}'`);
  const requestOptions = parseAudioOptions(options.option ?? [], resolved);

  const { db, jobs, gallery, runner } = buildRunner(runtime);
  try {
    const intent: GenerationIntent = {
      kind: "audio",
      request: {
        prompt: text,
        providerId,
        model,
        assetIds: [],
        ...requestOptions,
      } satisfies AudioRequest,
    };

    const completed = new Promise<Job>((resolve, reject) => {
      runner.once("job.completed", (j: Job) => resolve(j));
      runner.once("job.failed", (j: Job) => reject(new Error(j.errorMessage ?? "job failed")));
    });

    process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${model}\n`);
    const id = await runner.start(intent);
    const cleanupCancel = installCancelOnInterrupt(runner, jobs, id);
    const spinner = createSpinner({ label: `synthesizing audio with ${providerId}/${model}` });
    spinner.start();
    const job = await completed.finally(() => {
      spinner.stop();
      cleanupCancel();
    });
    if (!job.resultItemId) throw new Error("job completed without resultItemId");
    const item = gallery.get(job.resultItemId);
    if (!item) throw new Error("result item missing from gallery_items");
    const abs = path.isAbsolute(item.relPath)
      ? item.relPath
      : path.join(runtime.resolver.dataDir, item.relPath);
    process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
    if (options.out) {
      const copied = await copyResultToDir(abs, options.out);
      process.stdout.write(`${chalk.green("copied to:")} ${copied}\n`);
    }
  } finally {
    db.close();
  }
}

async function runAudioVoices(options: AudioVoicesOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const providerId = options.provider as string;
  const provider = runtime.audioRegistry.get(providerId);
  if (!provider) throw new Error(`audio provider '${providerId}' is not configured`);
  const modelId = options.model ?? provider.models.keys().next().value;
  const model = modelId ? provider.models.get(modelId) : undefined;

  let voices = model?.capabilities?.voices ?? [];
  if (provider.listVoices && model?.capabilities?.supportsVoiceDiscovery) {
    try {
      voices = await provider.listVoices();
    } catch (err) {
      process.stderr.write(
        `${chalk.yellow("warn:")} voice discovery failed (${(err as Error).message}); showing catalog voices\n`,
      );
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(voices, null, 2)}\n`);
    return;
  }
  if (voices.length === 0) {
    process.stdout.write("no voices available\n");
    return;
  }
  for (const v of voices) {
    const label = v.labels ? ` ${chalk.dim(JSON.stringify(v.labels))}` : "";
    process.stdout.write(`${chalk.cyan(v.id)}  ${v.name}${label}\n`);
  }
}

function resolveAudioSelection(
  runtime: Awaited<ReturnType<typeof loadCliRuntime>>,
  providerOverride: string | undefined,
  modelOverride: string | undefined,
): { providerId: string; model: string } {
  const registry = runtime.audioRegistry;
  const def = runtime.config.app.defaultAudioModel;
  if (providerOverride) {
    const provider = registry.get(providerOverride);
    const model = modelOverride ?? provider?.models.keys().next().value;
    if (!model) throw new Error(`no audio model configured for provider '${providerOverride}'`);
    return { providerId: providerOverride, model };
  }
  if (modelOverride) {
    for (const [pid, provider] of registry) {
      if (provider.models.has(modelOverride)) return { providerId: pid, model: modelOverride };
    }
  }
  if (def && registry.get(def.providerId)?.models.has(def.modelId)) {
    return { providerId: def.providerId, model: def.modelId };
  }
  const first = registry.entries().next().value;
  if (first) {
    const [pid, provider] = first;
    const model = modelOverride ?? provider.models.keys().next().value;
    if (model) return { providerId: pid, model };
  }
  throw new Error("no audio providers configured. Run `imagent config set elevenlabs.apiKey ...` first.");
}

function parseAudioOptions(values: readonly string[], model: AudioModelDef): Partial<AudioRequest> {
  const pairs = parseKeyValueOptions(values);
  const out: Partial<AudioRequest> = {};
  const raw: Record<string, unknown> = {};
  const knobKeys = new Set(Object.keys(model.capabilities?.extraKnobs ?? {}));
  for (const [key, value] of Object.entries(pairs)) {
    switch (key) {
      case "voice":
        out.voice = value;
        break;
      case "speed":
        out.speed = Number(value);
        break;
      case "outputFormat":
      case "format":
        out.outputFormat = value;
        break;
      default:
        if (knobKeys.has(key)) {
          raw[key] = coerceScalar(value);
        } else {
          throw new Error(
            `unknown audio option '${key}'. Supported: voice, speed, outputFormat${
              knobKeys.size ? `, ${[...knobKeys].join(", ")}` : ""
            }`,
          );
        }
    }
  }
  if (Object.keys(raw).length > 0) out.raw = raw;
  return out;
}

async function copyResultToDir(sourcePath: string, outDir: string): Promise<string> {
  const targetDir = path.resolve(outDir);
  const targetPath = path.join(targetDir, path.basename(sourcePath));
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
  return targetPath;
}
```

- [ ] **Step 2: Register in `apps/cli/src/index.ts`**

Add the import and call:
```ts
import { registerAudioCommand } from "./commands/audio.js";
```
After `registerVideoCommand(program);`:
```ts
  registerAudioCommand(program);
```

- [ ] **Step 3: Build**

Run: `bun run --filter @imagent/cli build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/commands/audio.ts apps/cli/src/index.ts
git commit -m "feat(cli): add `imagent audio generate` and `imagent audio voices`"
```

### Task 7.3: CLI config — allow `elevenlabs.apiKey` and `minimax.groupId`

**Files:**
- Modify: `apps/cli/src/support/config/shared.ts`
- Modify: `apps/cli/src/support/config/provider-routing.ts`
- Test: extend the nearest existing config test or add `apps/cli/src/support/config/shared.audio.test.ts`

- [ ] **Step 1: Update `VENDOR_KEYS` + `ALLOWED_FIELDS`**

Add `"elevenlabs"` to `VENDOR_KEYS`. Add to `ALLOWED_FIELDS`:
```ts
  minimax: { apiKey: { store: "secrets" }, baseUrl: { store: "config" }, groupId: { store: "config" } },
  elevenlabs: { apiKey: { store: "secrets" }, baseUrl: { store: "config" } },
```
(Replace the existing `minimax:` line so it gains `groupId`.)

- [ ] **Step 2: Add `audio.defaultModel` support**

In the `DEFAULT_MODEL_KEYS` map + `defaultModelFieldFor`, add:
```ts
type DefaultModelConfigKey = "image.defaultModel" | "video.defaultModel" | "audio.defaultModel";
const DEFAULT_MODEL_KEYS: Record<DefaultModelConfigKey, "defaultImageModel" | "defaultVideoModel" | "defaultAudioModel"> = {
  "image.defaultModel": "defaultImageModel",
  "video.defaultModel": "defaultVideoModel",
  "audio.defaultModel": "defaultAudioModel",
};
```
and in `defaultModelFieldFor`, add:
```ts
  if (dottedKey === "app.defaultAudioModel") return "defaultAudioModel";
```
Update the return type union to include `"defaultAudioModel"`.

- [ ] **Step 3: Register `elevenlabs` in `BUILT_IN_ROUTING_IDS`**

In `apps/cli/src/support/config/provider-routing.ts`, add `"elevenlabs"` to `BUILT_IN_ROUTING_IDS`.

- [ ] **Step 4: Write a small test**

```ts
// apps/cli/src/support/config/shared.audio.test.ts
import { describe, expect, it } from "vitest";
import { ALLOWED_FIELDS, isVendorKey } from "./shared.js";

describe("audio CLI config fields", () => {
  it("allows elevenlabs.apiKey and minimax.groupId", () => {
    expect(isVendorKey("elevenlabs")).toBe(true);
    expect(ALLOWED_FIELDS.elevenlabs.apiKey.store).toBe("secrets");
    expect(ALLOWED_FIELDS.minimax.groupId.store).toBe("config");
  });
});
```

- [ ] **Step 5: Run + build + commit**

```bash
bun run --filter @imagent/cli test -- shared.audio
bun run --filter @imagent/cli build
git add apps/cli/src/support/config/shared.ts apps/cli/src/support/config/provider-routing.ts apps/cli/src/support/config/shared.audio.test.ts
git commit -m "feat(cli): allow elevenlabs.apiKey, minimax.groupId, audio.defaultModel"
```

### Task 7.4: Surface audio in `models`, `options`, `doctor`

**Files:**
- Modify: `apps/cli/src/commands/models.ts` (help text + `--kind audio`)
- Modify: `apps/cli/src/support/models/list.ts`
- Modify: `apps/cli/src/support/models/options.ts`
- Modify: `apps/cli/src/support/models/shared.ts`
- Modify: `apps/cli/src/commands/doctor.ts` (or its support module)

- [ ] **Step 1: Inspect how image/video kinds are iterated**

Run:
```bash
grep -rn "videoRegistry\|imageRegistry\|kind" apps/cli/src/support/models/ apps/cli/src/commands/doctor.ts apps/cli/src/support/*doctor* 2>/dev/null
```

- [ ] **Step 2: Extend `list.ts`** — wherever it iterates `runtime.imageRegistry` then `runtime.videoRegistry`, add an analogous pass over `runtime.audioRegistry` tagged `kind: "audio"`. For each audio provider/model, print provider id, model id, and `voices`/`outputFormats` from `model.capabilities`. Respect the `--kind audio` filter and `--configured`.

- [ ] **Step 3: Extend `options.ts`** — when resolving a provider/model, also search `runtime.audioRegistry`. For an audio model, print supported options: `voice` (+ static voices or "discovery"), `speed` (+ `speedRange`), `outputFormat` (+ `outputFormats`), and each `extraKnobs` entry with its type/range/values. Honor `--kind audio` disambiguation.

- [ ] **Step 4: Update `--kind` validation** in `shared.ts` to accept `"audio"` (the `ModelsOptions.kind` / `OptionsCommandArgs.kind` types and any `kind` allow-list).

- [ ] **Step 5: Update help text** in `models.ts` to mention audio (`image + video + audio`, `--kind image|video|audio`).

- [ ] **Step 6: Extend `doctor`** — include the audio registry in the "configured providers / usable models" summary, and report `elevenlabs` and MiniMax-audio (note when MiniMax audio is unavailable because `minimax.groupId` is unset).

- [ ] **Step 7: Build + test + manual smoke**

Run:
```bash
bun run --filter @imagent/cli build && bun run --filter @imagent/cli test
ELEVENLABS_API_KEY=dummy node apps/cli/dist/index.js models --kind audio --json | head
```
Expected: build/test PASS; `models --kind audio` lists ElevenLabs models (with a dummy key the provider is constructed but not called).

- [ ] **Step 8: Commit**

```bash
git add apps/cli/src/commands/models.ts apps/cli/src/support/models/ apps/cli/src/commands/doctor.ts apps/cli/src/support
git commit -m "feat(cli): surface audio in models/options/doctor"
```

### Task 7.5: Fix the CLI help test's provider/model expectations

**Files:**
- Modify: `apps/cli/src/cli-help.test.ts` (only the assertions that enumerate providers/kinds)

- [ ] **Step 1: Run the suite to find broken assertions**

Run: `bun run --filter @imagent/cli test`
Expected: failures listing provider ids / `image|video` strings that now include audio/elevenlabs.

- [ ] **Step 2: Update those assertions** to include `audio` / `elevenlabs` where the help text changed. Do not weaken unrelated assertions.

- [ ] **Step 3: Re-run + commit**

```bash
bun run --filter @imagent/cli test
git add apps/cli/src/cli-help.test.ts
git commit -m "test(cli): update help expectations for audio command"
```

> Note: a pre-existing failure around `config set video.defaultModel` (outdated ByteDance model id) may be present independent of this work; do not mask it, but it is not caused by audio.

---

# Phase 8 — IPC: audio contracts (submit, models, voices)

The renderer talks to the main process through typed contracts in `packages/ipc`. Audio mirrors `image.submit` / `image.models` and adds a `audio.voices` route for discovery.

### Task 8.1: Add audio contract entries

**Files:**
- Modify: `packages/ipc/src/contract.sections.ts`
- Test: `packages/ipc/src/server.test.ts` already exercises the contract; add a focused test if helpful.

- [ ] **Step 1: Extend the generation contract**

In `contract.sections.ts`, import `AudioRequestSchema`, `AudioModelDefSchema`, `VoiceInfoSchema` from `@imagent/core` (extend the existing import block at the top), then add to the generation contract object (next to `video.submit`):

```ts
  /**
   * Submit a TTS job. Like image.submit it returns `{ jobId }` immediately;
   * the renderer subscribes to job.* push events for completion.
   */
  "audio.submit": {
    input: AudioRequestSchema.extend({ parentId: z.string().optional() }),
    output: z.object({ jobId: z.string() }),
  },
```

- [ ] **Step 2: Extend the models contract**

In `modelsContract`, add:

```ts
  "audio.models": {
    input: z.object({ providerId: ProviderIdSchema }),
    output: z.object({
      providerId: ProviderIdSchema,
      defaultModel: z.string().nullable(),
      models: z.array(AudioModelDefSchema),
    }),
  },

  "audio.voices": {
    input: z.object({ providerId: ProviderIdSchema, modelId: z.string().optional() }),
    output: z.object({ voices: z.array(VoiceInfoSchema) }),
  },
```

Also add an `audio` array to the `models.list` output object (mirror the `image`/`video` arrays exactly), so the Models page can show audio models.

- [ ] **Step 3: Build the IPC package (after core)**

Run:
```bash
bun run --filter @imagent/core build && bun run --filter @imagent/ipc build && bun run --filter @imagent/ipc test
```
Expected: PASS. Fix any `contract.types.test-d.ts` type assertions that enumerate routes if they are exhaustive.

- [ ] **Step 4: Commit**

```bash
git add packages/ipc/src/contract.sections.ts packages/ipc/src
git commit -m "feat(ipc): add audio submit/models/voices contracts"
```

---

# Phase 9 — Desktop main: registry bootstrap + audio IPC handlers + provider metadata

### Task 9.1: Add the audio registry to the runtime bootstrap

**Files:**
- Modify: `apps/desktop/src/main/job-runner-bootstrap.ts`

- [ ] **Step 1: Imports + types**

Add `createAudioRegistry`, `type AudioRegistry` to the `@imagent/providers` import. Add `audioRegistry: AudioRegistry;` to `RuntimeServices`.

- [ ] **Step 2: Build + share the mutable map**

```ts
  const audioRegistry = new Map() as Map<string, never>;
```
In `repopulate()`:
```ts
    const nextAudio = createAudioRegistry(secrets, config.providers, catalog);
    audioRegistry.clear();
    for (const [k, v] of nextAudio) {
      (audioRegistry as Map<string, unknown>).set(k, v);
    }
```
Pass to `new JobRunner({ ... })`:
```ts
    audioRegistry: audioRegistry as unknown as AudioRegistry,
```
And add `audioRegistry: audioRegistry as unknown as AudioRegistry,` to the returned `RuntimeServices` object.

- [ ] **Step 3: Typecheck**

Run: `bun run --filter @imagent/core build && bun run --filter @imagent/providers build && bun run --filter @imagent/persistence build`
(Defer the desktop typecheck until handlers are wired in 9.2.)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/job-runner-bootstrap.ts
git commit -m "feat(desktop): build audio registry in runtime bootstrap"
```

### Task 9.2: Implement the audio IPC handlers

**Files:**
- Modify: `apps/desktop/src/main/ipc-handlers.ts`

- [ ] **Step 1: `audio.submit`** — mirror `image.submit` (around line 658) but without asset slots. It validates the provider exists, calls `runtime.jobRunner.start({ kind: "audio", request })`, returns `{ jobId }`:

```ts
    "audio.submit": async (request) => {
      try {
        const jobId = await runtime.jobRunner.start({ kind: "audio", request });
        return { jobId };
      } catch (err) {
        logger.error("audio.submit failed", { err: String(err) });
        throw err;
      }
    },
```

- [ ] **Step 2: `audio.models`** — mirror `image.models` (around line 846):

```ts
    "audio.models": async ({ providerId }) => {
      const config = await configStore.loadConfig();
      const provider = runtime.audioRegistry.get(providerId);
      const models = provider ? [...provider.models.values()] : [];
      const defaultModel = readDefaultModel(config.providers, providerId, runtime.audioRegistry);
      return { providerId, defaultModel, models };
    },
```
(If `readDefaultModel` is image-specific, generalize it or add an audio-aware variant that reads `config.app.defaultAudioModel`.)

- [ ] **Step 3: `audio.voices`** — live discovery with static fallback:

```ts
    "audio.voices": async ({ providerId, modelId }) => {
      const provider = runtime.audioRegistry.get(providerId);
      if (!provider) return { voices: [] };
      const model = modelId ? provider.models.get(modelId) : provider.models.values().next().value;
      const fallback = model?.capabilities?.voices ?? [];
      if (provider.listVoices && model?.capabilities?.supportsVoiceDiscovery) {
        try {
          return { voices: await provider.listVoices() };
        } catch (err) {
          logger.warn("audio.voices discovery failed", { providerId, err: String(err) });
        }
      }
      return { voices: fallback };
    },
```

- [ ] **Step 4: Register `elevenlabs` in provider metadata**

In `WELL_KNOWN_PROVIDER_IDS` (line ~1339) add `"elevenlabs"`. In `PROVIDER_DISPLAY_NAMES` add `elevenlabs: "ElevenLabs"`. In `providerSummaryList` (and its image/video registry params) include the audio registry so ElevenLabs shows up; pass `runtime.audioRegistry` where the summary is built. In any `maskSecrets` / prefs-serialization function that enumerates vendors, add `elevenlabs` (apiKey) and the MiniMax `groupId` field.

- [ ] **Step 5: Typecheck the desktop main**

Run: `bun run --filter @imagent/ipc build && bun run --filter @imagent/studio typecheck` (or the desktop typecheck script — see package.json). Build deps first: core, config, ipc, persistence, providers, ui.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/ipc-handlers.ts
git commit -m "feat(desktop): add audio.submit/models/voices handlers + elevenlabs metadata"
```

---

# Phase 10 — Desktop renderer: Studio mode + audio draft state

### Task 10.1: Add `"audio"` to `StudioMode` + an `AudioDraft` slice

**Files:**
- Modify: `apps/desktop/src/renderer/state/useUIStore.ts`

- [ ] **Step 1: Widen the mode type**

```ts
export type StudioMode = "image" | "video" | "audio";
```

- [ ] **Step 2: Define `AudioDraft` + default**

Mirror `VideoDraft` but with audio fields (no references/asset slots):

```ts
export interface AudioDraft {
  providerId: string | null;
  model: string | null;
  text: string;
  voice: string | null;
  speed: number | null;
  outputFormat: string | null;
  /** Per-model extra knob values (stability, emotion, vol, pitch, ...). */
  extras: Record<string, string | number>;
}

const DEFAULT_AUDIO_DRAFT: AudioDraft = {
  providerId: null,
  model: null,
  text: "",
  voice: null,
  speed: null,
  outputFormat: null,
  extras: {},
};
```

- [ ] **Step 3: Add `audio` to `StudioDraft`, the store state, and a `setAudioDraft` action**

```ts
export interface StudioDraft {
  image: ImageDraft;
  video: VideoDraft;
  audio: AudioDraft;
}
```
Initialize `studioDraft.audio: DEFAULT_AUDIO_DRAFT` (load/persist from localStorage like the others — extend the load/persist helpers to include `audio`). Add:
```ts
  setAudioDraft: (patch: Partial<AudioDraft>) => void;
  resetAudioDraft: () => void;
```
Implement `setAudioDraft` by merging into `studioDraft.audio` (mirror `setVideoDraft`).

- [ ] **Step 4: Tolerate the new persisted mode**

In `loadInitialModeAndRoute` / `persistMode`, accept `"audio"` as a valid stored `StudioMode` (the `storedMode` narrowing must allow it).

- [ ] **Step 5: Typecheck**

Run the desktop typecheck (build deps first). Expected: PASS (existing `studioMode === "image" ? ... : ...` ternaries still compile; they will be updated in Phase 11).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/state/useUIStore.ts
git commit -m "feat(desktop): add audio studio mode + audio draft state"
```

---

# Phase 11 — Desktop renderer: Studio audio composer + preview + providers UI

### Task 11.1: Add the Audio tab to the mode switch

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Studio/composer.tsx`

- [ ] **Step 1:** Add an "audio" option to `StudioModeSwitch` (mirror the existing image/video tabs; use an audio/waveform icon from `@imagent/ui` `Icons`). Add the i18n label key `studio.mode.audio`.

- [ ] **Step 2: Typecheck.** Commit.

```bash
git add apps/desktop/src/renderer/pages/Studio/composer.tsx
git commit -m "feat(desktop): add audio tab to studio mode switch"
```

### Task 11.2: AudioRail composer

**Files:**
- Create: `apps/desktop/src/renderer/pages/Studio/audioRail.tsx`
- Modify: `apps/desktop/src/renderer/pages/Studio/index.tsx`

- [ ] **Step 1: Implement `AudioRail`** — a composer dock with:
  - a multiline text input bound to `audioDraft.text`;
  - a model picker over `audio.models` for the selected provider (reuse `modelPicker.tsx` patterns);
  - a **voice picker** populated by calling `api["audio.voices"]({ providerId, modelId })` on mount/model-change, falling back to the model's static `capabilities.voices`; bind to `audioDraft.voice`;
  - a speed control (number input constrained to `capabilities.speedRange`);
  - an output-format select from `capabilities.outputFormats`;
  - per-model extra knobs rendered from `capabilities.extraKnobs` (number → slider/input, enum → select) writing into `audioDraft.extras`;
  - a **Generate** button that calls `api["audio.submit"]({ prompt: text, providerId, model, voice, speed, outputFormat, raw: extras, assetIds: [] })` and shows progress via the shared job-event subscription used by image/video rails.

  Mirror `videoRail.tsx` structure and the `api` usage in it. Use `useUIStore` selectors `studioDraft.audio` + `setAudioDraft`.

```tsx
// apps/desktop/src/renderer/pages/Studio/audioRail.tsx  (skeleton — fill from videoRail.tsx patterns)
import { useEffect, useState } from "react";
import { Button, Input, Select } from "@imagent/ui";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useUIStore } from "../../state/useUIStore.js";

export function AudioRail() {
  const draft = useUIStore((s) => s.studioDraft.audio);
  const setDraft = useUIStore((s) => s.setAudioDraft);
  const pushToast = useUIStore((s) => s.pushToast);
  const t = useT();
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!draft.providerId) return;
    let cancelled = false;
    void api["audio.voices"]({ providerId: draft.providerId, modelId: draft.model ?? undefined })
      .then((r) => { if (!cancelled) setVoices(r.voices); })
      .catch(() => { if (!cancelled) setVoices([]); });
    return () => { cancelled = true; };
  }, [draft.providerId, draft.model]);

  const onGenerate = async () => {
    if (!draft.providerId || !draft.model || draft.text.trim().length === 0) {
      pushToast({ title: t("studio.audio.missingFields"), variant: "info" });
      return;
    }
    await api["audio.submit"]({
      prompt: draft.text,
      providerId: draft.providerId,
      model: draft.model,
      voice: draft.voice ?? undefined,
      speed: draft.speed ?? undefined,
      outputFormat: draft.outputFormat ?? undefined,
      raw: Object.keys(draft.extras).length ? draft.extras : undefined,
      assetIds: [],
    });
  };

  // ...render text area, model/voice/format selects, extra knobs, Generate button...
  return null; // replace with JSX following videoRail.tsx
}
```

- [ ] **Step 2: Mount it in `index.tsx`**

In `StudioComposerDock`, switch on all three modes:
```tsx
function StudioComposerDock({ mode }: { mode: StudioMode }) {
  return (
    <div className="shrink-0 bg-(--bg)">
      {mode === "image" ? <ImageRail /> : mode === "video" ? <VideoRail /> : <AudioRail />}
    </div>
  );
}
```
And update the `draft`/`setDraft` selection + the drag/drop guard so audio mode (which has no references/asset slots) safely no-ops on drops. The simplest approach: keep `draft`/`setDraft` for image/video only, and early-return from `onDrop` when `studioMode === "audio"`.

- [ ] **Step 3: Typecheck + commit**

```bash
git add apps/desktop/src/renderer/pages/Studio/audioRail.tsx apps/desktop/src/renderer/pages/Studio/index.tsx
git commit -m "feat(desktop): add audio composer rail to studio"
```

### Task 11.3: Audio canvas preview

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Studio/canvas.tsx`

- [ ] **Step 1:** When `mode === "audio"`, render an audio preview: the latest audio result for the current session as an `<audio controls src={resolveGalleryUrl(item.relPath)} />` with the prompt text. Reuse the gallery-store latest-item selection the image/video canvases use, filtered to `kind: "audio"`. Keep the empty state ("Generate speech to preview it here").

- [ ] **Step 2: Typecheck + commit**

```bash
git add apps/desktop/src/renderer/pages/Studio/canvas.tsx
git commit -m "feat(desktop): audio preview in studio canvas"
```

### Task 11.4: Studio gallery rail filters to audio

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Studio/galleryRail.tsx`

- [ ] **Step 1:** The rail already takes `mode`. Ensure `mode === "audio"` queries `kind: "audio"` (mirror how it maps image/video → `kind`). Audio items use the rail card variant (see Phase 12).

- [ ] **Step 2: Typecheck + commit**

```bash
git add apps/desktop/src/renderer/pages/Studio/galleryRail.tsx
git commit -m "feat(desktop): studio gallery rail audio filter"
```

### Task 11.5: Providers page — ElevenLabs card + MiniMax groupId field

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Providers/definitions.tsx`
- Modify: `apps/desktop/src/renderer/pages/Models/modelLogo.tsx`
- Modify: `apps/desktop/src/renderer/i18n/en.ts` and `.../zh.ts` (or equivalent locale files)

- [ ] **Step 1:** Add an `elevenlabs` provider definition (apiKey field, display name "ElevenLabs", audio capability badge) mirroring an existing apiKey-only vendor (e.g. `xai`/`minimax`). Add a `groupId` text field to the `minimax` definition (config-store, labeled "Group ID", helper text noting it's required for MiniMax TTS).

- [ ] **Step 2:** Add an `elevenlabs` logo/glyph mapping in `modelLogo.tsx` (reuse a generic audio glyph if no brand asset exists).

- [ ] **Step 3:** Add i18n keys: `providers.elevenlabs.*`, `providers.minimax.groupId.*`, `studio.mode.audio`, `studio.audio.*`, `gallery.filter.audio`.

- [ ] **Step 4: Typecheck + commit**

```bash
git add apps/desktop/src/renderer/pages/Providers/definitions.tsx apps/desktop/src/renderer/pages/Models/modelLogo.tsx apps/desktop/src/renderer/i18n
git commit -m "feat(desktop): ElevenLabs provider card + MiniMax groupId + i18n"
```

---

# Phase 12 — Gallery: media-kind filters + audio card + lightbox player

### Task 12.1: Audio card variant in `@imagent/ui`

**Files:**
- Create: `packages/ui/src/composites/GalleryItemCardAudioVariant.tsx`
- Modify: `packages/ui/src/composites/GalleryItemCard.tsx`
- Modify: `packages/ui/src/composites/GalleryItemCard.types.ts` (extend `GalleryItemCardKind` to include `"audio"`)
- Modify: `packages/ui/src/composites/GalleryItemCardRailVariant.tsx` (audio handling in the rail size)

- [ ] **Step 1: Extend the kind type**

In `GalleryItemCard.types.ts`, add `"audio"` to `GalleryItemCardKind` (and any prop that enumerates kinds).

- [ ] **Step 2: Implement the audio variant** — compact card: an audio glyph header, the prompt text (truncated), a duration badge (from `durationMs`), and an inline play/pause button that toggles an `<audio>` element sourced from the card's media URL. Mirror the structure/props of `GalleryItemCardVideoVariant.tsx` (same DnD source id, same Radix dropdown actions, favorite button). Keep it self-contained (local `useState` for playing + a `ref` to the audio element).

```tsx
// packages/ui/src/composites/GalleryItemCardAudioVariant.tsx (skeleton — mirror VideoVariant for chrome)
import { useRef, useState } from "react";
import type { GalleryItemCardProps } from "./GalleryItemCard.types.js";
import { Icons } from "../icons.js";

export function AudioVariant(props: GalleryItemCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); } else { void el.play(); }
  };
  // ...render shared card chrome (border/select/favorite/context menu) from VideoVariant...
  // ...inside: <button onClick={toggle}>{playing ? <Icons.Pause/> : <Icons.Play/>}</button>
  // ...<span>{formatDuration(props.item.durationMs)}</span>
  // ...<audio ref={audioRef} src={props.mediaUrl} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
  return null; // replace with JSX
}
```

> Use the same `mediaUrl`/`item` prop names the existing variants receive — confirm them in `GalleryItemCard.types.ts`.

- [ ] **Step 3: Dispatch in `GalleryItemCard.tsx`**

```tsx
import { AudioVariant } from "./GalleryItemCardAudioVariant.js";
// ...
  if (props.kind === "video") {
    return <VideoVariant {...props} />;
  }
  if (props.kind === "audio") {
    return <AudioVariant {...props} />;
  }
  return <ImageVariant {...props} />;
```

In `RailVariant`, render the audio play affordance for `kind === "audio"` (a small play button + duration) instead of an `<img>`.

- [ ] **Step 4: Export + build**

Ensure the new file is exported via `composites/index.ts` if it re-exports variants. Run:
```bash
bun run --filter @imagent/ui build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/composites/
git commit -m "feat(ui): add audio gallery card variant"
```

### Task 12.2: Lightbox audio player

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Gallery/components.tsx` (`LightboxPreview`)

- [ ] **Step 1:** In `LightboxPreview`, branch on `item.kind === "audio"` to render a full-width `<audio controls autoPlay src={resolveGalleryUrl(item.relPath)} />` plus the prompt + params, instead of the `<img>`/`<video>` element.

- [ ] **Step 2: Typecheck + commit**

```bash
git add apps/desktop/src/renderer/pages/Gallery/components.tsx
git commit -m "feat(desktop): audio player in gallery lightbox"
```

### Task 12.3: Default media-kind separation filters (Image / Video / Audio)

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Gallery/index.tsx`
- Modify: `apps/desktop/src/renderer/pages/Gallery/constants.ts`

- [ ] **Step 1:** Add filter sentinels next to `BOARD_ALL` / `BOARD_FAVORITES`:

```ts
export const FILTER_IMAGE = "kind:image";
export const FILTER_VIDEO = "kind:video";
export const FILTER_AUDIO = "kind:audio";
```

- [ ] **Step 2:** Render three new top-level filter entries (Image / Video / Audio) in the gallery sidebar alongside All/Favorites, above the boards list. Wire the `activeFilter` effect so they map to `setQuery({ kind: "image" | "video" | "audio", boardId: undefined, favoritedOnly: undefined })`:

```ts
  useEffect(() => {
    if (activeFilter === BOARD_ALL) {
      setQuery({ kind: undefined, boardId: undefined, favoritedOnly: undefined });
    } else if (activeFilter === BOARD_FAVORITES) {
      setQuery({ kind: undefined, boardId: undefined, favoritedOnly: true });
    } else if (activeFilter === FILTER_IMAGE) {
      setQuery({ kind: "image", boardId: undefined, favoritedOnly: undefined });
    } else if (activeFilter === FILTER_VIDEO) {
      setQuery({ kind: "video", boardId: undefined, favoritedOnly: undefined });
    } else if (activeFilter === FILTER_AUDIO) {
      setQuery({ kind: "audio", boardId: undefined, favoritedOnly: undefined });
    } else {
      setQuery({ kind: undefined, boardId: activeFilter, favoritedOnly: undefined });
    }
  }, [activeFilter]);
```

(`GalleryQuery.kind` already exists and is honored by the repository.)

- [ ] **Step 3:** Add i18n labels `gallery.filter.image/video/audio`.

- [ ] **Step 4: Typecheck + manual smoke + commit**

```bash
git add apps/desktop/src/renderer/pages/Gallery/index.tsx apps/desktop/src/renderer/pages/Gallery/constants.ts apps/desktop/src/renderer/i18n
git commit -m "feat(desktop): gallery media-kind filters (image/video/audio)"
```

---

# Phase 13 — Docs, full validation, version sync

### Task 13.1: Update documentation

**Files:**
- Modify: `architecture.md` (Scope + CLI surface: mention audio/TTS + ElevenLabs)
- Modify: `docs/providers.md` (ElevenLabs setup + MiniMax `groupId`)
- Modify: `docs/models.md` (audio models + `--kind audio`)
- Modify: `docs/cli.md` (`imagent audio generate` / `imagent audio voices`)
- Modify: `README.md` / `README.zh-CN.md` (feature list)

- [ ] **Step 1:** Add an "Audio generation (TTS) through ElevenLabs and MiniMax" bullet to the Scope section of `architecture.md`, and add `imagent audio generate <text>` / `imagent audio voices` to its CLI surface block.

- [ ] **Step 2:** Document configuration: `imagent config set elevenlabs.apiKey ...`, `ELEVENLABS_API_KEY`, and `imagent config set minimax.groupId ...` (required for MiniMax TTS).

- [ ] **Step 3: Commit**

```bash
git add architecture.md docs/providers.md docs/models.md docs/cli.md README.md README.zh-CN.md
git commit -m "docs: document audio (TTS) support"
```

### Task 13.2: Full workspace validation

- [ ] **Step 1: Lint + typecheck + build + test (repo-wide)**

Run:
```bash
bun run lint
bun run typecheck
bun run build
bun run test
```
Expected: PASS. If `bun run test` surfaces the pre-existing `config set video.defaultModel` failure unrelated to audio, note it but do not mask it.

- [ ] **Step 2: Targeted CLI + desktop validation**

Run:
```bash
bun run --filter @imagent/cli build && bun run --filter @imagent/cli test
# desktop: build deps then typecheck/build @imagent/studio
bun run --filter @imagent/core build && bun run --filter @imagent/config build && bun run --filter @imagent/ipc build && bun run --filter @imagent/persistence build && bun run --filter @imagent/providers build && bun run --filter @imagent/ui build && bun run --filter @imagent/studio build
```
Expected: PASS.

- [ ] **Step 3: Manual end-to-end smoke (with real keys, optional but recommended)**

```bash
export ELEVENLABS_API_KEY=...   # real key
node apps/cli/dist/index.js audio voices --provider elevenlabs | head
node apps/cli/dist/index.js audio generate "Hello from imagent" --provider elevenlabs --option voice=<id> --out /tmp
# verify a playable mp3 is written and an audio gallery item appears:
node apps/cli/dist/index.js gallery ls --kind audio
```

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fixes from full audio validation"
```

### Task 13.3: Version bump + sync (if releasing)

- [ ] **Step 1:** If this work ships in a release, bump the root `package.json` version, then:

```bash
bun run version:sync
git add -A
git commit -m "chore: bump version + sync workspace versions for audio support"
```

---

## Plan self-review notes

- **Spec coverage:** Provider integration (ElevenLabs + MiniMax TTS) → Phases 5–6; core audio type → Phase 1–2; persistence → Phase 3; config → Phase 4; CLI → Phase 7; IPC → Phase 8; Studio new type + preview → Phases 10–11; Gallery media-type separation + audio card → Phase 12; docs → Phase 13. All four user requirements are covered.
- **Type consistency:** `AudioRequest`, `AudioModelDef`, `AudioOutput`, `AudioProvider`, `AudioCapabilities`, `VoiceInfo`, `createAudioRegistry`, `resolveAudioProviderModels`, `BaseAudioProvider`, `validateAudioRequestAgainstModel`, `applyAudioDefaults` are defined in Phases 1–6 and reused consistently in later phases.
- **Known risks:** (1) the `004` migration relies on `PRAGMA writable_schema=RESET` — covered by a dedicated test (Task 3.3); (2) MiniMax `groupId` is required for TTS — enforced at registry construction and surfaced in config/doctor; (3) `TOTAL_PROVIDER_COUNT` changes 8→9 — Task 6.4 calls out updating provider-count assertions.
- **UI phases** use typecheck/build (and manual smoke) as gates because the renderer is not unit-tested in this repo; backend phases use Vitest TDD.

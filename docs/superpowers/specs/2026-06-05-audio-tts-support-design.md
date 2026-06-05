# Audio (TTS) Support — Design

Status: Approved (brainstorming)
Date: 2026-06-05

## Goal

Add **audio** as a first-class media type alongside image and video, with
text-to-speech (TTS) generation. Ship two TTS providers — **ElevenLabs** (new
vendor) and **MiniMax** (existing vendor, new TTS model) — and surface audio
across the Studio, Gallery, and CLI.

## Background / Constraints

The core domain separates media kinds by **lifecycle**:

- Image providers expose a synchronous `generate` operation.
- Video providers expose async `submit / poll / fetch / cancel`.

ElevenLabs and MiniMax T2A both return audio synchronously, so **audio mirrors
the image lifecycle** (synchronous `generate`). This is the lowest-risk shape
and keeps TTS-specific concerns isolated.

### Key product decisions (from brainstorming)

- **Voice selection:** In the CLI, voice is passed as a model option
  (`-o voice=<id>`). In the Studio, the voice picker is populated from each
  provider's voice-list API (live discovery) when available, falling back to a
  static voice list declared in the catalog when the provider has no list API.
- **Gallery preview:** Audio items render as a compact card with an inline
  play/pause button + duration; the lightbox shows a full audio player. The
  Gallery gains default media-kind separation: **Image / Video / Audio**.
- **Controls:** Common cross-provider controls (speed, output format) are
  surfaced as fields, with per-model extras (ElevenLabs stability/similarity,
  MiniMax emotion/volume/pitch) driven by catalog capabilities.
- **Architecture:** New first-class `AudioProvider` port (Option 1), parallel to
  `ImageProvider`. No reuse/generalization of the image port.

## Out of scope (YAGNI)

Voice cloning, streaming playback, audio editing/trimming, SSML input,
multi-user features.

---

## Component Design

### 1. Core domain (`@imagent/core`)

- `MediaKindSchema` (`domain/media.ts`): add `"audio"`.
- `domain/model.ts`:
  - `AudioModelCapsSchema` / `AudioModelCapsOverrideSchema` — catalog-driven
    capabilities:
    - `voices?: { id: string; name: string; ... }[]` — static fallback voices.
    - `supportsVoiceDiscovery?: boolean` — provider exposes a live voice-list API.
    - `outputFormats?: string[]` — selectable audio formats.
    - `speedRange?: { min: number; max: number }`.
    - Optional per-model extra knobs declared as ranges/enums:
      `stability`, `similarity`, `style`, `emotion`, `volume`, `pitch`.
    - Override schema is all-optional (mirrors the `*CapsOverrideSchema`
      convention to avoid defaulted fields clobbering bundled values).
  - `AudioModelDefSchema` and `AudioProviderModelSchema` (parallel to image).
- `domain/request.ts`:
  - `AudioRequestSchema`: `prompt` (the text to speak, `min(1)`), `providerId`,
    `model`, `voice?`, `speed?`, `outputFormat?`, `assetIds` (default `[]` for
    parity; audio normally has none), `boardId?`, `parentId?`,
    `raw?` (per-model extras passthrough). **No image references.**
  - `GenerationIntentSchema`: add `{ kind: "audio", request: AudioRequestSchema,
    parentId?, boardId? }` to the discriminated union.
- `domain/result.ts`:
  - `AudioOutputSchema`: `bytes`, `mimeType`, `durationMs?`, `raw?`.
  - `AudioGenerationResultSchema`: `{ output: AudioOutput }` (single output).
- `ports/audio-provider.ts`:
  - `AudioCapabilities` aggregate snapshot.
  - `AudioProvider` interface: `id`, `displayName`, `capabilities`, `models`,
    `generate(req, signal?)`, optional `test(signal?)`, and optional
    `listVoices(signal?): Promise<VoiceInfo[]>` for live discovery.
  - `VoiceInfo` type: `{ id, name, previewUrl?, labels? }`.
- Export all new symbols from `index.ts`.

### 2. Job runner (`@imagent/core/application/job-runner.ts`)

- Add `audioRegistry: AudioRegistry` dep (`ReadonlyMap<string, AudioProvider>`).
- Add an `audio` arm to `start()` that reuses the synchronous image path:
  call `provider.generate`, write bytes under `gallery/`, create a
  `gallery_items` row with `kind: "audio"`, `durationMs`, no thumbnail
  (width/height null).
- `resumeRunningJobs`: stale `audio` jobs are marked failed (same as image —
  no provider-side handle to resume).

### 3. Providers (`@imagent/providers`)

- **ElevenLabs** — new vendor id `elevenlabs`:
  - `elevenlabs/audio.ts`: `POST /v1/text-to-speech/{voice_id}` with
    `{ text, model_id, voice_settings, output_format }`; returns audio bytes.
  - `listVoices`: `GET /v1/voices`.
  - `test()`: `GET /v1/voices` (cheap authenticated probe; never throws).
  - Auth: header `xi-api-key`. Secret: `elevenlabs.apiKey`.
- **MiniMax TTS** — existing vendor `minimax`, new model (`speech-02`, etc.):
  - `minimax/audio.ts`: `POST /v1/t2a_v2` with
    `{ model, text, voice_setting, audio_setting }`; audio returned as
    hex/base64 in the JSON envelope. Reuse `assertMiniMaxOk` for the
    `base_resp` envelope.
  - T2A v2 requires `GroupId` as a query param → add optional `minimax.groupId`
    routing field (config prefs). Audio generation errors clearly if it's
    missing.
  - `listVoices`: use MiniMax voice-list API if available; otherwise static
    catalog voices (`supportsVoiceDiscovery: false`).
- `registry.ts`:
  - `createAudioRegistry(secrets, prefs, catalog): AudioRegistry`.
  - Add `elevenlabs` to `BUILT_IN_PROVIDER_IDS` (and bump
    `TOTAL_PROVIDER_COUNT` accordingly); include it in
    `configuredProviderCount`.
  - `resolveAudioProviderModels` / `effectiveAudioOfferings` in
    `catalog/resolve.ts`; `audio` model defs + provider offerings in
    `catalog.default.json`; `catalog/schema.ts` + test-fixtures updated.

### 4. Config (`@imagent/config`)

- `ProviderSecretsSchema`: add `elevenlabs: { apiKey }`.
- Provider prefs: add optional `minimax.groupId`; ensure `elevenlabs` routing
  entry exists (baseUrl override support).
- Add audio default-model preference (e.g. `audio.defaultModel`) +
  `DEFAULT_CONFIG`.
- `secrets.ts` `ENV_KEYS`: add `elevenlabs` (e.g. `ELEVENLABS_API_KEY`).

### 5. Persistence (`@imagent/persistence`)

- **Migration `004_audio.sql`**: widen the `kind` CHECK constraint to include
  `'audio'` on both `jobs` and `gallery_items`.
  - SQLite cannot alter CHECK constraints in place, and `gallery_items_fts` is a
    content-table FTS keyed by `rowid`. The migration recreates each table with
    the widened CHECK, **preserving `rowid`** via explicit
    `INSERT INTO new(rowid, ...) SELECT rowid, ...`, then drops/recreates the
    FTS table + triggers and rebuilds the index (same pattern as `003`).
- Wire `004` into `BUILTIN_MIGRATIONS` in `db.ts`, including the **SEA asset
  path** (`readSeaAsset("004_audio.sql")`) and the filesystem path.
- Audio reuses the existing `gallery_items` storage and repositories.

### 6. IPC (`@imagent/ipc`)

- Audio generation contract (start intent) + `listVoices(providerId, modelId?)`.
- Add audio to the providers contract (`contract.providers.ts`) so the Providers
  UI knows about the `elevenlabs` vendor + audio offerings.

### 7. Desktop (`@imagent/studio`)

- `useUIStore`: `StudioMode` → add `"audio"`; persistence/migration of stored
  mode value tolerates the new value.
- `StudioModeSwitch`: third tab "Audio".
- New `AudioRail`: text area + voice picker (from `listVoices`, static
  fallback) + speed + format + per-model extras rendered from caps.
- Canvas/preview: audio player for the active draft / latest result.
- Studio gallery rail filters to `kind: "audio"` in audio mode; audio mode has
  no reference drag-and-drop or asset slots.
- `studioDraft` gains an `audio` draft slice with `setAudioDraft`.
- Providers page: ElevenLabs vendor card (display name, masking, prefs);
  MiniMax gains a `groupId` field. Models page logo mapping for `elevenlabs`.
- i18n: `en` + `zh` strings for audio Studio, voices, gallery filter, providers.

### 8. Gallery (`@imagent/studio` Gallery page)

- Default media-kind separation: top-level filters **All / Image / Video /
  Audio** (plus Favorites + boards), driven by `GalleryQuery.kind`.
- `GalleryItemCard` (in `@imagent/ui`): audio variant — compact card, inline
  play/pause + duration, no image thumbnail.
- Lightbox: full audio player for audio items.

### 9. CLI (`@imagent/cli`)

- `apps/cli/src/commands/audio.ts`:
  - `imagent audio generate <text>` — `--provider`, `--model`,
    `-o voice=… -o speed=… -o format=…` (+ per-model extras), `--out`.
    Mirrors `image generate` (synchronous, prints the result path).
  - `imagent audio voices --provider <id> [--model <id>]` — voice discovery
    (live API or static fallback).
- Register the command in `index.ts`.
- `models` / `options` / `doctor`: include `audio` kind + the `elevenlabs`
  vendor.
- `support/config/shared.ts` (`VENDOR_KEYS` + `ALLOWED_FIELDS`: `elevenlabs`,
  `minimax.groupId`) and `support/config/provider-routing.ts`
  (`BUILT_IN_ROUTING_IDS`).
- `support/runtime.ts` + `buildRunner`: build and inject the audio registry.

### 10. Docs

- Update `architecture.md`, `docs/providers.md`, `docs/models.md`,
  `docs/cli.md`, and README scope to mention audio/TTS + ElevenLabs.

## Validation

Per-package, in dependency order:

1. `bun run --filter @imagent/core build|typecheck|test`
2. `bun run --filter @imagent/config build|test`
3. `bun run --filter @imagent/providers build|typecheck|test`
4. `bun run --filter @imagent/persistence build|test`
5. `bun run --filter @imagent/ipc build|test`
6. `bun run --filter @imagent/cli build|test`
7. Desktop: build core/config/ipc/persistence/providers/ui then
   `@imagent/studio` typecheck/build.
8. Repo-wide: `bun run build` and `bun run test`.

After bumping any version, run `bun run version:sync`.

## Risks / Notes

- The `004` migration is the trickiest piece (CHECK widening + FTS rebuild while
  preserving `rowid`). It must be covered by a persistence test that inserts an
  `audio` gallery item and verifies FTS search still works.
- MiniMax T2A v2 `GroupId` requirement: audio generation must fail with a clear
  message when `minimax.groupId` is unset.
- Keep the image/video code paths untouched; audio is additive.

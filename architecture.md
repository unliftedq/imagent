# imagent — Architecture

A localized image **and** video generation studio shipping as Electron desktop **+** Node CLI from one greenfield monorepo. Single-user, fully local: SQLite + filesystem under `~/.imagent/`, no remote backend, no auth.

## 1. Purpose & Scope

**Purpose.** A creator's workspace where you build reusable assets (characters / objects / backgrounds / styles), generate images and videos against multiple LLM providers, organise outputs into Boards/Collections, and remix prior generations. Equivalent to a local single-user OpenArt-lite focused on Boards + Remix + first-class video.

**In scope (v1).**
- Electron desktop + headless CLI from one monorepo.
- Six providers day-one: OpenAI, Azure OpenAI, Google (Imagen/Gemini), Flux (BFL official `api.bfl.ai`), ByteDance (Seedream image + Seedance video, shared key), xAI (Grok image).
- Asset taxonomy: `character | object | background | style`. Characters/objects/backgrounds are reference-image based; styles can carry a reference image AND/OR a prompt snippet.
- Boards/Collections with drag-and-drop, masonry gallery, Remix flow.
- Video pipeline with async job lifecycle that survives app restarts.

**Out of scope (v1).** LoRA / DreamBooth fine-tuning, ComfyUI-style workflow editor, img2img / inpainting, social discovery feed, multi-user / cloud sync.

## 2. Tech Stack

- **TypeScript 5.9 strict** (NodeNext), **Bun 1.3** workspaces, **Turborepo 2.x** for `build/typecheck/test`.
- **React 19** + **Tailwind CSS v4** (`@theme`) + **Radix UI** primitives + **Phosphor** duotone icons (matches sibling `agentra`, `imagent-cli`).
- **Zustand 5** for renderer state.
- **better-sqlite3 12.x** + WAL, opened from main process only.
- **Electron 33** with three Vite configs (main / preload / renderer).
- **Commander 12** for the CLI; ships as `bun build --compile` single binary.
- **Biome 2.x** (lint+format), no ESLint/Prettier.
- **Native modules**: `better-sqlite3`, `sharp`, rebuilt for Electron via `@electron/rebuild` postinstall in `apps/desktop`.

## 3. Monorepo Layout

```
imagent/
  package.json   bun.lock   turbo.json   tsconfig.base.json   biome.jsonc

  packages/
    core/         # @imagent/core         — domain types, ports, use cases (no I/O)
    providers/    # @imagent/providers    — ImageProvider + VideoProvider impls per vendor
    persistence/  # @imagent/persistence  — better-sqlite3, migrations, repos, files, thumbnails
    config/       # @imagent/config       — zod schema, secrets abstraction
    ipc/          # @imagent/ipc          — zod IPC contract + client/server bindings
    ui/           # @imagent/ui           — Radix primitives + Tailwind v4 components

  apps/
    desktop/      # @imagent/studio       — Imagent Electron app (3 Vite configs: main / preload / renderer)
    cli/          # @imagent/cli (bin: imagent) — Commander, ships as bun-compiled binary
```

Why Bun + Turbo: matches sibling `editor`, package-manager-familiar from `imagent-cli`. Turbo provides cache for `build/typecheck/test` across 8 packages where `tsc -b` alone breaks down. All packages are private; the CLI binary is the only externally-shippable artifact.

## 4. Domain Model & Provider Ports

Two ports in `packages/core/src/ports/`. **No fake unification** — image is sync-ish (1–30s end-to-end), video is asynchronous (Seedance is 1–5 min) and demands a job model.

```ts
// packages/core/src/ports/image-provider.ts
export interface ImageProvider {
  readonly id: string;                      // "openai" | "azure-openai" | "google" | "flux-bfl" | "bytedance" | "xai"
  readonly displayName: string;
  readonly capabilities: ImageCapabilities; // sizes, max refs, supports style ref
  generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult>;
}

// packages/core/src/ports/video-provider.ts
export interface VideoProvider {
  readonly id: string;                      // "bytedance" | (future) "sora" | "veo"
  readonly displayName: string;
  readonly capabilities: VideoCapabilities; // durations, fps, resolutions, ref-image support
  submit(req: VideoRequest): Promise<VideoJobHandle>;          // returns provider job id quickly
  poll(handle: VideoJobHandle): Promise<VideoJobStatus>;       // {state, progress?, errorMessage?}
  fetch(handle: VideoJobHandle): Promise<VideoGenerationResult>;
  cancel?(handle: VideoJobHandle): Promise<void>;
}

export type VideoJobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";
```

**JobRunner is the single application-level service** that the CLI and IPC handlers call. It owns persistence, eventing, and lifetime; the renderer never touches a provider directly.

```
JobRunner.start(intent: GenerationIntent): Promise<JobId>
  ├─ image  → provider.generate() → persist GalleryItem → emit job.completed
  └─ video  → provider.submit()   → persist Job{state:queued,providerJobId}
                                  → schedule poll loop (exp backoff, capped 15s)
                                  → on each tick: persist progress, emit job.progress
                                  → on success: provider.fetch() → persist file + GalleryItem
                                  → emit job.completed
```

Because every state transition is in SQLite (`jobs` table), the runner can resume on app launch by selecting `state IN ('queued','running')` and rescheduling polls — Seedance jobs survive the 12h server-side TTL.

**Vendor = Provider.** A provider is the unit a user configures, not a model. ByteDance (Ark) hosts two model families — Seedream for image, Seedance for video — under one set of credentials, so the user sees **one** "ByteDance" provider with **one** key field; the model picker in Studio / Video Studio decides whether the request goes to Seedream or Seedance. Concretely: `packages/providers/src/bytedance/` exposes `ByteDanceImageProvider` (default model: Seedream) and `ByteDanceVideoProvider` (default model: Seedance), **both with `id: "bytedance"`**. The runtime discriminator is the port type — the same id appears in both `createImageRegistry` and `createVideoRegistry` outputs. Each provider has its own class; OpenAI / Azure / xAI / ByteDance image / Google all use the relevant official SDK; Flux + ByteDance Seedance + xAI video remain on raw HTTP.

**Flux v1 = BFL official.** `POST /v1/flux-{model}` returns `{id, polling_url}`; we then `GET polling_url` until `status === "Ready"`, then download `result.sample`. Same shape as Seedance, so the polling logic generalises.

`packages/providers/src/registry.ts` exports two factories:
```
createImageRegistry(secrets, settings) -> { openai, "azure-openai", google, "flux-bfl", bytedance, xai }
createVideoRegistry(secrets, settings) -> { bytedance }                                   // v1 (same vendor id, video port)
```

### Models & Capabilities

A model is more than a string id — different models within one provider expose different sizes, max-reference counts, durations, fps.

The **built-in default catalog** ships as `packages/providers/src/catalog.default.json`; the **runtime** catalog lives at `~/.imagent/catalog.json` (user-editable JSON, validated against `ModelCatalogSchema` on load). On first run the bundled default is written to that path; on subsequent runs the user file is **authoritative** (no merge with bundled). On parse failure the loader logs a warning and falls back to bundled in-memory without overwriting the broken file. Users never maintain `models[]` in `config.json` — they only configure authentication.

Catalog v2 separates model identity from provider routing:

```json
{
  "version": 2,
  "models": {
    "image": {
      "gpt-image-2": { "id": "gpt-image-2", "displayName": "GPT Image 2", "capabilities": {}, "defaults": {} }
    },
    "video": {}
  },
  "providers": {
    "openai": {
      "image": [{ "id": "gpt-image-2", "modelId": "gpt-image-2" }]
    },
    "azure-openai": {
      "image": [{ "id": "my-prod-deployment", "modelId": "gpt-image-2" }]
    }
  }
}
```

`models.image/video` are canonical capability records. `providers.<id>.image/video` are provider-facing offerings: `id` is the string sent to the vendor API (or Azure deployment name), while `modelId` points at the canonical model whose capabilities/defaults are inherited. Provider offerings may override capabilities/defaults for provider-specific quirks. This same shape supports Azure deployments, OpenRouter-style route ids, Cloudflare Workers AI aliases, and future providers without duplicating model definitions.

```ts
// packages/core/src/domain/model.ts
export const ImageModelCapsSchema = z.object({
  sizes:                  z.array(z.string()).optional(),   // ["1024x1024", "1536x1024"]
  aspectRatios:           z.array(z.string()).optional(),   // for ratio-based vendors (Gemini)
  qualities:              z.array(z.string()).optional(),   // OpenAI's `low|medium|high|auto`; absent = no quality knob, request must not set quality
  maxReferences:          z.number().int().nonnegative().optional(),
  maxOutputs:             z.number().int().min(1).default(1),
  supportsNegativePrompt: z.boolean().default(false),
  supportsSeed:           z.boolean().default(false),
  supportsStyleRef:       z.boolean().default(false),
});

export const VideoModelCapsSchema = z.object({
  durationsSec:           z.array(z.number()).optional(),
  maxDurationSec:         z.number().optional(),
  fpsOptions:             z.array(z.number()).optional(),   // [24, 30]
  resolutions:            z.array(z.string()).optional(),   // ["720p", "1080p"]
  supportsFirstFrame:     z.boolean().default(false),
  supportsLastFrame:      z.boolean().default(false),
  supportsRefImages:      z.boolean().default(false),
});

export const ImageModelDefSchema = z.object({
  id:           z.string(),
  baseModelId:  z.string().optional(),  // present after provider offering resolution
  displayName:  z.string().optional(),
  capabilities: ImageModelCapsSchema.optional(),
  defaults:     z.record(z.unknown()).optional(),  // default size / aspect / count etc.
});
export const VideoModelDefSchema = z.object({
  id:           z.string(),
  baseModelId:  z.string().optional(),  // present after provider offering resolution
  displayName:  z.string().optional(),
  capabilities: VideoModelCapsSchema.optional(),
  defaults:     z.record(z.unknown()).optional(),  // default durationSec / fps etc.
});
```

**Resolution at startup** deep-merges canonical model ← provider offering into the provider's concrete `models` map:

```ts
function resolveProviderModel(catalog, offering) {
  const base = catalog.models.image[offering.modelId];
  return ImageModelDefSchema.parse({
    id: offering.id,
    baseModelId: offering.modelId,
    displayName: offering.displayName ?? base.displayName,
    capabilities: { ...base.capabilities, ...offering.capabilities },
    defaults:     { ...base.defaults,     ...offering.defaults     },
  });
}
```

The resolved model drives the entire downstream pipeline:

- **UI**: PromptComposer reads `capabilities.sizes` to render the size selector and disables the reference dropzone when `maxReferences === 0`. Video Studio's duration slider snaps to `durationsSec`.
- **Request validation**: `ImageRequest` is validated against the resolved model's capabilities before reaching the provider — invalid `count`, `size`, or refs are rejected with precise error messages.
- **Defaults injection**: missing fields on the request are filled from `model.defaults` before validation, so a one-line `imagent image "foo"` still produces sane parameters per chosen model.

**Strict mode is on by default**: an unknown short-form id throws at startup rather than silently degrading. Users adding an unreleased model must supply at least an `id` in long form (capabilities optional, but inline-object syntax signals intent).

## 5. SQLite Schema

`better-sqlite3` synchronous, opened from main process only, WAL mode, busy_timeout 5s. Migrations in `packages/persistence/src/migrations/` run on startup if `user_version` is behind.

```sql
-- 001_init.sql
CREATE TABLE assets (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('character','object','background','style')),
  name            TEXT NOT NULL,
  description     TEXT,
  prompt_snippet  TEXT,                      -- only meaningful for kind='style'
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  archived_at     INTEGER
);
CREATE INDEX idx_assets_kind ON assets(kind, archived_at);

CREATE TABLE asset_files (
  id            TEXT PRIMARY KEY,
  asset_id      TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('reference','thumbnail')),
  rel_path      TEXT NOT NULL,               -- relative to ~/.imagent/assets/
  mime_type     TEXT NOT NULL,
  width         INTEGER, height INTEGER,
  bytes         INTEGER NOT NULL,
  sha256        TEXT NOT NULL,               -- enables dedupe
  position      INTEGER NOT NULL DEFAULT 0,  -- multiple refs per asset
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_asset_files_asset ON asset_files(asset_id, role, position);
CREATE INDEX idx_asset_files_sha   ON asset_files(sha256);

CREATE TABLE boards (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  cover_item_id  TEXT,                       -- nullable, no FK (avoids cycle)
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE gallery_items (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('image','video')),
  parent_id        TEXT REFERENCES gallery_items(id) ON DELETE SET NULL,  -- remix lineage
  prompt           TEXT NOT NULL,
  negative_prompt  TEXT,
  provider_id      TEXT NOT NULL,            -- "openai" | "azure-openai" | "google" | "flux-bfl" | "bytedance" | "xai"
  model            TEXT NOT NULL,
  params_json      TEXT NOT NULL,            -- aspect, size, fps, duration, count, seed, raw provider params
  rel_path         TEXT NOT NULL,            -- output file under ~/.imagent/gallery/
  thumb_path       TEXT,
  duration_ms      INTEGER,                  -- video only
  width            INTEGER, height INTEGER,
  bytes            INTEGER NOT NULL,
  job_id           TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  favorited        INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_gallery_kind_created ON gallery_items(kind, created_at DESC);
CREATE INDEX idx_gallery_parent       ON gallery_items(parent_id);

CREATE TABLE board_items (
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (board_id, item_id)
);

CREATE TABLE gallery_item_assets (
  item_id    TEXT NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  asset_id   TEXT NOT NULL REFERENCES assets(id)        ON DELETE CASCADE,
  role       TEXT NOT NULL,                 -- denormalised AssetKind for query speed
  PRIMARY KEY (item_id, asset_id)
);
CREATE INDEX idx_item_assets_asset ON gallery_item_assets(asset_id);

CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('image','video')),
  state           TEXT NOT NULL CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
  provider_id     TEXT NOT NULL,
  provider_job_id TEXT,
  request_json    TEXT NOT NULL,
  progress        REAL,
  error_message   TEXT,
  result_item_id  TEXT REFERENCES gallery_items(id),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  finished_at     INTEGER
);
CREATE INDEX idx_jobs_state ON jobs(state, kind, created_at);

CREATE TABLE kv (
  key        TEXT PRIMARY KEY,               -- e.g. 'ui.activeBoardId', 'studio.promptDraft', 'window.bounds'
  value      TEXT NOT NULL,                  -- JSON-encoded
  updated_at INTEGER NOT NULL
);

-- 002_fts.sql
CREATE VIRTUAL TABLE gallery_items_fts USING fts5(
  prompt, negative_prompt,
  content='gallery_items', content_rowid='rowid', tokenize='porter unicode61'
);
CREATE VIRTUAL TABLE assets_fts USING fts5(
  name, description, prompt_snippet,
  content='assets', content_rowid='rowid', tokenize='porter unicode61'
);
-- Triggers AFTER INSERT/UPDATE/DELETE on each base table mirror into FTS.
```

## 6. Filesystem Layout (`~/.imagent/`)

```
config.json               # non-secret app config (zod-validated)
catalog.json              # user-editable model catalog (zod-validated, seeded from bundled default on first run)
secrets.json              # provider secrets shared by desktop + CLI (chmod 600)
studio.db {-wal, -shm}    # SQLite + WAL siblings
logs/main.log
logs/jobs/{yyyy-mm-dd}.log
assets/{assetId}/ref-001.png  ref-002.jpg  thumb.webp
gallery/{yyyy}/{mm}/{itemId}.{png|jpg|webp|mp4}
gallery/{yyyy}/{mm}/{itemId}.thumb.webp
cache/provider-responses/ # tiny JSON metadata cache, evictable
cache/video-temp/         # while a job is in-flight
```

Month-bucketed `gallery/` keeps ext4/NTFS happy past 100k items. Per-asset directories make `rm -rf` clean. The DB stores only `rel_path`; absolute paths are computed at read-time so the user can copy the whole folder between machines without breaking links.

## 7. Config, Secrets & Workspace State

User-facing configuration splits into **three categories** by sensitivity and write frequency:

| Category | Examples | Storage | Writers |
|---|---|---|---|
| **Secrets** | API keys; ByteDance `endpoint+apiKey`; Azure `endpoint+apiKey` | `secrets.json` (desktop + CLI, chmod 600) / env vars (CLI, highest priority) | Main process / CLI |
| **Preferences** | Default provider, theme, output dir, concurrency, generation defaults | `config.json` (plaintext, hand-edit friendly, zod-validated) | Main + UI |
| **Workspace state** | Recent boards, prompt drafts, sidebar collapsed, last-used assets, window bounds | SQLite `kv` table | Renderer (frequent writes) |

Workspace state is deliberately **not** in `config.json` — prompt drafts churn at typing speed and would pollute every backup diff; they're "app internal state", not "user configuration".

### 7.1 Schema (`packages/config/src/schema.ts`)

```ts
// Secrets: minimum required to authenticate. `baseUrl` is an optional
// power-user override (not surfaced in the desktop UI).
export const ProviderSecretsSchema = z.object({
  openai:         z.object({ apiKey: z.string(),
                             baseUrl: z.string().optional() }).optional(),
  "azure-openai": z.object({ endpoint: z.string(), apiKey: z.string(),
                             apiVersion: z.string().default("2024-10-21") }).optional(),
  google:         z.object({ apiKey: z.string(),
                             baseUrl: z.string().optional() }).optional(),
  "flux-bfl":     z.object({ apiKey: z.string(),
                             baseUrl: z.string().optional() }).optional(),
  bytedance:      z.object({ endpoint: z.string(),
                             apiKey: z.string() }).optional(),  // one key drives Seedream (image) + Seedance (video). Endpoint encodes the region (e.g. cn-beijing).
  xai:            z.object({ apiKey: z.string(),
                             baseUrl: z.string().optional() }).optional(),
});

// Preferences: the catalog is the source of truth for provider model/deployment
// bindings, so provider preference slots are empty by design until a provider
// needs non-secret runtime knobs.
export const ProviderPreferencesSchema = z.object({
  openai:         z.object({}).default({}),
  "azure-openai": z.object({}).default({}),
  google:         z.object({}).default({}),
  "flux-bfl":     z.object({}).default({}),
  bytedance:      z.object({}).default({}),
  xai:            z.object({}).default({}),
});

export const AppPreferencesSchema = z.object({
  theme:                 z.enum(["light","dark","system"]).default("system"),
  defaultProvider:       z.string().default("openai"),
  defaultOutputDir:      z.string().nullable().default(null),     // null → ~/.imagent/gallery
  generationConcurrency: z.number().int().min(1).max(8).default(2),
  keepPromptHistory:     z.boolean().default(true),
  openAfterGenerate:     z.boolean().default(false),
});

export const ConfigFileSchema = z.object({
  version:   z.literal(1),
  app:       AppPreferencesSchema,
  providers: ProviderPreferencesSchema,
});
```

Note: both secrets and preferences are keyed by **provider id** (= vendor). ByteDance's single API key drives both Seedream (image, via the image registry) and Seedance (video, via the video registry); the runtime discriminator is the port type. The user sees six rows on the Providers page (OpenAI, Azure, Google, Flux, ByteDance, xAI) regardless of how many model families a provider hosts internally. After the "minimum-auth" reshape, well-known providers carry empty preferences blocks — model lists come from the catalog, not from user input.

### 7.2 Access (dependency injection)

`@imagent/config` exposes interfaces, not singletons. Three implementations slot in:

```ts
export interface ConfigStore {
  loadConfig(): Promise<ConfigFile>;
  saveConfig(patch: DeepPartial<ConfigFile>): Promise<ConfigFile>;
  watchConfig(cb: (c: ConfigFile) => void): () => void;     // fs.watch on config.json
}

export interface SecretsStore {
  loadSecrets(): Promise<ProviderSecrets>;
  saveSecrets(patch: DeepPartial<ProviderSecrets>): Promise<void>;
}

createFileSecretsStore(path)             // desktop + CLI: secrets.json (chmod 600)
createEnvSecretsStore(process.env)       // CLI:    OPENAI_API_KEY etc., overrides file
```

CLI startup chains `mergeSecrets(fileSecrets, envSecrets)` — env wins, so `OPENAI_API_KEY=sk-other imagent image ...` runs with that key without persisting it. Desktop never reads env (avoids accidentally picking up staging keys from a developer shell).

### 7.3 Edit & reload paths

- **UI edits** (Providers / Settings page) → IPC `providers.config.set` / `providers.secrets.set` → main saves → re-instantiates registry → broadcasts `config.changed` → renderer `useConfigStore.refresh()`.
- **Hand edits** to `config.json` → `fs.watch` detects mtime change → `loadConfig` → broadcasts `config.changed`. Lets `vim ~/.imagent/config.json` workflows just work.
- **Hand edits to secrets** are supported through `secrets.json`; users can also use `imagent config set <vendor>.apiKey ...`.
- **Workspace state** (`kv` table) flows through `workspace.kv.{get,set,delete}` IPC; only the app itself writes here, no fs watcher needed.

### 7.4 Migrations

`config.json` carries `version: <n>` at the top level. `loadConfig` runs `migrations[v..currentVersion]` in order, persisting the upgraded form. Secrets don't carry a version because their JSON structure is stable and shared by desktop and CLI.

## 8. Electron Architecture

Three Vite configs (matches sibling `agentra`): `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`. HMR for renderer, watch+restart for main/preload.

- **Main**: owns DB handle, FS, JobRunner, polling intervals, and native dialogs. Imports `@imagent/{persistence,providers,config,ipc}`.
- **Preload**: thin — exposes `window.api` as a typed Proxy mirroring the IPC contract; subscribes to push events.
- **Renderer**: React 19 + Tailwind v4 + Radix + Phosphor. Never imports Node modules. Talks only via `window.api`.

### IPC: zod-validated, hand-rolled (no tRPC)

One contract module is the source of truth; the renderer-side `client.ts` is a `Proxy` over `ipcRenderer.invoke` that runs `output.parse()` on every response — type safety + runtime guarantees, no decorators, no extra deps.

```ts
// packages/ipc/src/contract.ts (excerpt)
export const contract = {
  "providers.list":          { input: z.void(),                 output: z.array(ProviderSummary) },
  "providers.config.get":    { input: z.void(),                 output: ProviderConfigSchema },
  "providers.config.set":    { input: ProviderConfigSchema,     output: z.void() },
  "providers.test":          { input: z.object({id: z.string()}), output: ProviderTestResult },
  "image.generate":          { input: ImageGenerateInput,       output: GalleryItemSchema },        // blocking: awaits terminal event (image is fast)
  "video.submit":            { input: VideoSubmitInput,         output: z.object({jobId: z.string()}) }, // non-blocking: returns immediately, renderer subscribes to push events
  "image.models":            { input: z.void(),                 output: z.array(ResolvedImageModel) },
  "video.models":            { input: z.void(),                 output: z.array(ResolvedVideoModel) },
  "jobs.list":               { input: JobsQuerySchema,          output: z.array(JobSchema) },
  "jobs.cancel":             { input: z.object({id: z.string()}), output: z.void() },
  // assets.{list,create,update,delete,uploadFile}
  // boards.{list,create,update,delete,addItem,removeItem,setCover}
  // gallery.{query,show,toggleFavorite,delete}
  // gallery.remix returns a discriminated union { kind: "image" | "video", request, providerId, modelId, parentId } so video parents preserve duration/fps/resolution
  // assets.{list,show,create,update,delete,uploadFile,addFile,removeFile}
  // workspace.kv.{get,set,delete}
} as const;

export const events = {
  "job.progress":    z.object({id: z.string(), progress: z.number(), state: JobStateSchema}),
  "job.completed":   JobSchema,
  "gallery.changed": z.object({id: z.string(), op: z.enum(["created","updated","deleted"])}),
};
```

## 9. CLI Surface

The CLI imports the same packages as the main process (no IPC). It opens the same `studio.db` and writes to the same `gallery/` tree, so anything generated from the shell shows up next time the desktop opens. Commander 12; ships as one bun-compiled binary `imagent.exe`.

```
imagent image "<prompt>"     [--provider bytedance] [--model seedream-3.0] [--ref path,path]
                             [--character slug] [--object slug] [--background slug] [--style slug]
                             [--count 4] [--out dir]
imagent video <prompt>       [--provider bytedance] [--model seedance-1.0-pro] [--duration 5] [--ref ...] [--character slug] [--wait]
imagent job {status|cancel|watch} <jobId>
imagent asset {add|list|rm|show} ...
imagent gallery {ls|remix|rm|favorite} ...
imagent config {get|set|path}
imagent doctor               # provider readiness, DB path, FTS status
```

## 10. UI Screens & State

Pages: **Studio (image)**, **Video Studio**, **Gallery (Boards sidebar + masonry + lineage drawer)**, **Assets (Characters / Objects / Backgrounds / Styles tabs)**, **Providers**, **Settings**.

Zustand stores in `apps/desktop/src/renderer/state/`:
```
useUIStore       { route, theme, sidebarCollapsed, promptDraft, activeBoardId }
useAssetsStore   { assetsByKind: Record<AssetKind, Asset[]>, refresh, upsert, remove }
useBoardsStore   { boards, refresh, create, addItem, removeItem }
useGalleryStore  { items, total, query, setQuery, refresh, favorite }
useJobsStore     { jobs: Record<JobId, Job>, applyProgressEvent, cancel }
useConfigStore   { providers, settings, save, testProvider }
```

`useJobsStore.applyProgressEvent` is wired to `window.api.on('job.progress' | 'job.completed', ...)` once at app startup. No react-query / swr — manual `refresh()` after mutations is enough at this app's complexity.

Primitives: Radix `Dialog / DropdownMenu / Select / Tabs / ScrollArea / Tooltip / Slider / Switch / Toast / Popover / Separator / Label`. Tailwind v4 `@theme` for colour and font scales. Inter for UI, JetBrains Mono for prompts. Phosphor duotone icons. Drag-and-drop in Boards via `@dnd-kit/core`. Video playback: HTML5 `<video>` over local file paths. Video thumbnails: `ffmpeg-static` grabs a frame at 1s.

## 11. Build, Dev & Packaging

**Runtime split (important).** Bun is the **build / dev / package-manager tooling**, but the **production runtime is Node** for anything that opens SQLite. `better-sqlite3` does not load under the Bun runtime (Bun issue oven-sh/bun#4290) — and we want one DB layer shared by Electron (Node-embedded) and the CLI, not two. So:

- **Bun owns**: `bun install`, workspace resolution, `turbo` invocation, Vite for the renderer, Biome, TypeScript builds.
- **Node owns**: the CLI process at runtime, the Electron main process (Electron embeds Node), every code path that touches `studio.db`.

### Workflows

- **Dev**:
  - Root: `bun run dev` → Turbo runs `dev` everywhere.
  - CLI: `tsc -b && node dist/index.js <args>` (Node, not Bun, because of the SQLite constraint above).
  - Desktop: `concurrently` runs three Vite watchers (main / preload / renderer) + an Electron launcher waiting on `dist/main/main.mjs`. Electron's embedded Node loads `better-sqlite3` natively after a one-time `bun run --filter @imagent/desktop rebuild` (see *Native rebuild* below).

- **Build**:
  - Packages: `tsc -b` via Turbo.
  - Renderer: `vite build`.
  - Main: `vite build --ssr` emitting **ESM (`main.mjs`)**, target `node20`, externalising `electron`, `better-sqlite3`, `sharp`. Main is ESM (not CJS) because workspace packages declare `"type":"module"` — a CJS main cannot `require()` ESM workspace deps, and Electron 28+ supports ESM main natively.
  - Preload: `vite build --ssr` emitting **CJS (`preload.cjs`)** — preload runs in Electron's `sandbox` context where ESM is restricted, and the bridge is small enough that CJS isn't a burden.
  - CLI: `tsc -b` + a `copy-sql` post-step so migrations land in `dist/`. (No `tsdown` / `bun build --compile` — those would force Bun runtime and break SQLite.)

- **Package**:
  - Desktop: `electron-builder` with NSIS for Windows (primary host), DMG for macOS, AppImage for Linux. Block matches sibling `agentra`.
  - CLI: **Node SEA** (Single Executable Applications, stdlib since Node 21) bundles the CLI + Node runtime into one `imagent.exe`. Migrations and any other static assets get embedded via SEA's asset map. Alternative: `pkg` if Node SEA's Windows code-signing story remains rough at M8.

- **Native rebuild (manual, not postinstall)**: `better-sqlite3` and `sharp` ship prebuilt binaries for the **host Node ABI**, which is what `bun install` lands. Electron 33 embeds a *different* Node ABI, so the desktop app needs `@electron/rebuild` to swap in Electron-ABI binaries. Running this on every `bun install` would also break the CLI and `packages/persistence` tests (which use host Node), so we **don't** wire it into `postinstall`. Instead:
  - `bun run --filter @imagent/desktop rebuild` — switches `better-sqlite3` + `sharp` to Electron ABI before launching desktop.
  - `npm rebuild better-sqlite3` (run inside `node_modules/.bun/better-sqlite3@x.y.z/node_modules/better-sqlite3`) — switches back to host Node ABI before running CLI / persistence tests.
  - The flip is fast (<5s) but a real source of "why does my test suite suddenly fail" if you forget. M8 packaging will pin Electron-ABI binaries inside the produced `electron-builder` artifact.

### Tooling pin

- Root `package.json` declares `"packageManager": "bun@1.3.x"` — Turbo 2.9 fails workspace resolution without it.

### Provider runtime deps

- `packages/providers` lists `openai` (used by OpenAI / Azure / ByteDance **image** — Vercel's AI SDK does not cover Seedream, so image stays on `openai@6` against the Ark base URL), `@google/genai` (used by Google image + video), `@ai-sdk/xai@4-beta` + `ai@7-beta` (used by both xAI image **and** xAI video via the Vercel AI SDK), and `@ai-sdk/bytedance@2-beta` + `ai@7-beta` (used by ByteDance **video** — Seedance — via the Vercel AI SDK) as runtime dependencies. The split inside `bytedance/` between video (Vercel SDK) and image (OpenAI SDK) is intentional: the OpenAI SDK pointed at Ark still works for Seedream image generation, and Vercel's Bytedance SDK currently only exposes `.video(...)`. Flux remains on the in-house `http/client.ts` raw-fetch wrapper. Both xAI video and ByteDance video bridge the SDK's single blocking `experimental_generateVideo(...)` onto our split `submit/poll/fetch/cancel` port via an in-memory `Map` keyed by a synthetic `providerJobId`; the auth probe in `test()` still uses the raw `httpClient` against `GET /models` (Ark) / `GET /v1/models` (xAI) since the Vercel SDK exposes no model-list call.

### Catalog load order

The model catalog loader (`@imagent/providers#loadCatalog`) runs at app boot (desktop main: in `bootstrapRuntime`) and once per CLI invocation (`loadCliRuntime`), parsed against `ModelCatalogSchema` **before** the image / video registries are constructed. The desktop `RuntimeServices.refresh()` re-reads the catalog so hand-edits to `~/.imagent/catalog.json` take effect without an app restart.

## 12. Critical Files (net-new)

```
packages/core/src/ports/{image-provider,video-provider}.ts
packages/core/src/application/{job-runner,generate-image,submit-video,remix}.ts
packages/providers/src/{openai,azure,google,flux,bytedance}/{image,video}.ts
packages/providers/src/registry.ts
packages/persistence/src/{db,files,thumbnails}.ts
packages/persistence/src/migrations/{001_init,002_fts}.sql
packages/persistence/src/repositories/{assets,boards,gallery,jobs}.repository.ts
packages/config/src/{schema,store,secrets}.ts
packages/ipc/src/{contract,client,server,events}.ts
packages/ui/src/{primitives,composites}/...   styles.css
apps/desktop/{vite.{main,preload,renderer}.config.ts, electron-builder.yml, index.html}
apps/desktop/src/main/{main,ipc-handlers,job-runner-bootstrap}.ts
apps/desktop/src/preload/preload.ts
apps/desktop/src/renderer/{main,routes,pages/*,state/*,features/*}
apps/cli/src/{index,commands/*}.ts
```

Read-only references (sibling patterns we mirror but do not import):
- `Q:/development/imagent-cli/packages/core/src/ports/image-provider.ts` — port shape
- `Q:/development/imagent-cli/packages/providers/src/providers/*` — vendor HTTP patterns (esp. ByteDance signing)
- `Q:/development/agentra/{vite.{main,preload,renderer}.config.ts, package.json}` — Electron + Vite triple-config layout, electron-builder block
- `Q:/development/openclaw/tsdown.config.ts` — CLI bundling

# imagine-studio — Work Plan

Execution sequence to take `Q:/development/imagine-studio` from empty to a packaged Electron app + bun-compiled CLI binary. Architectural decisions live in [`architecture.md`](./architecture.md); this document is the order of operations and acceptance bar.

## 0. Confirmed Decisions

| Topic | Decision |
|---|---|
| Repo strategy | Greenfield. **Do not** reuse `imagine-cli` code; mirror patterns only. |
| Shipping form | Electron desktop **+** Node CLI from one Bun + Turbo monorepo. |
| Providers v1 | All six day-one: OpenAI, Azure OpenAI, Google (Imagen/Gemini), Flux (BFL official `api.bfl.ai`), Volcengine (one provider hosting Seedream image + Seedance video, shared key), xAI (Grok image). |
| Asset taxonomy | `character | object | background | style`. CB/O/B = reference-image based. Styles can be reference image AND/OR prompt snippet. |
| Killer features | Boards/Collections + Remix + first-class video generation. |
| Out of scope | LoRA training, ComfyUI workflow editor, img2img/inpaint, social discovery feed, multi-user. |
| Video job restart | Per-vendor default. Seedance auto-resumes within its 12h server-side TTL. |
| Native modules | `better-sqlite3`, `sharp`, rebuilt for Electron via `@electron/rebuild` postinstall in `apps/desktop`. |
| Style asset semantics | When both ref-image and prompt-snippet are present: prefer ref-image if the chosen provider supports refs; else fall back to prompt-only. (Default; overridable via UI later.) |
| Asset reference cap | Silently cap at the provider's documented max with a UI hint. |

## 1. Milestones

Each milestone is independently shippable to the user's own laptop. M1–M3 are headless and CLI-driven; M4 onwards adds the desktop surface.

### M1 — Foundation (no UI)

Bun + Turbo monorepo skeleton. `core` ports, `persistence` with migrations + repos, `config` with zod schema, `providers` registry stub, `ipc` contract scaffolding. CLI `imagine doctor` prints DB path, FTS status, and configured providers (none yet).

**Deliverables**
- Workspace root: `package.json`, `bun.lock`, `turbo.json`, `tsconfig.base.json`, `biome.jsonc`, `.gitignore`.
- `packages/core` exporting `ImageProvider`, `VideoProvider`, domain types, empty `JobRunner` skeleton.
- `packages/persistence` with `001_init.sql`, `002_fts.sql`, repositories, FTS triggers.
- `packages/config` with zod schema + file-backed `loadSecrets()` implementation.
- `apps/cli` with `doctor` only.

**Acceptance**
- `bun install` + `bun run typecheck` pass cleanly.
- `bun run --filter @imagine-studio/cli dev doctor` prints something like:
  ```
  imagine-studio v0.0.1
  DB:        ~/.imagine-studio/studio.db (FTS=ok)
  Config:    ~/.imagine-studio/config.json (defaults)
  Providers: 0 / 6 configured
  ```

### M2 — Provider Implementations

All six vendors implemented with mocked-HTTP unit tests. Image `generate()` and Video `submit/poll/fetch` real against vendor APIs. JobRunner persists, polls with exponential backoff (capped 15s), emits `job.progress` / `job.completed` events.

**Deliverables**
- `packages/providers/src/{openai,azure,google,flux,volcengine,xai}/{image,video}.ts`. Volcengine has both ports (Seedream image + Seedance video, same `id: "volcengine"`); OpenAI/Azure/Google/Flux/xAI are image-only at v1.
- `packages/providers/src/http/` shared fetch wrapper with auth, retry-on-429, timeouts.
- `packages/providers/src/registry.ts` with `createImageRegistry` / `createVideoRegistry`.
- `JobRunner` complete: persistence, scheduled polling, events, abort handling.
- HTTP-mocked unit tests per vendor (one happy path, one error path, one polling/timeout path for video).

**Acceptance**
- `bun run --filter @imagine-studio/providers test` green.
- `imagine config set openai.apiKey ...` persists to `~/.imagine-studio/secrets.json` (chmod 600).
- `imagine generate "a tiny otter on a lily pad" --provider openai` writes a real PNG to `~/.imagine-studio/gallery/<yyyy>/<mm>/<id>.png` and inserts a `gallery_items` row.

### M3 — CLI Parity

All CLI commands listed in `architecture.md` §9 are functional. You can produce any kind of content without ever opening the desktop.

**Deliverables**
- `imagine generate` with `--character/--object/--background/--style` flags pulling assets and attaching `gallery_item_assets`.
- `imagine video <prompt> --provider volcengine [--model seedance-1.0-pro] [--wait]` (without `--wait`, prints job id and exits; with `--wait`, polls and prints progress).
- `imagine asset add <kind> --name X --ref path... [--prompt "..."]` (prompt only meaningful for `style`).
- `imagine asset {list,rm,show}`, `imagine board {create,add,ls,rm}`, `imagine gallery {ls,remix,rm,favorite}`, `imagine config {get,set,path}`.
- `imagine job {status,cancel,watch}` for inspecting/aborting in-flight jobs.

**Acceptance**
- `imagine video "rotating crystal in a misty forest" --provider volcengine --model seedance-1.0-pro --wait` blocks, prints progress, then prints the MP4 path.
- `imagine gallery ls --kind video` shows the new item.
- `imagine asset add character --name Alice --ref ./alice1.png --ref ./alice2.png` then `imagine generate "Alice waving" --character <id>` records the asset link in `gallery_item_assets`.

### M4 — Electron Shell

Three Vite configs, IPC contract wired end-to-end, **Settings** and **Providers** pages functional. Connection-test buttons turn green for each configured vendor. Config persists via Electron `safeStorage` (`secrets.bin`).

**Deliverables**
- `apps/desktop/{vite.main.config.ts, vite.preload.config.ts, vite.renderer.config.ts, electron-builder.yml, index.html}`.
- `apps/desktop/src/main/{main.ts, ipc-handlers.ts, job-runner-bootstrap.ts}` and `preload/preload.ts`.
- `packages/ipc` complete: `contract.ts`, `server.ts` (registers handlers on `ipcMain`), `client.ts` (renderer Proxy), `events.ts`.
- `packages/ui` with Radix-wrapped primitives + Tailwind v4 `@theme`.
- Renderer scaffold: `main.tsx`, `routes.tsx`, layout shell, **Providers** + **Settings** pages.
- First-run migration: if `~/.imagine-studio/secrets.json` exists, encrypt to `secrets.bin` and delete plaintext.

**Acceptance**
- `bun run --filter @imagine-studio/desktop dev` opens an Electron window in <3s.
- Providers page shows all six vendors; entering keys + clicking *Test* turns each indicator green when valid.
- Closing and reopening the app, the keys persist (decrypted via `safeStorage`).

### M5 — Studio (image) + Gallery + Boards + Remix

End-to-end image generation in the desktop UI. Results land in DB + filesystem + masonry. Boards sidebar with drag-and-drop. Remix populates Studio with parent's prompt and params.

**Deliverables**
- `pages/Studio.tsx`: PromptComposer, provider/model selectors, parameter rail, *Generate* button, recent results strip.
- `pages/Gallery.tsx`: Boards sidebar (drag-and-drop via `@dnd-kit/core`), masonry grid, item drawer with metadata + lineage.
- `gallery.remix` IPC pre-fills an `ImageRequest` from an existing item (renderer then calls `image.generate`).
- `useGalleryStore`, `useBoardsStore`, `useJobsStore` wired to IPC + push events.

**Acceptance**
- Generate from Studio → result appears in Gallery within 1s of provider response.
- Drag a gallery item into a Board → row in `board_items` persists; reload preserves order.
- Right-click → *Remix* opens Studio with parent prompt/params; the new item's `parent_id` references the original.

### M6 — Assets Management

Four-tab Assets page (Characters / Objects / Backgrounds / Styles) with CRUD. Studio's PromptComposer offers asset slots; generated items record `gallery_item_assets`.

**Deliverables**
- `pages/Assets.tsx` with Radix Tabs, list + detail drawer per kind.
- File upload via `assets.uploadFile` IPC (renderer reads file as ArrayBuffer, sends Buffer over IPC; main writes under `assets/{assetId}/`, computes sha256, generates thumbnail with sharp).
- AssetPicker composite in `packages/ui` consumed by Studio.
- Style asset detail view exposes both *Reference image* and *Prompt snippet* fields.

**Acceptance**
- Create a Character with two reference images → two rows in `asset_files` (sha256 populated, thumbnail under `assets/<id>/thumb.webp`).
- Pick that Character in the Studio asset slot, generate → new gallery item has a `gallery_item_assets` row referencing it (`role='character'`).
- Search the Assets page (FTS) returns the asset by name fragment.

### M7 — Video Studio

Submit Seedance jobs from a dedicated panel. Inline progress subscribed to `job.progress`. HTML5 video player + ffmpeg-derived thumbnails. Lineage in Gallery includes videos.

**Deliverables**
- `pages/VideoStudio.tsx` with duration / fps / aspect / first-frame controls.
- Inline `JobProgress` composite (subscribes to `useJobsStore`) for long-running jobs.
- `packages/persistence/src/thumbnails.ts` extended to call `ffmpeg-static` for video frame extraction at 1s.
- Gallery item drawer renders an HTML5 `<video>` over `file://` for local playback.
- App-launch resume: on main startup, select `jobs WHERE state IN ('queued','running')`, reschedule polls.

**Acceptance**
- Submit a Seedance job → app shows live progress within 5s.
- Close the app while running → reopen → progress resumes (poll continues against the unchanged provider job id) and completes within the 12h TTL.
- Final MP4 + thumbnail visible in Gallery; remix flow from a video item populates a fresh VideoRequest.

### M8 — Polish & Package

FTS-backed search, asset archive/restore, signed installers, README + screenshots.

**Deliverables**
- Search bar in Gallery and Assets pages backed by FTS5.
- Asset archive (`archived_at`) — hidden from pickers, restorable from a *Trash* tab.
- `electron-builder` NSIS installer for Windows (signed with self-signed cert at v1; commercial cert later).
- CLI binary `imagine.exe` published as a release artifact via **Node SEA** (Single Executable Applications) — not `bun build --compile`, because `better-sqlite3` does not load under the Bun runtime (Bun issue #4290). See architecture.md §11.
- README, demo gif, screenshot per page.

**Acceptance**
- FTS query `prompt:otter` returns the M2 item; no full-table scan in `EXPLAIN QUERY PLAN`.
- Install NSIS installer on a clean Windows VM → first launch creates `~/.imagine-studio/`, app boots, `imagine.exe doctor` works from a fresh shell.
- Total cold-start time on the user's host < 2s.

## 2. Open Items — Status (v1 shipped)

All resolved as defaults. Recorded here so future contributors see the decisions.

- **Aspect-ratio canonicalization** — *resolved*: snap unsupported ratios to the nearest supported size + toast the user. Implemented in M5 / M6.
- **Asset reference cap** — *resolved*: silent cap at each model's documented `capabilities.maxReferences`, with a UI hint above the asset slot when over budget. Logic lives in `core.capReferencePaths`, used by both `image.generate` and `video.submit`. Implemented in M6 / M7.
- **Remix lineage UI depth** — *resolved*: Gallery drawer renders parent + 3 siblings + 3 children. No "show more" yet; revisit only if a user hits the cap. Implemented in M5.
- **Telemetry** — *resolved*: off in v1. No Sentry, no anonymous error reports. Revisit only on explicit user request.
- **Sora / Veo integration** — *deferred past v1*: provider port + `VideoModelDef` schema accept either without schema changes. Add as a vendor folder + secret slot when the time comes.

## 3. Dev Loop & Verification Cheatsheet

```bash
# install
bun install

# typecheck everything
bun run typecheck

# tests
bun run --filter '@imagine-studio/*' test

# CLI dev (tsc -b && node dist/index.js — see architecture.md §11)
bun run --filter @imagine-studio/cli dev generate "a tiny otter"

# desktop dev (3 Vite watchers + Electron)
# First-time / after switching from CLI/persistence tests: rebuild native modules for Electron's ABI
bun run --filter @imagine-studio/desktop rebuild
bun run --filter @imagine-studio/desktop dev

# Switching back to CLI or persistence tests after running desktop:
# native modules need to be rebuilt for host Node ABI — see architecture.md §11.

# build everything
bun run build

# package the desktop installer
bun run --filter @imagine-studio/desktop package

# build the CLI single-file binary (Node SEA — see architecture.md §11)
bun run --filter @imagine-studio/cli build:binary
```

Per-milestone end-to-end checks (Windows 11, the user's host):

| Milestone | Command | Expected |
|---|---|---|
| M1 | `imagine doctor` | DB path printed, FTS=ok, providers=0/6 |
| M2 | `imagine generate "a tiny otter"` | PNG under `~/.imagine-studio/gallery/`, `gallery_items` row |
| M3 | `imagine video "rotating crystal" --provider volcengine --model seedance-1.0-pro --wait` | MP4 path printed |
| M4 | desktop dev → Providers page | Each test indicator green for valid keys |
| M5 | desktop → Studio → Generate | Result in Gallery within 1s; drag into Board persists |
| M6 | desktop → Assets → create Character → Studio → generate | `gallery_item_assets` row written |
| M7 | submit Seedance, close app, reopen | Polling resumes; final MP4 lands |
| M8 | install NSIS on clean VM | First run boots in <2s; FTS search works |

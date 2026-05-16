import { EventEmitter } from "node:events";
import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Logger } from "@imagent/core";
import type { UpdateCheckResult, UpdateStatusPayload } from "@imagent/ipc";
import { app, net, shell } from "electron";

/**
 * GitHub repo that publishes releases. Keep in sync with `package.json` and
 * the release workflow.
 */
const GITHUB_REPO = "unliftedq/imagent";
const RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface GithubReleaseResponse {
  tag_name: string;
  name?: string;
  html_url: string;
  body?: string;
  published_at?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets: GithubReleaseAsset[];
}

export interface Updater {
  check(): Promise<UpdateCheckResult>;
  download(): Promise<UpdateStatusPayload>;
  cancel(): UpdateStatusPayload;
  install(): Promise<void>;
  status(): UpdateStatusPayload;
  on(event: "progress", handler: (payload: UpdateStatusPayload) => void): () => void;
}

export interface UpdaterOptions {
  logger: Logger;
  /** Override for tests; defaults to `app.getVersion()`. */
  currentVersion?: string;
  /** Override platform/arch for tests. */
  platform?: NodeJS.Platform;
  arch?: string;
  /** Override the temp directory for downloaded installers. */
  tmpDir?: string;
}

/**
 * Strip a leading `v`/`V` from a tag (`v0.2.1` → `0.2.1`).
 */
function normalizeVersion(input: string): string {
  return input.replace(/^v/i, "").trim();
}

/**
 * Compare two semver-ish strings. Returns >0 if `a > b`, <0 if `a < b`, 0 if
 * equal. Tolerates pre-release suffixes (`-rc.1`) by treating them as smaller
 * than the release version of the same `X.Y.Z`.
 */
export function compareVersions(a: string, b: string): number {
  const [aBase, aPre = ""] = normalizeVersion(a).split("-", 2);
  const [bBase, bPre = ""] = normalizeVersion(b).split("-", 2);
  const aParts = (aBase ?? "0").split(".").map((p) => Number(p) || 0);
  const bParts = (bBase ?? "0").split(".").map((p) => Number(p) || 0);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // `1.0.0` > `1.0.0-rc.1` per semver.
  if (aPre === "" && bPre !== "") return 1;
  if (aPre !== "" && bPre === "") return -1;
  if (aPre < bPre) return -1;
  if (aPre > bPre) return 1;
  return 0;
}

/**
 * Pick the installer asset that matches the current platform/arch.
 *
 * Naming conventions match the electron-builder output (`electron-builder.yml`):
 *
 *   - darwin arm64 → `Imagent-<v>-arm64.dmg`
 *   - darwin x64   → `Imagent-<v>.dmg`  (older builds; fall back to arm64 if absent)
 *   - win32 x64    → `Imagent.Setup.<v>.exe`  (NSIS may emit `Imagent-Setup-<v>.exe`)
 *   - linux x64    → `Imagent-<v>.AppImage`
 */
export function pickAssetForPlatform(
  assets: GithubReleaseAsset[],
  platform: NodeJS.Platform,
  arch: string,
): GithubReleaseAsset | null {
  const named = (...patterns: RegExp[]): GithubReleaseAsset | null => {
    for (const pattern of patterns) {
      const match = assets.find((a) => pattern.test(a.name));
      if (match) return match;
    }
    return null;
  };
  if (platform === "darwin") {
    if (arch === "arm64") {
      return named(/\barm64\.dmg$/i, /\.dmg$/i) ?? null;
    }
    // x64 macOS: prefer a non-arm64 build, but fall back to whatever .dmg ships.
    return (
      assets.find((a) => /\.dmg$/i.test(a.name) && !/arm64/i.test(a.name)) ??
      named(/\.dmg$/i) ??
      null
    );
  }
  if (platform === "win32") {
    return named(/\.exe$/i);
  }
  if (platform === "linux") {
    return named(/\.AppImage$/i);
  }
  return null;
}

/**
 * Wait for a stream to emit `'finish'` (writable) or `'end'` (readable).
 * Rejects on `'error'`.
 */
function streamFinished(stream: NodeJS.ReadableStream | NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => resolve();
    stream.once("finish", done);
    stream.once("end", done);
    stream.once("error", reject);
  });
}

/**
 * Implementation of the auto-updater. Decoupled from Electron's `app` /
 * `net` only via constructor options so the version check + asset
 * resolution can be unit-tested without spinning up a BrowserWindow.
 */
export function createUpdater(opts: UpdaterOptions): Updater {
  const { logger } = opts;
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const tmpDir = opts.tmpDir ?? path.join(os.tmpdir(), "imagent-updates");
  const emitter = new EventEmitter();

  let state: UpdateStatusPayload = {
    state: "idle",
    bytes: 0,
    total: 0,
    version: null,
    message: null,
  };
  let lastCheck: UpdateCheckResult | null = null;
  let downloadedFile: string | null = null;
  let downloadAbort: AbortController | null = null;

  function setStatus(next: Partial<UpdateStatusPayload>): UpdateStatusPayload {
    state = { ...state, ...next };
    emitter.emit("progress", state);
    return state;
  }

  function currentVersion(): string {
    if (opts.currentVersion) return opts.currentVersion;
    try {
      return app.getVersion();
    } catch {
      // `app` is unavailable in unit tests.
      return "0.0.0";
    }
  }

  async function fetchLatestRelease(): Promise<GithubReleaseResponse> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": `imagent-desktop/${currentVersion()}`,
    };
    const response = await net.fetch(RELEASES_LATEST_URL, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as GithubReleaseResponse;
  }

  async function check(): Promise<UpdateCheckResult> {
    setStatus({ state: "checking", message: null });
    const current = currentVersion();
    try {
      const release = await fetchLatestRelease();
      const latest = normalizeVersion(release.tag_name);
      if (release.draft || release.prerelease) {
        // Ignore drafts/prereleases for the auto-update flow; the renderer
        // can still open the GitHub releases page manually.
        const result: UpdateCheckResult = {
          status: "uptodate",
          currentVersion: current,
          latestVersion: latest,
        };
        lastCheck = result;
        setStatus({ state: "idle", version: null });
        return result;
      }
      if (compareVersions(latest, current) <= 0) {
        const result: UpdateCheckResult = {
          status: "uptodate",
          currentVersion: current,
          latestVersion: latest,
        };
        lastCheck = result;
        setStatus({ state: "idle", version: null });
        return result;
      }
      const asset = pickAssetForPlatform(release.assets ?? [], platform, arch);
      const result: UpdateCheckResult = {
        status: "available",
        currentVersion: current,
        latestVersion: latest,
        releaseUrl: release.html_url,
        releaseNotes: release.body ?? null,
        publishedAt: release.published_at ?? null,
        asset: asset
          ? {
              name: asset.name,
              url: asset.browser_download_url,
              size: asset.size,
            }
          : null,
      };
      lastCheck = result;
      setStatus({
        state: "idle",
        version: latest,
        total: asset?.size ?? 0,
        bytes: 0,
        message: null,
      });
      logger.info("[updater] update available", {
        latest,
        current,
        asset: asset?.name ?? null,
      });
      return result;
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      logger.warn("[updater] check failed", { err: message });
      const result: UpdateCheckResult = {
        status: "error",
        currentVersion: current,
        message,
      };
      lastCheck = result;
      setStatus({ state: "error", message });
      return result;
    }
  }

  async function download(): Promise<UpdateStatusPayload> {
    if (state.state === "downloading") return state;
    if (!lastCheck || lastCheck.status !== "available" || !lastCheck.asset) {
      throw new Error("No update available to download. Run `updater.check` first.");
    }
    const asset = lastCheck.asset;
    const version = lastCheck.latestVersion;
    await fs.mkdir(tmpDir, { recursive: true });
    const destPath = path.join(tmpDir, `${version}-${asset.name}`);
    // If a prior download finished, surface the cached artifact immediately.
    try {
      const stat = await fs.stat(destPath);
      if (stat.size > 0 && stat.size === asset.size) {
        downloadedFile = destPath;
        return setStatus({
          state: "ready",
          bytes: stat.size,
          total: asset.size,
          version,
          message: null,
        });
      }
    } catch {
      // not cached; download fresh
    }

    downloadAbort = new AbortController();
    setStatus({
      state: "downloading",
      bytes: 0,
      total: asset.size,
      version,
      message: null,
    });

    try {
      const response = await net.fetch(asset.url, {
        signal: downloadAbort.signal,
        redirect: "follow",
        headers: {
          "User-Agent": `imagent-desktop/${currentVersion()}`,
        },
      });
      if (!response.ok || !response.body) {
        throw new Error(`download failed: ${response.status} ${response.statusText}`);
      }
      const totalHeader = response.headers.get("content-length");
      const total = totalHeader ? Number(totalHeader) : asset.size;
      setStatus({ total });

      const file = createWriteStream(destPath);
      const reader = response.body.getReader();
      let received = 0;
      let lastEmitted = 0;
      const emitEvery = Math.max(64 * 1024, Math.floor(total / 200));

      const writeChunk = (chunk: Uint8Array) =>
        new Promise<void>((resolve, reject) => {
          if (!file.write(chunk)) {
            file.once("drain", resolve);
          } else {
            resolve();
          }
          file.once("error", reject);
        });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            await writeChunk(value);
            received += value.byteLength;
            if (received - lastEmitted >= emitEvery || received === total) {
              lastEmitted = received;
              setStatus({ bytes: received });
            }
          }
        }
      } finally {
        file.end();
      }
      await streamFinished(file);

      // Sanity check: bail if we wrote significantly less than expected.
      const stat = await fs.stat(destPath);
      if (total > 0 && stat.size < total) {
        throw new Error(`download truncated: got ${stat.size} of ${total} bytes`);
      }
      downloadedFile = destPath;
      logger.info("[updater] download complete", { path: destPath, version });
      return setStatus({
        state: "ready",
        bytes: stat.size,
        total,
        version,
        message: null,
      });
    } catch (err) {
      if (downloadAbort?.signal.aborted) {
        // Cancellation already updated state — keep it.
        try {
          await fs.unlink(destPath);
        } catch {
          // ignore
        }
        return state;
      }
      const message = (err as Error)?.message ?? String(err);
      logger.error("[updater] download failed", { err: message });
      try {
        await fs.unlink(destPath);
      } catch {
        // ignore
      }
      return setStatus({ state: "error", message });
    } finally {
      downloadAbort = null;
    }
  }

  function cancel(): UpdateStatusPayload {
    if (downloadAbort) {
      downloadAbort.abort();
      logger.info("[updater] download cancelled");
      return setStatus({
        state: "idle",
        bytes: 0,
        message: null,
      });
    }
    return state;
  }

  async function install(): Promise<void> {
    if (state.state !== "ready" || !downloadedFile) {
      throw new Error("No update is ready to install. Run `updater.download` first.");
    }
    setStatus({ state: "installing", message: null });
    logger.info("[updater] launching installer", { path: downloadedFile });
    try {
      if (platform === "linux") {
        // AppImages must be executable before the user can run them.
        try {
          await fs.chmod(downloadedFile, 0o755);
        } catch (err) {
          logger.warn("[updater] chmod failed", { err: String(err) });
        }
      }
      const reason = await shell.openPath(downloadedFile);
      if (reason) {
        throw new Error(reason);
      }
      // Give the OS a beat to spawn the installer before we exit so the
      // packaged binary isn't holding files open when the replacement runs.
      setTimeout(() => {
        try {
          app.quit();
        } catch (err) {
          logger.warn("[updater] app.quit failed", { err: String(err) });
        }
      }, 800);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      logger.error("[updater] install failed", { err: message });
      setStatus({ state: "error", message });
      throw err;
    }
  }

  return {
    check,
    download,
    cancel,
    install,
    status: () => state,
    on(event, handler) {
      emitter.on(event, handler);
      return () => emitter.off(event, handler);
    },
  };
}

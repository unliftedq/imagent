import { z } from "zod";

/**
 * App update check / download / install (auto-updater).
 *
 * The updater reads the latest GitHub release for `unliftedq/imagent`,
 * compares its tag against `app.getVersion()`, and — when newer — downloads
 * the platform-appropriate installer (DMG / NSIS / AppImage) to a temp file
 * and launches it. Auto-update flow:
 *
 *   1. renderer calls `updater.check()` → `UpdateCheckResult`
 *   2. if `status === "available"`, renderer calls `updater.download()`
 *      and listens to `updater.progress` push events
 *   3. once `state === "ready"`, renderer calls `updater.install()` —
 *      the main process launches the installer and quits the app.
 *
 * `updater.cancel()` aborts an in-flight download. `updater.status()` returns
 * the most recently observed state so a freshly-rendered Settings page can
 * re-attach UI to a download already in progress.
 */
export const UpdateAssetSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.number().int().nonnegative(),
});
export type UpdateAsset = z.infer<typeof UpdateAssetSchema>;

export const UpdateCheckResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("uptodate"),
    currentVersion: z.string(),
    latestVersion: z.string().nullable(),
  }),
  z.object({
    status: z.literal("available"),
    currentVersion: z.string(),
    latestVersion: z.string(),
    releaseUrl: z.string(),
    releaseNotes: z.string().nullable(),
    publishedAt: z.string().nullable(),
    asset: UpdateAssetSchema.nullable(),
  }),
  z.object({
    status: z.literal("error"),
    currentVersion: z.string(),
    latestVersion: z.string().nullable().optional(),
    message: z.string(),
  }),
]);
export type UpdateCheckResult = z.infer<typeof UpdateCheckResultSchema>;

export const UpdateProgressStateSchema = z.enum([
  "idle",
  "checking",
  "downloading",
  "ready",
  "installing",
  "error",
]);
export type UpdateProgressState = z.infer<typeof UpdateProgressStateSchema>;

export const UpdateStatusPayloadSchema = z.object({
  state: UpdateProgressStateSchema,
  /** Bytes downloaded; 0 outside of `downloading`/`ready`. */
  bytes: z.number().int().nonnegative(),
  /** Total bytes from Content-Length; 0 if unknown. */
  total: z.number().int().nonnegative(),
  /** Version tag this state pertains to (e.g. `0.3.0`); null when idle. */
  version: z.string().nullable(),
  /** Last error message; populated when `state === "error"`. */
  message: z.string().nullable(),
});
export type UpdateStatusPayload = z.infer<typeof UpdateStatusPayloadSchema>;

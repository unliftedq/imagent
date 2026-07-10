import { api } from "../../lib/api.js";
import type { StudioReferenceRoles } from "../../state/useUIStore.js";

export function autosizeComposer(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(220, Math.max(104, el.scrollHeight))}px`;
}

export function nearestNumber(allowed: readonly number[], target: number): number {
  if (allowed.length === 0) return target;
  const first = allowed[0];
  if (first === undefined) return target;
  let best = first;
  let bestDiff = Math.abs(first - target);
  for (const value of allowed) {
    const diff = Math.abs(value - target);
    if (diff < bestDiff) {
      best = value;
      bestDiff = diff;
    }
  }
  return best;
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function resolveGalleryUrl(relPath: string): string {
  const norm = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = norm.split("/").map(encodeURIComponent).join("/");
  return `imagent://local/${segments}`;
}

export function resolveReferenceUrl(referencePath: string): string {
  if (/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(referencePath)) {
    return `imagent://external/${encodeURIComponent(referencePath)}`;
  }
  return resolveGalleryUrl(referencePath);
}

let dataDirPromise: Promise<string> | null = null;
function getDataDir(): Promise<string> {
  if (!dataDirPromise) {
    dataDirPromise = api["app.storagePaths"]().then((p) => p.dataDir);
  }
  return dataDirPromise;
}

/**
 * Resolve a gallery item's `relPath` (e.g. `gallery/2026/04/foo.png`) to an
 * absolute filesystem path under the user's data dir. Used when feeding a
 * gallery image into provider request fields (firstFrame/lastFrame) so the
 * main process can `fs.stat` it.
 */
export async function resolveGalleryAbsolutePath(relPath: string): Promise<string> {
  const dataDir = await getDataDir();
  const usesBackslash = dataDir.includes("\\") && !/^[a-zA-Z]+:\//.test(dataDir);
  const sep = usesBackslash ? "\\" : "/";
  const trimmed = dataDir.endsWith("/") || dataDir.endsWith("\\") ? dataDir.slice(0, -1) : dataDir;
  const normalizedRel = usesBackslash ? relPath.replace(/\//g, "\\") : relPath.replace(/\\/g, "/");
  const cleanedRel = normalizedRel.replace(/^[/\\]+/, "");
  return `${trimmed}${sep}${cleanedRel}`;
}

export function pruneReferenceRoles(
  roles: StudioReferenceRoles,
  references: string[],
): StudioReferenceRoles {
  const next: StudioReferenceRoles = {};
  for (const reference of references) {
    if (roles[reference] !== undefined) next[reference] = roles[reference];
  }
  return next;
}

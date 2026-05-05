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

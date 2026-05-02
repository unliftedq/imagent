import type { Asset } from "@imagine/core";

export function resolveDataUrl(relPath: string): string {
  const norm = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = norm.split("/").map(encodeURIComponent).join("/");
  return `imagine://local/${segments}`;
}

export function resolveAssetThumbnailUrl(asset: Asset): string | null {
  const thumb = asset.files.find((f) => f.role === "thumbnail");
  const ref = asset.files.find((f) => f.role === "reference");
  const target = thumb ?? ref;
  return target ? resolveDataUrl(target.relPath) : null;
}

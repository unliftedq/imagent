import type { Asset, AssetFile } from "@imagine-studio/core";
import type { DatabaseType } from "../db.js";

/**
 * AssetRepository surface — full CRUD and reference-file linking. M1 carries
 * type-correct method signatures with minimal implementations; richer queries
 * (search, FTS join, archive filters) layer on in M3 / M6.
 */
export class AssetRepository {
  constructor(private readonly db: DatabaseType) {}

  list(_opts: { kind?: Asset["kind"]; includeArchived?: boolean } = {}): Asset[] {
    return [];
  }

  get(_id: string): Asset | null {
    return null;
  }

  create(_asset: Asset): Asset {
    throw new Error("not implemented (M3)");
  }

  update(_id: string, _patch: Partial<Asset>): Asset {
    throw new Error("not implemented (M3)");
  }

  archive(_id: string): void {
    throw new Error("not implemented (M3)");
  }

  delete(_id: string): void {
    throw new Error("not implemented (M3)");
  }

  // Asset files are owned by the asset; we expose them through the repo so
  // FK-cascade semantics live in one place.
  listFiles(_assetId: string): AssetFile[] {
    return [];
  }

  addFile(_file: AssetFile): AssetFile {
    throw new Error("not implemented (M3)");
  }

  removeFile(_fileId: string): void {
    throw new Error("not implemented (M3)");
  }
}

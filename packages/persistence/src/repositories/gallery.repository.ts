import type { GalleryItem, GalleryItemAssetLink, GalleryQuery } from "@imagine-studio/core";
import type { DatabaseType } from "../db.js";

export class GalleryRepository {
  constructor(private readonly db: DatabaseType) {}

  query(_query: GalleryQuery): { items: GalleryItem[]; total: number } {
    return { items: [], total: 0 };
  }

  get(_id: string): GalleryItem | null {
    return null;
  }

  create(_item: GalleryItem): GalleryItem {
    throw new Error("not implemented (M2)");
  }

  toggleFavorite(_id: string, _favorited: boolean): void {
    throw new Error("not implemented (M3)");
  }

  delete(_id: string): void {
    throw new Error("not implemented (M3)");
  }

  // Asset links — written when an image is generated against an asset slot.
  listAssetLinks(_itemId: string): GalleryItemAssetLink[] {
    return [];
  }

  addAssetLink(_link: GalleryItemAssetLink): void {
    throw new Error("not implemented (M3)");
  }

  // Lineage helper for the Remix flow (M5).
  listChildren(_parentId: string): GalleryItem[] {
    return [];
  }
}

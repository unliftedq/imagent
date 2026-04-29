import type { GalleryItem, GalleryItemAssetLink, GalleryQuery } from "@imagine-studio/core";
import type { DatabaseType } from "../db.js";

interface GalleryRow {
  id: string;
  kind: string;
  parent_id: string | null;
  prompt: string;
  negative_prompt: string | null;
  provider_id: string;
  model: string;
  params_json: string;
  rel_path: string;
  thumb_path: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  bytes: number;
  job_id: string | null;
  favorited: number;
  created_at: number;
}

function rowToItem(r: GalleryRow): GalleryItem {
  return {
    id: r.id,
    kind: r.kind as GalleryItem["kind"],
    parentId: r.parent_id,
    prompt: r.prompt,
    negativePrompt: r.negative_prompt,
    providerId: r.provider_id,
    model: r.model,
    paramsJson: r.params_json,
    relPath: r.rel_path,
    thumbPath: r.thumb_path,
    durationMs: r.duration_ms,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    jobId: r.job_id,
    favorited: r.favorited === 1,
    createdAt: r.created_at,
  };
}

export class GalleryRepository {
  constructor(private readonly db: DatabaseType) {}

  query(
    query: GalleryQuery & { providerId?: string },
  ): { items: GalleryItem[]; total: number } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.kind) {
      where.push("g.kind = ?");
      params.push(query.kind);
    }
    if (query.parentId) {
      where.push("g.parent_id = ?");
      params.push(query.parentId);
    }
    if (query.favoritedOnly) {
      where.push("g.favorited = 1");
    }
    if (query.providerId) {
      where.push("g.provider_id = ?");
      params.push(query.providerId);
    }
    let join = "";
    if (query.boardId) {
      join += " JOIN board_items bi ON bi.item_id = g.id";
      where.push("bi.board_id = ?");
      params.push(query.boardId);
    }
    if (query.search && query.search.trim().length > 0) {
      join += " JOIN gallery_items_fts f ON g.rowid = f.rowid";
      where.push("f.gallery_items_fts MATCH ?");
      params.push(query.search);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM gallery_items g${join} ${whereSql}`)
      .get(...params) as { n: number };
    const rows = this.db
      .prepare(
        `SELECT g.* FROM gallery_items g${join} ${whereSql} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit, query.offset) as GalleryRow[];
    return { items: rows.map(rowToItem), total: totalRow.n };
  }

  get(id: string): GalleryItem | null {
    const row = this.db
      .prepare("SELECT * FROM gallery_items WHERE id = ?")
      .get(id) as GalleryRow | undefined;
    return row ? rowToItem(row) : null;
  }

  create(item: GalleryItem): GalleryItem {
    this.db
      .prepare(
        `INSERT INTO gallery_items
            (id, kind, parent_id, prompt, negative_prompt, provider_id, model,
             params_json, rel_path, thumb_path, duration_ms, width, height, bytes,
             job_id, favorited, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.kind,
        item.parentId ?? null,
        item.prompt,
        item.negativePrompt ?? null,
        item.providerId,
        item.model,
        item.paramsJson,
        item.relPath,
        item.thumbPath ?? null,
        item.durationMs ?? null,
        item.width ?? null,
        item.height ?? null,
        item.bytes,
        item.jobId ?? null,
        item.favorited ? 1 : 0,
        item.createdAt,
      );
    const row = this.db.prepare("SELECT * FROM gallery_items WHERE id = ?").get(item.id) as GalleryRow;
    return rowToItem(row);
  }

  toggleFavorite(id: string, favorited: boolean): void {
    this.db.prepare("UPDATE gallery_items SET favorited = ? WHERE id = ?").run(favorited ? 1 : 0, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM gallery_items WHERE id = ?").run(id);
  }

  listAssetLinks(itemId: string): GalleryItemAssetLink[] {
    const rows = this.db
      .prepare("SELECT item_id, asset_id, role FROM gallery_item_assets WHERE item_id = ?")
      .all(itemId) as { item_id: string; asset_id: string; role: string }[];
    return rows.map((r) => ({ itemId: r.item_id, assetId: r.asset_id, role: r.role }));
  }

  addAssetLink(link: GalleryItemAssetLink): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO gallery_item_assets (item_id, asset_id, role) VALUES (?, ?, ?)",
      )
      .run(link.itemId, link.assetId, link.role);
  }

  listChildren(parentId: string): GalleryItem[] {
    const rows = this.db
      .prepare("SELECT * FROM gallery_items WHERE parent_id = ? ORDER BY created_at DESC")
      .all(parentId) as GalleryRow[];
    return rows.map(rowToItem);
  }
}

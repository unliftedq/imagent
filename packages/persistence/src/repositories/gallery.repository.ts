import type { GalleryItem, GalleryItemAssetLink, GalleryQuery } from "@imagent/core";
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

/**
 * Wrap a raw user search string into an FTS5-safe phrase query. FTS5
 * MATCH inputs are parsed; punctuation (`.`, `-`, `/`, `:`, etc.) and
 * unbalanced quotes throw `unrecognized token` / `syntax error`. We use
 * the simplest robust strategy: split into whitespace tokens, escape
 * any embedded `"` characters, double-quote each token, and AND them.
 */
function ftsPhrase(raw: string): string {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '""';
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

function likePattern(raw: string): string {
  return `%${raw.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
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
      const raw = query.search.trim();
      // Prompt + negative_prompt go through FTS5 for tokenized matching.
      // LIKE fallbacks keep substring, path, and CJK searches intuitive —
      // FTS5's default tokenizer won't reliably match a Chinese character
      // like `猫` inside a longer prompt.
      // Wrap the FTS query as a quoted phrase so user input containing
      // punctuation (`.`, `-`, `/`) doesn't blow up FTS5's tokenizer.
      const ftsQuery = ftsPhrase(raw);
      const likeQuery = likePattern(raw);
      where.push(
        `(
          g.id IN (
            SELECT g2.id
            FROM gallery_items g2
            JOIN gallery_items_fts f2 ON g2.rowid = f2.rowid
            WHERE f2.gallery_items_fts MATCH ?
          )
          OR g.prompt LIKE ? ESCAPE '\\'
          OR COALESCE(g.negative_prompt, '') LIKE ? ESCAPE '\\'
          OR g.rel_path LIKE ? ESCAPE '\\'
          OR COALESCE(g.thumb_path, '') LIKE ? ESCAPE '\\'
          OR g.provider_id LIKE ? ESCAPE '\\'
          OR g.model LIKE ? ESCAPE '\\'
        )`,
      );
      params.push(ftsQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
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

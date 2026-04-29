import type { Asset, AssetFile, AssetKind } from "@imagine/core";
import type { DatabaseType } from "../db.js";

interface AssetRow {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  prompt_snippet: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}

interface AssetFileRow {
  id: string;
  asset_id: string;
  role: string;
  rel_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  bytes: number;
  sha256: string;
  position: number;
  created_at: number;
}

function rowToAsset(r: AssetRow, files: AssetFile[] = []): Asset {
  return {
    id: r.id,
    kind: r.kind as AssetKind,
    name: r.name,
    description: r.description,
    promptSnippet: r.prompt_snippet,
    files,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

function rowToFile(r: AssetFileRow): AssetFile {
  return {
    id: r.id,
    assetId: r.asset_id,
    role: r.role as AssetFile["role"],
    relPath: r.rel_path,
    mimeType: r.mime_type,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    sha256: r.sha256,
    position: r.position,
    createdAt: r.created_at,
  };
}

export interface AssetListOptions {
  kind?: AssetKind;
  /**
   * Default: false. When false (default), `archived_at IS NULL` is enforced —
   * archived assets are hidden from list queries. When true, archived assets
   * are included alongside live ones. Mutually exclusive with `archivedOnly`.
   */
  includeArchived?: boolean;
  /**
   * When true, return ONLY archived rows (`archived_at IS NOT NULL`). Used by
   * the Trash tab in the Assets page (M8). Takes precedence over
   * `includeArchived`.
   */
  archivedOnly?: boolean;
  /** FTS5 MATCH expression. When provided, joins assets_fts. */
  search?: string;
  limit?: number;
  /** Pagination offset; combine with `limit`. */
  offset?: number;
}

export interface AssetListPage {
  items: Asset[];
  total: number;
}

/**
 * AssetRepository — CRUD for `assets` + child `asset_files`. Asset files are
 * owned by their parent asset; FK cascades clean them up on delete.
 */
export class AssetRepository {
  constructor(private readonly db: DatabaseType) {}

  list(opts: AssetListOptions = {}): Asset[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.kind) {
      where.push("a.kind = ?");
      params.push(opts.kind);
    }
    if (opts.archivedOnly) {
      where.push("a.archived_at IS NOT NULL");
    } else if (!opts.includeArchived) {
      where.push("a.archived_at IS NULL");
    }

    let sql: string;
    if (opts.search && opts.search.trim().length > 0) {
      // FTS5 MATCH against assets_fts; rowid links back to base table.
      sql =
        "SELECT a.* FROM assets a JOIN assets_fts f ON a.rowid = f.rowid " +
        `WHERE f.assets_fts MATCH ?${where.length ? ` AND ${where.join(" AND ")}` : ""} ` +
        "ORDER BY a.updated_at DESC";
      params.unshift(opts.search);
    } else {
      sql = `SELECT a.* FROM assets a ${
        where.length ? `WHERE ${where.join(" AND ")}` : ""
      } ORDER BY a.updated_at DESC`;
    }
    if (opts.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(opts.limit);
      if (opts.offset !== undefined) {
        sql += " OFFSET ?";
        params.push(opts.offset);
      }
    }
    const rows = this.db.prepare(sql).all(...params) as AssetRow[];
    return rows.map((r) => rowToAsset(r, this.listFiles(r.id)));
  }

  /**
   * Same shape as `list` but returns paginated rows joined with their files
   * AND the total count for the same WHERE clause. Used by the IPC
   * `assets.list` handler so the renderer can show "page 1 of N".
   */
  listWithFiles(opts: AssetListOptions = {}): AssetListPage {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.kind) {
      where.push("a.kind = ?");
      params.push(opts.kind);
    }
    if (opts.archivedOnly) {
      where.push("a.archived_at IS NOT NULL");
    } else if (!opts.includeArchived) {
      where.push("a.archived_at IS NULL");
    }

    let baseSql: string;
    let countSql: string;
    if (opts.search && opts.search.trim().length > 0) {
      baseSql =
        "SELECT a.* FROM assets a JOIN assets_fts f ON a.rowid = f.rowid " +
        `WHERE f.assets_fts MATCH ?${where.length ? ` AND ${where.join(" AND ")}` : ""} ` +
        "ORDER BY a.updated_at DESC";
      countSql =
        "SELECT COUNT(*) AS n FROM assets a JOIN assets_fts f ON a.rowid = f.rowid " +
        `WHERE f.assets_fts MATCH ?${where.length ? ` AND ${where.join(" AND ")}` : ""}`;
      params.unshift(opts.search);
    } else {
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      baseSql = `SELECT a.* FROM assets a ${whereSql} ORDER BY a.updated_at DESC`;
      countSql = `SELECT COUNT(*) AS n FROM assets a ${whereSql}`;
    }

    const totalRow = this.db.prepare(countSql).get(...params) as { n: number };
    let sql = baseSql;
    const allParams = [...params];
    if (opts.limit !== undefined) {
      sql += " LIMIT ?";
      allParams.push(opts.limit);
      if (opts.offset !== undefined) {
        sql += " OFFSET ?";
        allParams.push(opts.offset);
      }
    }
    const rows = this.db.prepare(sql).all(...allParams) as AssetRow[];
    const items = rows.map((r) => rowToAsset(r, this.listFiles(r.id)));
    return { items, total: totalRow.n };
  }

  /**
   * Count of `gallery_item_assets` rows referencing this asset. Surfaced as
   * "X used in N items" on the Assets page card. Cheap subquery.
   */
  usageCount(assetId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM gallery_item_assets WHERE asset_id = ?",
      )
      .get(assetId) as { n: number };
    return row.n;
  }

  get(id: string): Asset | null {
    const row = this.db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as
      | AssetRow
      | undefined;
    if (!row) return null;
    return rowToAsset(row, this.listFiles(id));
  }

  create(asset: Asset): Asset {
    this.db
      .prepare(
        `INSERT INTO assets (id, kind, name, description, prompt_snippet,
            created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        asset.id,
        asset.kind,
        asset.name,
        asset.description ?? null,
        asset.promptSnippet ?? null,
        asset.createdAt,
        asset.updatedAt,
        asset.archivedAt ?? null,
      );
    return this.get(asset.id) ?? asset;
  }

  update(id: string, patch: Partial<Asset>): Asset {
    const existing = this.get(id);
    if (!existing) throw new Error(`asset ${id} not found`);
    const next: Asset = {
      ...existing,
      ...patch,
      id: existing.id, // never mutate primary key
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE assets SET kind = ?, name = ?, description = ?, prompt_snippet = ?,
            updated_at = ?, archived_at = ? WHERE id = ?`,
      )
      .run(
        next.kind,
        next.name,
        next.description ?? null,
        next.promptSnippet ?? null,
        next.updatedAt,
        next.archivedAt ?? null,
        id,
      );
    return this.get(id) ?? next;
  }

  /**
   * Soft-delete: stamp `archived_at` so the asset disappears from default
   * lists and from any AssetPicker. Reversible via `restore`. Files on disk
   * remain intact (no fs cleanup) — `permanentlyDelete` removes them.
   */
  archive(id: string): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE assets SET archived_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }

  /**
   * Reverse of `archive`: clear the `archived_at` stamp. Idempotent — calling
   * on a live asset is a no-op.
   */
  restore(id: string): void {
    this.db
      .prepare("UPDATE assets SET archived_at = NULL, updated_at = ? WHERE id = ?")
      .run(Date.now(), id);
  }

  /**
   * Hard delete — `assets` row + cascade `asset_files`. Filesystem cleanup is
   * the caller's responsibility (see `assets.delete` IPC handler).
   *
   * `permanentlyDelete` is the preferred name from M8 onward; `delete` stays
   * as an alias so older callers keep working.
   */
  permanentlyDelete(id: string): void {
    this.db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  }

  /** @deprecated Use `permanentlyDelete` for clarity. Same behavior. */
  delete(id: string): void {
    this.permanentlyDelete(id);
  }

  listFiles(assetId: string): AssetFile[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM asset_files WHERE asset_id = ? ORDER BY role, position, created_at",
      )
      .all(assetId) as AssetFileRow[];
    return rows.map(rowToFile);
  }

  addFile(file: AssetFile): AssetFile {
    this.db
      .prepare(
        `INSERT INTO asset_files (id, asset_id, role, rel_path, mime_type,
            width, height, bytes, sha256, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        file.id,
        file.assetId,
        file.role,
        file.relPath,
        file.mimeType,
        file.width ?? null,
        file.height ?? null,
        file.bytes,
        file.sha256,
        file.position,
        file.createdAt,
      );
    return file;
  }

  removeFile(fileId: string): void {
    this.db.prepare("DELETE FROM asset_files WHERE id = ?").run(fileId);
  }

  /**
   * Look up existing asset files by SHA-256. Used by `asset add` to surface
   * a dedup hint to the user (we still proceed because assets are
   * independently named).
   */
  findFilesBySha256(sha256: string): AssetFile[] {
    const rows = this.db
      .prepare("SELECT * FROM asset_files WHERE sha256 = ?")
      .all(sha256) as AssetFileRow[];
    return rows.map(rowToFile);
  }
}

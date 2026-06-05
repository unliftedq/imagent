-- 004_audio.sql — widen jobs/gallery_items kind CHECK to include 'audio'.
--
-- SQLite cannot ALTER a CHECK constraint. Recreating these tables would break
-- the gallery_items_fts content mapping (rowid-keyed) and the foreign keys
-- that reference gallery_items. Instead we relax the constraint by patching
-- the stored CREATE TABLE text via writable_schema — this preserves rowids,
-- FTS, and FKs. The patched substring is identical on both tables. Widening a
-- CHECK can never invalidate existing rows, so this is safe. RESET reloads the
-- schema on this connection so the new constraint takes effect immediately.
PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(
  sql,
  'kind IN (''image'',''video'')',
  'kind IN (''image'',''video'',''audio'')'
)
WHERE type = 'table' AND name IN ('jobs', 'gallery_items');

PRAGMA writable_schema = RESET;

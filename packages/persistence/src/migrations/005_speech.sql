-- 005_speech.sql — migrate jobs/gallery_items kind from 'audio' to 'speech'.
--
-- SQLite cannot ALTER a CHECK constraint in place. Follow the same
-- writable_schema strategy as 004_audio.sql, but do it in two phases:
--   1) widen the CHECK to allow both 'audio' and 'speech'
--   2) migrate existing rows
--   3) tighten the CHECK so only 'speech' remains
--
-- This preserves rowids, FTS linkage, and foreign keys that point at
-- gallery_items.
PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(
  sql,
  'kind IN (''image'',''video'',''audio'')',
  'kind IN (''image'',''video'',''audio'',''speech'')'
)
WHERE type = 'table' AND name IN ('jobs', 'gallery_items');

PRAGMA writable_schema = RESET;

UPDATE jobs
SET kind = 'speech'
WHERE kind = 'audio';

UPDATE gallery_items
SET kind = 'speech'
WHERE kind = 'audio';

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(
  sql,
  'kind IN (''image'',''video'',''audio'',''speech'')',
  'kind IN (''image'',''video'',''speech'')'
)
WHERE type = 'table' AND name IN ('jobs', 'gallery_items');

PRAGMA writable_schema = RESET;

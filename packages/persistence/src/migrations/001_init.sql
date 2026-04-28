-- 001_init.sql — base schema (architecture.md §5).

CREATE TABLE assets (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('character','object','background','style')),
  name            TEXT NOT NULL,
  description     TEXT,
  prompt_snippet  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  archived_at     INTEGER
);
CREATE INDEX idx_assets_kind ON assets(kind, archived_at);

CREATE TABLE asset_files (
  id            TEXT PRIMARY KEY,
  asset_id      TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('reference','thumbnail')),
  rel_path      TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  width         INTEGER, height INTEGER,
  bytes         INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_asset_files_asset ON asset_files(asset_id, role, position);
CREATE INDEX idx_asset_files_sha   ON asset_files(sha256);

CREATE TABLE boards (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  cover_item_id  TEXT,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('image','video')),
  state           TEXT NOT NULL CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
  provider_id     TEXT NOT NULL,
  provider_job_id TEXT,
  request_json    TEXT NOT NULL,
  progress        REAL,
  error_message   TEXT,
  result_item_id  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  finished_at     INTEGER
);
CREATE INDEX idx_jobs_state ON jobs(state, kind, created_at);

CREATE TABLE gallery_items (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('image','video')),
  parent_id        TEXT REFERENCES gallery_items(id) ON DELETE SET NULL,
  prompt           TEXT NOT NULL,
  negative_prompt  TEXT,
  provider_id      TEXT NOT NULL,
  model            TEXT NOT NULL,
  params_json      TEXT NOT NULL,
  rel_path         TEXT NOT NULL,
  thumb_path       TEXT,
  duration_ms      INTEGER,
  width            INTEGER, height INTEGER,
  bytes            INTEGER NOT NULL,
  job_id           TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  favorited        INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_gallery_kind_created ON gallery_items(kind, created_at DESC);
CREATE INDEX idx_gallery_parent       ON gallery_items(parent_id);

CREATE TABLE board_items (
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (board_id, item_id)
);

CREATE TABLE gallery_item_assets (
  item_id    TEXT NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  asset_id   TEXT NOT NULL REFERENCES assets(id)        ON DELETE CASCADE,
  role       TEXT NOT NULL,
  PRIMARY KEY (item_id, asset_id)
);
CREATE INDEX idx_item_assets_asset ON gallery_item_assets(asset_id);

CREATE TABLE kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

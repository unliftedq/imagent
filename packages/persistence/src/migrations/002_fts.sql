-- 002_fts.sql — FTS5 virtual tables + sync triggers (architecture.md §5).

CREATE VIRTUAL TABLE gallery_items_fts USING fts5(
  prompt, negative_prompt,
  content='gallery_items', content_rowid='rowid', tokenize='porter unicode61'
);

CREATE TRIGGER gallery_items_ai AFTER INSERT ON gallery_items BEGIN
  INSERT INTO gallery_items_fts(rowid, prompt, negative_prompt)
  VALUES (new.rowid, new.prompt, new.negative_prompt);
END;

CREATE TRIGGER gallery_items_ad AFTER DELETE ON gallery_items BEGIN
  INSERT INTO gallery_items_fts(gallery_items_fts, rowid, prompt, negative_prompt)
  VALUES ('delete', old.rowid, old.prompt, old.negative_prompt);
END;

CREATE TRIGGER gallery_items_au AFTER UPDATE ON gallery_items BEGIN
  INSERT INTO gallery_items_fts(gallery_items_fts, rowid, prompt, negative_prompt)
  VALUES ('delete', old.rowid, old.prompt, old.negative_prompt);
  INSERT INTO gallery_items_fts(rowid, prompt, negative_prompt)
  VALUES (new.rowid, new.prompt, new.negative_prompt);
END;

CREATE VIRTUAL TABLE assets_fts USING fts5(
  name, description, prompt_snippet,
  content='assets', content_rowid='rowid', tokenize='porter unicode61'
);

CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(rowid, name, description, prompt_snippet)
  VALUES (new.rowid, new.name, new.description, new.prompt_snippet);
END;

CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, description, prompt_snippet)
  VALUES ('delete', old.rowid, old.name, old.description, old.prompt_snippet);
END;

CREATE TRIGGER assets_au AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, description, prompt_snippet)
  VALUES ('delete', old.rowid, old.name, old.description, old.prompt_snippet);
  INSERT INTO assets_fts(rowid, name, description, prompt_snippet)
  VALUES (new.rowid, new.name, new.description, new.prompt_snippet);
END;

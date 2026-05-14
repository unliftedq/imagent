-- 003_jieba_fts.sql — rebuild FTS5 indexes with nodejieba-tokenized text.

DROP TRIGGER IF EXISTS gallery_items_ai;
DROP TRIGGER IF EXISTS gallery_items_ad;
DROP TRIGGER IF EXISTS gallery_items_au;
DROP TRIGGER IF EXISTS assets_ai;
DROP TRIGGER IF EXISTS assets_ad;
DROP TRIGGER IF EXISTS assets_au;

DROP TABLE IF EXISTS gallery_items_fts;
DROP TABLE IF EXISTS assets_fts;

CREATE VIRTUAL TABLE gallery_items_fts USING fts5(
  prompt, negative_prompt,
  content='gallery_items', content_rowid='rowid', tokenize='porter unicode61'
);

INSERT INTO gallery_items_fts(rowid, prompt, negative_prompt)
SELECT rowid, imagent_jieba(prompt), imagent_jieba(negative_prompt)
FROM gallery_items;

CREATE TRIGGER gallery_items_ai AFTER INSERT ON gallery_items BEGIN
  INSERT INTO gallery_items_fts(rowid, prompt, negative_prompt)
  VALUES (new.rowid, imagent_jieba(new.prompt), imagent_jieba(new.negative_prompt));
END;

CREATE TRIGGER gallery_items_ad AFTER DELETE ON gallery_items BEGIN
  INSERT INTO gallery_items_fts(gallery_items_fts, rowid, prompt, negative_prompt)
  VALUES ('delete', old.rowid, imagent_jieba(old.prompt), imagent_jieba(old.negative_prompt));
END;

CREATE TRIGGER gallery_items_au AFTER UPDATE ON gallery_items BEGIN
  INSERT INTO gallery_items_fts(gallery_items_fts, rowid, prompt, negative_prompt)
  VALUES ('delete', old.rowid, imagent_jieba(old.prompt), imagent_jieba(old.negative_prompt));
  INSERT INTO gallery_items_fts(rowid, prompt, negative_prompt)
  VALUES (new.rowid, imagent_jieba(new.prompt), imagent_jieba(new.negative_prompt));
END;

CREATE VIRTUAL TABLE assets_fts USING fts5(
  name, description, prompt_snippet,
  content='assets', content_rowid='rowid', tokenize='porter unicode61'
);

INSERT INTO assets_fts(rowid, name, description, prompt_snippet)
SELECT rowid, imagent_jieba(name), imagent_jieba(description), imagent_jieba(prompt_snippet)
FROM assets;

CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(rowid, name, description, prompt_snippet)
  VALUES (new.rowid, imagent_jieba(new.name), imagent_jieba(new.description), imagent_jieba(new.prompt_snippet));
END;

CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, description, prompt_snippet)
  VALUES ('delete', old.rowid, imagent_jieba(old.name), imagent_jieba(old.description), imagent_jieba(old.prompt_snippet));
END;

CREATE TRIGGER assets_au AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, description, prompt_snippet)
  VALUES ('delete', old.rowid, imagent_jieba(old.name), imagent_jieba(old.description), imagent_jieba(old.prompt_snippet));
  INSERT INTO assets_fts(rowid, name, description, prompt_snippet)
  VALUES (new.rowid, imagent_jieba(new.name), imagent_jieba(new.description), imagent_jieba(new.prompt_snippet));
END;

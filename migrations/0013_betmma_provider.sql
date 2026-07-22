PRAGMA foreign_keys = ON;

CREATE TABLE card_source_links_v2 (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('ufc', 'tapology', 'betmma')),
  url TEXT NOT NULL,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (card_id, provider)
);

INSERT INTO card_source_links_v2 (
  id, card_id, provider, url, last_checked_at, created_at, updated_at
)
SELECT id, card_id, provider, url, last_checked_at, created_at, updated_at
FROM card_source_links;

DROP TABLE card_source_links;

ALTER TABLE card_source_links_v2 RENAME TO card_source_links;

CREATE INDEX card_source_links_card_idx
  ON card_source_links (card_id, provider);

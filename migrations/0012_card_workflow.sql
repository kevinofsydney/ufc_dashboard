PRAGMA foreign_keys = ON;

CREATE TABLE card_source_links (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('ufc', 'tapology')),
  url TEXT NOT NULL,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (card_id, provider)
);

CREATE INDEX card_source_links_card_idx
  ON card_source_links (card_id, provider);

ALTER TABLE market_prices ADD COLUMN source_provider TEXT;
ALTER TABLE market_prices ADD COLUMN source_url TEXT;

ALTER TABLE fight_outcomes ADD COLUMN source_provider TEXT;
ALTER TABLE fight_outcomes ADD COLUMN source_url TEXT;
ALTER TABLE fight_outcomes ADD COLUMN fetched_at TEXT;

ALTER TABLE bets ADD COLUMN fight_id TEXT REFERENCES fights(id) ON DELETE RESTRICT;
ALTER TABLE bets ADD COLUMN selection_fighter_id TEXT REFERENCES fighters(id) ON DELETE RESTRICT;
ALTER TABLE bets ADD COLUMN method TEXT;
ALTER TABLE bets ADD COLUMN round TEXT;
ALTER TABLE bets ADD COLUMN line_value TEXT;


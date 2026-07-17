ALTER TABLE market_prices ADD COLUMN deleted_at TEXT;

CREATE INDEX market_prices_active_card_idx
  ON market_prices (card_id, deleted_at, captured_at DESC);


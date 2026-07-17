ALTER TABLE cards ADD COLUMN deleted_at TEXT;

CREATE INDEX cards_deleted_at_idx ON cards (deleted_at);

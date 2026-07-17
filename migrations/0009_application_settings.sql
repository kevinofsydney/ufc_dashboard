CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_bankroll_cents INTEGER NOT NULL DEFAULT 0 CHECK (current_bankroll_cents >= 0),
  default_unit_value_cents INTEGER NOT NULL DEFAULT 1000 CHECK (default_unit_value_cents > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO app_settings (
  id, current_bankroll_cents, default_unit_value_cents, created_at, updated_at
) VALUES (1, 0, 1000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

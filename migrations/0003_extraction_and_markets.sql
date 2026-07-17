PRAGMA foreign_keys = ON;

CREATE TABLE extraction_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'running', 'needs_review', 'accepted', 'failed')
  ),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  raw_response TEXT,
  validation_errors TEXT,
  token_usage_json TEXT,
  estimated_cost_micros INTEGER,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX extraction_runs_source_idx
  ON extraction_runs (source_id, created_at DESC);

CREATE INDEX extraction_runs_fingerprint_idx
  ON extraction_runs (source_hash, prompt_version, model);

CREATE TABLE fight_opinions (
  id TEXT PRIMARY KEY,
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  fight_id TEXT NOT NULL REFERENCES fights(id) ON DELETE RESTRICT,
  capper_id TEXT NOT NULL REFERENCES cappers(id) ON DELETE RESTRICT,
  picked_fighter_id TEXT NOT NULL REFERENCES fighters(id) ON DELETE RESTRICT,
  method TEXT CHECK (method IS NULL OR method IN ('ko_tko', 'submission', 'decision')),
  round TEXT CHECK (round IS NULL OR round IN ('1', '2', '3', '4', '5', 'distance')),
  confidence TEXT NOT NULL CHECK (confidence IN ('lean', 'solid', 'lock')),
  reasoning_summary TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK (provenance IN ('direct', 'aggregated')),
  review_status TEXT NOT NULL CHECK (review_status IN ('accepted', 'corrected', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX fight_opinions_active_idx
  ON fight_opinions (card_id, fight_id, capper_id, review_status);

CREATE TABLE capper_tips (
  id TEXT PRIMARY KEY,
  opinion_id TEXT REFERENCES fight_opinions(id) ON DELETE RESTRICT,
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  fight_id TEXT REFERENCES fights(id) ON DELETE RESTRICT,
  capper_id TEXT NOT NULL REFERENCES cappers(id) ON DELETE RESTRICT,
  market_type TEXT NOT NULL CHECK (
    market_type IN ('moneyline', 'method', 'round', 'round_and_method', 'over_under', 'prop', 'parlay', 'other')
  ),
  selection_fighter_id TEXT REFERENCES fighters(id) ON DELETE RESTRICT,
  method TEXT CHECK (method IS NULL OR method IN ('ko_tko', 'submission', 'decision')),
  round TEXT CHECK (round IS NULL OR round IN ('1', '2', '3', '4', '5')),
  line_value TEXT,
  selection_text TEXT NOT NULL,
  odds_mentioned_raw TEXT,
  odds_mentioned_decimal TEXT,
  stated_stake_units TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('lean', 'solid', 'lock')),
  reasoning_summary TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK (provenance IN ('direct', 'aggregated')),
  review_status TEXT NOT NULL CHECK (review_status IN ('accepted', 'corrected', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX capper_tips_card_idx
  ON capper_tips (card_id, fight_id, review_status);

CREATE TABLE fight_stats (
  id TEXT PRIMARY KEY,
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id) ON DELETE RESTRICT,
  fight_id TEXT NOT NULL REFERENCES fights(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  all_channels_json TEXT,
  best_overall_json TEXT,
  best_favourite_json TEXT,
  best_underdog_json TEXT,
  mov_counts_json TEXT,
  best_mov_json TEXT,
  bookmaker_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX fight_stats_fight_idx ON fight_stats (fight_id, source_id);

CREATE TABLE extraction_review_items (
  id TEXT PRIMARY KEY,
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('fighter', 'capper', 'validation')),
  raw_value TEXT NOT NULL,
  context TEXT,
  candidate_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_entity_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX extraction_review_items_run_idx
  ON extraction_review_items (extraction_run_id, status);

CREATE TABLE market_prices (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  fight_id TEXT REFERENCES fights(id) ON DELETE RESTRICT,
  bookmaker TEXT,
  market_type TEXT NOT NULL CHECK (
    market_type IN ('moneyline', 'method', 'round', 'round_and_method', 'over_under', 'prop', 'parlay', 'other')
  ),
  selection_fighter_id TEXT REFERENCES fighters(id) ON DELETE RESTRICT,
  method TEXT CHECK (method IS NULL OR method IN ('ko_tko', 'submission', 'decision')),
  round TEXT CHECK (round IS NULL OR round IN ('1', '2', '3', '4', '5')),
  line_value TEXT,
  selection_text TEXT NOT NULL,
  decimal_odds TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX market_prices_card_idx
  ON market_prices (card_id, fight_id, captured_at DESC);

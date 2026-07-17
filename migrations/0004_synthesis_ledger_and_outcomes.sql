PRAGMA foreign_keys = ON;

CREATE TABLE synthesis_runs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'running', 'draft', 'accepted', 'failed', 'superseded')
  ),
  config_snapshot_json TEXT NOT NULL,
  input_snapshot_hash TEXT NOT NULL,
  prompt_versions_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX synthesis_runs_card_idx
  ON synthesis_runs (card_id, created_at DESC);

CREATE TABLE fight_summaries (
  id TEXT PRIMARY KEY,
  synthesis_run_id TEXT NOT NULL REFERENCES synthesis_runs(id) ON DELETE RESTRICT,
  fight_id TEXT NOT NULL REFERENCES fights(id) ON DELETE RESTRICT,
  consensus_fighter_id TEXT REFERENCES fighters(id) ON DELETE RESTRICT,
  weighted_share TEXT,
  raw_support_count INTEGER NOT NULL DEFAULT 0,
  eligible_voter_count INTEGER NOT NULL DEFAULT 0,
  consensus_method TEXT CHECK (consensus_method IS NULL OR consensus_method IN ('ko_tko', 'submission', 'decision')),
  method_support_count INTEGER NOT NULL DEFAULT 0,
  method_eligible_count INTEGER NOT NULL DEFAULT 0,
  consensus_round TEXT,
  round_support_count INTEGER NOT NULL DEFAULT 0,
  round_eligible_count INTEGER NOT NULL DEFAULT 0,
  overview_text TEXT,
  badges_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (synthesis_run_id, fight_id)
);

CREATE TABLE bets (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  synthesis_run_id TEXT REFERENCES synthesis_runs(id) ON DELETE RESTRICT,
  origin TEXT NOT NULL CHECK (origin IN ('synthesised', 'manual')),
  tier TEXT NOT NULL CHECK (tier IN ('core', 'value', 'parlay', 'manual')),
  market_type TEXT NOT NULL,
  selection_text TEXT NOT NULL,
  recommended_units TEXT,
  recommended_odds TEXT,
  consensus_share TEXT,
  rationale TEXT,
  state TEXT NOT NULL CHECK (state IN ('recommended', 'skipped', 'placed', 'settled')),
  odds_taken TEXT,
  settlement_odds TEXT,
  stake_units TEXT,
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'push', 'void')),
  net_profit_units TEXT,
  settled_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX bets_card_idx ON bets (card_id, state, created_at);

CREATE TABLE bet_legs (
  id TEXT PRIMARY KEY,
  bet_id TEXT NOT NULL REFERENCES bets(id) ON DELETE RESTRICT,
  fight_id TEXT NOT NULL REFERENCES fights(id) ON DELETE RESTRICT,
  market_type TEXT NOT NULL,
  selection_fighter_id TEXT REFERENCES fighters(id) ON DELETE RESTRICT,
  method TEXT,
  round TEXT,
  line_value TEXT,
  selection_text TEXT NOT NULL,
  leg_result TEXT NOT NULL DEFAULT 'pending' CHECK (leg_result IN ('pending', 'won', 'lost', 'push', 'void')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bet_support (
  bet_id TEXT NOT NULL REFERENCES bets(id) ON DELETE RESTRICT,
  capper_id TEXT NOT NULL REFERENCES cappers(id) ON DELETE RESTRICT,
  opinion_id TEXT REFERENCES fight_opinions(id) ON DELETE RESTRICT,
  capper_tip_id TEXT REFERENCES capper_tips(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (bet_id, capper_id)
);

CREATE TABLE fight_outcomes (
  fight_id TEXT PRIMARY KEY REFERENCES fights(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'winner', 'draw', 'no_contest', 'overturned', 'cancelled')
  ),
  winner_fighter_id TEXT REFERENCES fighters(id) ON DELETE RESTRICT,
  method TEXT CHECK (
    method IS NULL OR method IN ('ko_tko', 'submission', 'decision', 'disqualification', 'other')
  ),
  round TEXT CHECK (round IS NULL OR round IN ('1', '2', '3', '4', '5')),
  recorded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

PRAGMA foreign_keys = ON;

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_starts_at_utc TEXT,
  display_timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  budget_units INTEGER NOT NULL DEFAULT 30 CHECK (budget_units >= 0),
  unit_value_cents INTEGER NOT NULL DEFAULT 1000 CHECK (unit_value_cents > 0),
  currency TEXT NOT NULL DEFAULT 'AUD',
  lifecycle TEXT NOT NULL DEFAULT 'draft' CHECK (
    lifecycle IN ('draft', 'ready', 'in_progress', 'completed', 'cancelled')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE fighters (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX fighters_canonical_name_idx
  ON fighters (canonical_name COLLATE NOCASE);

CREATE TABLE fighter_aliases (
  id TEXT PRIMARY KEY,
  fighter_id TEXT NOT NULL REFERENCES fighters(id) ON DELETE RESTRICT,
  alias_normalized TEXT NOT NULL,
  alias_display TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (fighter_id, alias_normalized)
);

CREATE INDEX fighter_aliases_normalized_idx ON fighter_aliases (alias_normalized);

CREATE TABLE fights (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  weight_class TEXT,
  bout_order INTEGER,
  is_main_event INTEGER NOT NULL DEFAULT 0 CHECK (is_main_event IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'cancelled', 'completed')
  ),
  external_reference TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX fights_card_order_idx ON fights (card_id, bout_order);

CREATE TABLE fight_participants (
  fight_id TEXT NOT NULL REFERENCES fights(id) ON DELETE RESTRICT,
  fighter_id TEXT NOT NULL REFERENCES fighters(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('a', 'b')),
  display_name_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (fight_id, side),
  UNIQUE (fight_id, fighter_id)
);

CREATE TABLE cappers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX cappers_name_idx ON cappers (name COLLATE NOCASE);

CREATE TABLE capper_aliases (
  id TEXT PRIMARY KEY,
  capper_id TEXT NOT NULL REFERENCES cappers(id) ON DELETE RESTRICT,
  alias_normalized TEXT NOT NULL,
  alias_display TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (capper_id, alias_normalized)
);

CREATE INDEX capper_aliases_normalized_idx ON capper_aliases (alias_normalized);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  primary_capper_id TEXT REFERENCES cappers(id) ON DELETE RESTRICT,
  medium TEXT NOT NULL CHECK (
    medium IN ('youtube', 'patreon', 'pasted_text', 'webpage', 'other')
  ),
  extraction_mode TEXT NOT NULL CHECK (
    extraction_mode IN ('individual', 'aggregator', 'stats_tracker')
  ),
  source_url TEXT,
  title TEXT,
  raw_text TEXT NOT NULL,
  added_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX sources_card_idx ON sources (card_id, added_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_email TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX audit_events_entity_idx
  ON audit_events (entity_type, entity_id, created_at);


-- Official source: https://www.ufc.com/event/ufc-fight-night-july-18-2026
-- Verified 2026-07-17 after the UFC's 2026-07-15 card update.
-- Event time is the official 8:00 PM EDT main-card start (10:00 AM AEST Sunday).

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

INSERT OR IGNORE INTO cards (
  id, name, event_starts_at_utc, display_timezone, budget_units,
  unit_value_cents, currency, lifecycle, created_at, updated_at
) VALUES (
  'card-ufc-okc-2026-07-18',
  'UFC Fight Night: Du Plessis vs Usman',
  '2026-07-19T00:00:00.000Z',
  'Australia/Sydney', 30, 1000, 'AUD', 'draft',
  '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'
);

INSERT OR IGNORE INTO fighters (id, canonical_name, created_at, updated_at) VALUES
  ('fighter-dricus-du-plessis', 'Dricus Du Plessis', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-kamaru-usman', 'Kamaru Usman', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-jared-cannonier', 'Jared Cannonier', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-christian-leroy-duncan', 'Christian Leroy Duncan', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-chase-hooper', 'Chase Hooper', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-mitch-ramirez', 'Mitch Ramirez', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-tabatha-ricci', 'Tabatha Ricci', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-fatima-kline', 'Fatima Kline', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-tommy-mcmillen', 'Tommy McMillen', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-alberto-montes', 'Alberto Montes', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-austin-bashi', 'Austin Bashi', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-jose-miguel-delgado', 'Jose Miguel Delgado', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-jean-paul-lebosnoyani', 'Jean-Paul Lebosnoyani', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-seokhyeon-ko', 'Seokhyeon Ko', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-levi-rodrigues-jr', 'Levi Rodrigues Jr.', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-felipe-franco', 'Felipe Franco', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-alden-coria', 'Alden Coria', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-stewart-nicoll', 'Stewart Nicoll', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-rj-harris', 'RJ Harris', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-alvin-hines', 'Alvin Hines', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-anna-melisano', 'Anna Melisano', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-dione-barbosa', 'Dione Barbosa', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-ezra-elliot', 'Ezra Elliot', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fighter-damien-anderson', 'Damien Anderson', '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z');

INSERT OR IGNORE INTO fights (
  id, card_id, weight_class, bout_order, is_main_event, status,
  external_reference, deleted_at, created_at, updated_at
) VALUES
  ('fight-ufc-okc-2026-01', 'card-ufc-okc-2026-07-18', 'Middleweight', 1, 1, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-02', 'card-ufc-okc-2026-07-18', 'Middleweight', 2, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-03', 'card-ufc-okc-2026-07-18', 'Lightweight', 3, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-04', 'card-ufc-okc-2026-07-18', 'Women''s Strawweight', 4, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-05', 'card-ufc-okc-2026-07-18', 'Featherweight', 5, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-06', 'card-ufc-okc-2026-07-18', 'Featherweight', 6, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-07', 'card-ufc-okc-2026-07-18', 'Welterweight', 7, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-08', 'card-ufc-okc-2026-07-18', 'Light Heavyweight', 8, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-09', 'card-ufc-okc-2026-07-18', 'Flyweight', 9, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-10', 'card-ufc-okc-2026-07-18', 'Heavyweight', 10, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-11', 'card-ufc-okc-2026-07-18', 'Women''s Flyweight', 11, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z'),
  ('fight-ufc-okc-2026-12', 'card-ufc-okc-2026-07-18', 'Featherweight', 12, 0, 'scheduled', 'https://www.ufc.com/event/ufc-fight-night-july-18-2026', NULL, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z');

INSERT OR IGNORE INTO fight_participants (
  fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
) SELECT 'fight-ufc-okc-2026-01', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Dricus Du Plessis' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-01', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Kamaru Usman' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-02', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Jared Cannonier' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-02', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Christian Leroy Duncan' COLLATE NOCASE;

INSERT OR IGNORE INTO fight_participants (
  fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
) SELECT 'fight-ufc-okc-2026-03', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Chase Hooper' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-03', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Mitch Ramirez' COLLATE NOCASE;

INSERT OR IGNORE INTO fight_participants (
  fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
) SELECT 'fight-ufc-okc-2026-04', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Tabatha Ricci' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-04', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Fatima Kline' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-05', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Tommy McMillen' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-05', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Alberto Montes' COLLATE NOCASE;

INSERT OR IGNORE INTO fight_participants (
  fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
) SELECT 'fight-ufc-okc-2026-06', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Austin Bashi' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-06', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Jose Miguel Delgado' COLLATE NOCASE;

INSERT OR IGNORE INTO fight_participants (
  fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
) SELECT 'fight-ufc-okc-2026-07', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Jean-Paul Lebosnoyani' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-07', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Seokhyeon Ko' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-08', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Levi Rodrigues Jr.' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-08', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Felipe Franco' COLLATE NOCASE;

INSERT OR IGNORE INTO fight_participants (
  fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
) SELECT 'fight-ufc-okc-2026-09', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Alden Coria' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-09', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Stewart Nicoll' COLLATE NOCASE;

INSERT OR IGNORE INTO fight_participants (
  fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
) SELECT 'fight-ufc-okc-2026-10', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'RJ Harris' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-10', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Alvin Hines' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-11', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Anna Melisano' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-11', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Dione Barbosa' COLLATE NOCASE;

INSERT OR IGNORE INTO fight_participants (
  fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
) SELECT 'fight-ufc-okc-2026-12', id, 'a', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Ezra Elliot' COLLATE NOCASE
UNION ALL SELECT 'fight-ufc-okc-2026-12', id, 'b', canonical_name, '2026-07-17T09:30:00.000Z', '2026-07-17T09:30:00.000Z' FROM fighters WHERE canonical_name = 'Damien Anderson' COLLATE NOCASE;

COMMIT;

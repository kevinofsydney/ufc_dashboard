import type { Bindings } from '../env'
import { auditEvent } from './audit'

export interface MarketPriceRecord {
  id: string
  cardId: string
  fightId: string | null
  fighterAName: string | null
  fighterBName: string | null
  bookmaker: string | null
  marketType: string
  selectionFighterId: string | null
  selectionFighterName: string | null
  selectionText: string
  decimalOdds: string
  capturedAt: string
  source: 'manual' | 'api'
  sourceProvider: 'ufc' | 'tapology' | null
  sourceUrl: string | null
  createdAt: string
  updatedAt: string
}

interface MarketPriceRow {
  id: string
  card_id: string
  fight_id: string | null
  fighter_a_name: string | null
  fighter_b_name: string | null
  bookmaker: string | null
  market_type: string
  selection_fighter_id: string | null
  selection_fighter_name: string | null
  selection_text: string
  decimal_odds: string
  captured_at: string
  source: 'manual' | 'api'
  source_provider: 'ufc' | 'tapology' | null
  source_url: string | null
  created_at: string
  updated_at: string
}

function mapMarketPrice(row: MarketPriceRow): MarketPriceRecord {
  return {
    id: row.id,
    cardId: row.card_id,
    fightId: row.fight_id,
    fighterAName: row.fighter_a_name,
    fighterBName: row.fighter_b_name,
    bookmaker: row.bookmaker,
    marketType: row.market_type,
    selectionFighterId: row.selection_fighter_id,
    selectionFighterName: row.selection_fighter_name,
    selectionText: row.selection_text,
    decimalOdds: row.decimal_odds,
    capturedAt: row.captured_at,
    source: row.source,
    sourceProvider: row.source_provider,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const selectMarketPrices = `
  SELECT market_prices.id, market_prices.card_id, market_prices.fight_id,
         market_prices.bookmaker, market_prices.market_type,
         market_prices.selection_fighter_id, selection.canonical_name AS selection_fighter_name,
         market_prices.selection_text, market_prices.decimal_odds,
         market_prices.captured_at, market_prices.source,
         market_prices.source_provider, market_prices.source_url,
         market_prices.created_at, market_prices.updated_at,
         participant_a.display_name_snapshot AS fighter_a_name,
         participant_b.display_name_snapshot AS fighter_b_name
  FROM market_prices
  LEFT JOIN fighters AS selection ON selection.id = market_prices.selection_fighter_id
  LEFT JOIN fight_participants AS participant_a
    ON participant_a.fight_id = market_prices.fight_id AND participant_a.side = 'a'
  LEFT JOIN fight_participants AS participant_b
    ON participant_b.fight_id = market_prices.fight_id AND participant_b.side = 'b'
`

export async function listMarketPrices(
  db: Bindings['DB'],
  cardId: string,
): Promise<MarketPriceRecord[]> {
  const result = await db
    .prepare(
      `${selectMarketPrices}
       WHERE market_prices.card_id = ? AND market_prices.deleted_at IS NULL
       ORDER BY market_prices.captured_at DESC`,
    )
    .bind(cardId)
    .all<MarketPriceRow>()
  return result.results.map(mapMarketPrice)
}

export async function hideMarketPrice(
  db: Bindings['DB'],
  priceId: string,
  actorEmail: string,
): Promise<void> {
  const now = new Date().toISOString()
  const result = await db
    .prepare(
      `UPDATE market_prices SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(now, now, priceId)
    .run()
  if (result.meta.changes !== 1) throw new Error('Price snapshot not found')
  await auditEvent(db, {
    entityType: 'market_price',
    entityId: priceId,
    action: 'hidden',
    actorEmail,
    now,
  }).run()
}

export async function createMarketPrice(
  db: Bindings['DB'],
  input: {
    cardId: string
    fightId: string
    bookmaker?: string | null
    marketType: string
    selectionFighterId: string
    selectionText: string
    decimalOdds: string
    capturedAt?: string
    sourceProvider?: 'ufc' | 'tapology' | null
    sourceUrl?: string | null
  },
): Promise<MarketPriceRecord> {
  const participant = await db
    .prepare(
      `SELECT fighters.canonical_name AS name
       FROM fight_participants
       INNER JOIN fights ON fights.id = fight_participants.fight_id
       INNER JOIN fighters ON fighters.id = fight_participants.fighter_id
       WHERE fight_participants.fight_id = ?
         AND fight_participants.fighter_id = ?
         AND fights.card_id = ?
         AND fights.deleted_at IS NULL`,
    )
    .bind(input.fightId, input.selectionFighterId, input.cardId)
    .first<{ name: string }>()
  if (!participant) {
    throw new Error('The selected fighter is not on that fight')
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const capturedAt = input.capturedAt ?? now
  await db
    .prepare(
      `INSERT INTO market_prices (
         id, card_id, fight_id, bookmaker, market_type,
         selection_fighter_id, method, round, line_value, selection_text,
         decimal_odds, captured_at, source, source_provider, source_url,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, 'manual', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.cardId,
      input.fightId,
      input.bookmaker ?? null,
      input.marketType,
      input.selectionFighterId,
      input.selectionText,
      input.decimalOdds,
      capturedAt,
      input.sourceProvider ?? null,
      input.sourceUrl ?? null,
      now,
      now,
    )
    .run()

  const created = await db
    .prepare(`${selectMarketPrices} WHERE market_prices.id = ?`)
    .bind(id)
    .first<MarketPriceRow>()
  if (!created) throw new Error('The market price could not be reloaded')
  return mapMarketPrice(created)
}

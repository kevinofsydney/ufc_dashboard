import { netProfitUnits } from '../../shared/maths/odds'
import type { Bindings } from '../env'
import { auditEvent } from './audit'

export interface BetRecord {
  id: string
  cardId: string
  synthesisRunId: string | null
  origin: 'synthesised' | 'manual'
  tier: 'core' | 'value' | 'parlay' | 'manual'
  marketType: string
  fightId: string | null
  selectionFighterId: string | null
  method: string | null
  round: string | null
  lineValue: string | null
  selectionText: string
  recommendedUnits: string | null
  recommendedOdds: string | null
  consensusShare: string | null
  rationale: string | null
  state: 'recommended' | 'skipped' | 'placed' | 'settled'
  oddsTaken: string | null
  settlementOdds: string | null
  stakeUnits: string | null
  result: 'pending' | 'won' | 'lost' | 'push' | 'void'
  netProfitUnits: string | null
  settledAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  legs: BetLegRecord[]
}

export interface BetLegRecord {
  id: string
  fightId: string
  marketType: string
  selectionFighterId: string | null
  method: string | null
  round: string | null
  lineValue: string | null
  selectionText: string
  legResult: 'pending' | 'won' | 'lost' | 'push' | 'void'
}

interface BetLegRow {
  id: string
  bet_id: string
  fight_id: string
  market_type: string
  selection_fighter_id: string | null
  method: string | null
  round: string | null
  line_value: string | null
  selection_text: string
  leg_result: BetLegRecord['legResult']
}

interface BetRow {
  id: string
  card_id: string
  synthesis_run_id: string | null
  origin: BetRecord['origin']
  tier: BetRecord['tier']
  market_type: string
  fight_id: string | null
  selection_fighter_id: string | null
  method: string | null
  round: string | null
  line_value: string | null
  selection_text: string
  recommended_units: string | null
  recommended_odds: string | null
  consensus_share: string | null
  rationale: string | null
  state: BetRecord['state']
  odds_taken: string | null
  settlement_odds: string | null
  stake_units: string | null
  result: BetRecord['result']
  net_profit_units: string | null
  settled_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function mapBet(row: BetRow): BetRecord {
  return {
    id: row.id,
    cardId: row.card_id,
    synthesisRunId: row.synthesis_run_id,
    origin: row.origin,
    tier: row.tier,
    marketType: row.market_type,
    fightId: row.fight_id,
    selectionFighterId: row.selection_fighter_id,
    method: row.method,
    round: row.round,
    lineValue: row.line_value,
    selectionText: row.selection_text,
    recommendedUnits: row.recommended_units,
    recommendedOdds: row.recommended_odds,
    consensusShare: row.consensus_share,
    rationale: row.rationale,
    state: row.state,
    oddsTaken: row.odds_taken,
    settlementOdds: row.settlement_odds,
    stakeUnits: row.stake_units,
    result: row.result,
    netProfitUnits: row.net_profit_units,
    settledAt: row.settled_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    legs: [],
  }
}

function mapLeg(row: BetLegRow): BetLegRecord {
  return {
    id: row.id,
    fightId: row.fight_id,
    marketType: row.market_type,
    selectionFighterId: row.selection_fighter_id,
    method: row.method,
    round: row.round,
    lineValue: row.line_value,
    selectionText: row.selection_text,
    legResult: row.leg_result,
  }
}

async function listLegsForBets(
  db: Bindings['DB'],
  betIds: string[],
): Promise<Map<string, BetLegRecord[]>> {
  const byBet = new Map<string, BetLegRecord[]>()
  if (betIds.length === 0) return byBet
  const result = await db
    .prepare(
      `SELECT id, bet_id, fight_id, market_type, selection_fighter_id,
              method, round, line_value, selection_text, leg_result
       FROM bet_legs
       WHERE bet_id IN (${betIds.map(() => '?').join(', ')})
       ORDER BY created_at`,
    )
    .bind(...betIds)
    .all<BetLegRow>()
  for (const row of result.results) {
    const current = byBet.get(row.bet_id) ?? []
    current.push(mapLeg(row))
    byBet.set(row.bet_id, current)
  }
  return byBet
}

const betColumns = `
  bets.id, bets.card_id, bets.synthesis_run_id, bets.origin, bets.tier,
  bets.market_type, bets.fight_id, bets.selection_fighter_id, bets.method,
  bets.round, bets.line_value, bets.selection_text, bets.recommended_units,
  bets.recommended_odds, bets.consensus_share, bets.rationale, bets.state,
  bets.odds_taken, bets.settlement_odds, bets.stake_units, bets.result,
  bets.net_profit_units, bets.settled_at, bets.notes, bets.created_at,
  bets.updated_at
`

async function getBet(db: Bindings['DB'], betId: string): Promise<BetRecord> {
  const row = await db
    .prepare(`SELECT ${betColumns} FROM bets WHERE bets.id = ?`)
    .bind(betId)
    .first<BetRow>()
  if (!row) throw new Error('Bet not found')
  const bet = mapBet(row)
  bet.legs = (await listLegsForBets(db, [betId])).get(betId) ?? []
  return bet
}

export async function listBets(
  db: Bindings['DB'],
  cardId: string,
): Promise<BetRecord[]> {
  const result = await db
    .prepare(
      `SELECT ${betColumns}
       FROM bets
       LEFT JOIN synthesis_runs ON synthesis_runs.id = bets.synthesis_run_id
       WHERE bets.card_id = ?
         AND (
           bets.origin = 'manual'
           OR synthesis_runs.status = 'accepted'
           OR bets.state IN ('placed', 'settled', 'skipped')
         )
       ORDER BY bets.created_at DESC`,
    )
    .bind(cardId)
    .all<BetRow>()
  const bets = result.results.map(mapBet)
  const legs = await listLegsForBets(
    db,
    bets.map((bet) => bet.id),
  )
  for (const bet of bets) bet.legs = legs.get(bet.id) ?? []
  return bets
}

export async function listAnalyticsBets(
  db: Bindings['DB'],
): Promise<BetRecord[]> {
  const result = await db
    .prepare(
      `SELECT ${betColumns}
       FROM bets
       LEFT JOIN synthesis_runs ON synthesis_runs.id = bets.synthesis_run_id
       WHERE bets.origin = 'manual'
          OR synthesis_runs.status = 'accepted'
          OR bets.state IN ('placed', 'settled', 'skipped')
       ORDER BY bets.created_at DESC`,
    )
    .all<BetRow>()
  const bets = result.results.map(mapBet)
  const legs = await listLegsForBets(
    db,
    bets.map((bet) => bet.id),
  )
  for (const bet of bets) bet.legs = legs.get(bet.id) ?? []
  return bets
}

export async function createManualBet(
  db: Bindings['DB'],
  input: {
    cardId: string
    marketType: string
    selectionText: string
    oddsTaken: string
    stakeUnits: string
    notes?: string | null
    legs?: Array<{
      fightId: string
      marketType: string
      selectionFighterId: string | null
      method?: string | null
      round?: string | null
      lineValue?: string | null
      selectionText: string
    }>
  },
): Promise<BetRecord> {
  for (const leg of input.legs ?? []) {
    const validLeg = await db
      .prepare(
        `SELECT 1 AS valid
         FROM fights
         LEFT JOIN fight_participants
           ON fight_participants.fight_id = fights.id
          AND fight_participants.fighter_id = ?
         WHERE fights.id = ? AND fights.card_id = ?
           AND fights.deleted_at IS NULL
           AND (? IS NULL OR fight_participants.fighter_id IS NOT NULL)`,
      )
      .bind(
        leg.selectionFighterId,
        leg.fightId,
        input.cardId,
        leg.selectionFighterId,
      )
      .first<{ valid: number }>()
    if (!validLeg)
      throw new Error('Every parlay leg must belong to the selected card')
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO bets (
         id, card_id, synthesis_run_id, origin, tier, market_type,
         fight_id, selection_fighter_id, method, round, line_value,
         selection_text, recommended_units, recommended_odds, consensus_share,
         rationale, state, odds_taken, settlement_odds, stake_units, result,
         net_profit_units, settled_at, notes, created_at, updated_at
       ) VALUES (?, ?, NULL, 'manual', 'manual', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL,
                 NULL, 'placed', ?, NULL, ?, 'pending', NULL, NULL, ?, ?, ?)`,
      )
      .bind(
        id,
        input.cardId,
        input.marketType,
        input.legs?.length === 1 ? (input.legs[0]?.fightId ?? null) : null,
        input.legs?.length === 1
          ? (input.legs[0]?.selectionFighterId ?? null)
          : null,
        input.legs?.length === 1 ? (input.legs[0]?.method ?? null) : null,
        input.legs?.length === 1 ? (input.legs[0]?.round ?? null) : null,
        input.legs?.length === 1 ? (input.legs[0]?.lineValue ?? null) : null,
        input.selectionText,
        input.oddsTaken,
        input.stakeUnits,
        input.notes ?? null,
        now,
        now,
      ),
  ]
  for (const leg of input.legs ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO bet_legs (
             id, bet_id, fight_id, market_type, selection_fighter_id,
             method, round, line_value, selection_text, leg_result,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          leg.fightId,
          leg.marketType,
          leg.selectionFighterId,
          leg.method ?? null,
          leg.round ?? null,
          leg.lineValue ?? null,
          leg.selectionText,
          now,
          now,
        ),
    )
  }
  await db.batch(statements)
  return getBet(db, id)
}

export async function placeBet(
  db: Bindings['DB'],
  betId: string,
  input: { oddsTaken: string; stakeUnits: string },
): Promise<BetRecord> {
  const now = new Date().toISOString()
  const result = await db
    .prepare(
      `UPDATE bets
       SET state = 'placed', odds_taken = ?, stake_units = ?, updated_at = ?
       WHERE id = ? AND state = 'recommended'`,
    )
    .bind(input.oddsTaken, input.stakeUnits, now, betId)
    .run()
  if (result.meta.changes !== 1)
    throw new Error('Only a recommended bet can be placed')
  return getBet(db, betId)
}

export async function skipBet(
  db: Bindings['DB'],
  betId: string,
): Promise<BetRecord> {
  const result = await db
    .prepare(
      `UPDATE bets SET state = 'skipped', updated_at = ?
       WHERE id = ? AND state = 'recommended'`,
    )
    .bind(new Date().toISOString(), betId)
    .run()
  if (result.meta.changes !== 1)
    throw new Error('Only a recommended bet can be skipped')
  return getBet(db, betId)
}

export async function settleBet(
  db: Bindings['DB'],
  betId: string,
  input: {
    result: 'won' | 'lost' | 'push' | 'void'
    settlementOdds?: string | null
    actorEmail: string
  },
): Promise<BetRecord> {
  const bet = await db
    .prepare(`SELECT odds_taken, stake_units, state FROM bets WHERE id = ?`)
    .bind(betId)
    .first<{
      odds_taken: string | null
      stake_units: string | null
      state: string
    }>()
  if (!bet || bet.state !== 'placed')
    throw new Error('Only a placed bet can be settled')
  if (!bet.odds_taken || !bet.stake_units)
    throw new Error('Placed odds and stake are required for settlement')

  const settlementOdds = input.settlementOdds ?? bet.odds_taken
  const profit = netProfitUnits(
    input.result,
    Number(bet.stake_units),
    Number(settlementOdds),
  )
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE bets
         SET state = 'settled', result = ?, settlement_odds = ?,
             net_profit_units = ?, settled_at = ?, updated_at = ?
         WHERE id = ? AND state = 'placed'`,
      )
      .bind(input.result, settlementOdds, profit.toFixed(4), now, now, betId),
    auditEvent(db, {
      entityType: 'bet',
      entityId: betId,
      action: 'settled',
      actorEmail: input.actorEmail,
      details: { result: input.result, settlementOdds },
      now,
    }),
  ])
  return getBet(db, betId)
}

export async function unsettleBet(
  db: Bindings['DB'],
  betId: string,
  actorEmail: string,
): Promise<BetRecord> {
  const existing = await getBet(db, betId)
  if (existing.state !== 'settled')
    throw new Error('Only a settled bet can be unsettled')
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE bets
         SET state = 'placed', result = 'pending', settlement_odds = NULL,
             net_profit_units = NULL, settled_at = NULL, updated_at = ?
         WHERE id = ? AND state = 'settled'`,
      )
      .bind(now, betId),
    auditEvent(db, {
      entityType: 'bet',
      entityId: betId,
      action: 'unsettled',
      actorEmail,
      now,
    }),
  ])
  return getBet(db, betId)
}

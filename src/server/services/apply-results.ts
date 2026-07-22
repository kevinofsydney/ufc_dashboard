import { netProfitUnits, parseOdds } from '../../shared/maths/odds'
import type { Bindings } from '../env'
import { auditEvent } from '../repositories/audit'
import { PROVIDER_HOSTS, type ResultsProvider } from '../../shared/providers'

export interface ReviewedOutcomeInput {
  fightId: string
  status: 'winner' | 'draw' | 'no_contest' | 'cancelled' | 'overturned'
  winnerFighterId: string | null
  method:
    'ko_tko' | 'submission' | 'decision' | 'disqualification' | 'other' | null
  round: '1' | '2' | '3' | '4' | '5' | null
  sourceProvider?: ResultsProvider
  sourceUrl?: string
}

export interface ReviewedSettlementInput {
  betId: string
  result: 'won' | 'lost' | 'push' | 'void'
  settlementOddsInput?: string | null
  legs?: Array<{
    legId: string
    result: 'won' | 'lost' | 'push' | 'void'
  }>
}

export async function applyResultsReview(
  db: Bindings['DB'],
  input: {
    cardId: string
    provider: ResultsProvider
    sourceUrl: string
    outcomes: ReviewedOutcomeInput[]
    settlements: ReviewedSettlementInput[]
    actorEmail: string
  },
): Promise<{ outcomesApplied: number; betsSettled: number }> {
  const sourceUrl = new URL(input.sourceUrl)
  const expectedHosts = PROVIDER_HOSTS[input.provider]
  if (
    sourceUrl.protocol !== 'https:' ||
    !expectedHosts.includes(sourceUrl.hostname.toLowerCase())
  )
    throw new Error('Result source URL does not match its provider')
  const fights = await db
    .prepare(
      `SELECT fights.id, participant.fighter_id
       FROM fights
       LEFT JOIN fight_participants participant ON participant.fight_id = fights.id
       WHERE fights.card_id = ? AND fights.deleted_at IS NULL`,
    )
    .bind(input.cardId)
    .all<{ id: string; fighter_id: string | null }>()
  const fighterIdsByFight = new Map<string, Set<string>>()
  for (const row of fights.results) {
    const ids = fighterIdsByFight.get(row.id) ?? new Set<string>()
    if (row.fighter_id) ids.add(row.fighter_id)
    fighterIdsByFight.set(row.id, ids)
  }
  for (const outcome of input.outcomes) {
    const outcomeProvider = outcome.sourceProvider ?? input.provider
    const outcomeSourceUrl = outcome.sourceUrl ?? input.sourceUrl
    const parsedOutcomeUrl = new URL(outcomeSourceUrl)
    const outcomeHosts = PROVIDER_HOSTS[outcomeProvider]
    if (
      parsedOutcomeUrl.protocol !== 'https:' ||
      !outcomeHosts.includes(parsedOutcomeUrl.hostname.toLowerCase())
    )
      throw new Error('Outcome source URL does not match its provider')
    const fighters = fighterIdsByFight.get(outcome.fightId)
    if (!fighters)
      throw new Error('Every reviewed outcome must belong to the selected card')
    if (
      outcome.status === 'winner' &&
      (!outcome.winnerFighterId || !fighters.has(outcome.winnerFighterId))
    )
      throw new Error('Every winner must be a fighter in the reviewed bout')
    if (outcome.status !== 'winner' && outcome.winnerFighterId)
      throw new Error('Only winner outcomes can name a winning fighter')
  }

  const settlementRows: Array<{
    input: ReviewedSettlementInput
    odds: string
    stake: string
    profit: string
    legs: NonNullable<ReviewedSettlementInput['legs']>
  }> = []
  for (const settlement of input.settlements) {
    const bet = await db
      .prepare(
        `SELECT odds_taken, stake_units, state FROM bets
         WHERE id = ? AND card_id = ?`,
      )
      .bind(settlement.betId, input.cardId)
      .first<{
        odds_taken: string | null
        stake_units: string | null
        state: string
      }>()
    if (!bet || bet.state !== 'placed' || !bet.odds_taken || !bet.stake_units)
      throw new Error(
        'Every reviewed settlement must reference a placed bet with odds and stake',
      )
    const storedLegs = await db
      .prepare(`SELECT id FROM bet_legs WHERE bet_id = ? ORDER BY created_at`)
      .bind(settlement.betId)
      .all<{ id: string }>()
    const submittedLegs = settlement.legs ?? []
    if (storedLegs.results.length !== submittedLegs.length)
      throw new Error('Every parlay leg must be reviewed before settlement')
    const storedLegIds = new Set(storedLegs.results.map((leg) => leg.id))
    if (submittedLegs.some((leg) => !storedLegIds.has(leg.legId)))
      throw new Error('A reviewed parlay leg does not belong to this bet')
    if (
      settlement.result === 'won' &&
      submittedLegs.some((leg) => leg.result === 'void') &&
      !settlement.settlementOddsInput
    )
      throw new Error(
        'A winning parlay with a void leg needs confirmed adjusted odds',
      )
    const odds = settlement.settlementOddsInput
      ? parseOdds(settlement.settlementOddsInput).toFixed(4)
      : bet.odds_taken
    settlementRows.push({
      input: settlement,
      odds,
      stake: bet.stake_units,
      profit: netProfitUnits(
        settlement.result,
        Number(bet.stake_units),
        Number(odds),
      ).toFixed(4),
      legs: submittedLegs,
    })
  }

  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = []
  for (const outcome of input.outcomes) {
    const outcomeProvider = outcome.sourceProvider ?? input.provider
    const outcomeSourceUrl = outcome.sourceUrl ?? input.sourceUrl
    statements.push(
      db
        .prepare(
          `INSERT INTO fight_outcomes (
             fight_id, status, winner_fighter_id, method, round, recorded_at,
             created_at, updated_at, source_provider, source_url, fetched_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(fight_id) DO UPDATE SET
             status = excluded.status,
             winner_fighter_id = excluded.winner_fighter_id,
             method = excluded.method,
             round = excluded.round,
             recorded_at = excluded.recorded_at,
             updated_at = excluded.updated_at,
             source_provider = excluded.source_provider,
             source_url = excluded.source_url,
             fetched_at = excluded.fetched_at`,
        )
        .bind(
          outcome.fightId,
          outcome.status,
          outcome.winnerFighterId,
          outcome.method,
          outcome.round,
          now,
          now,
          now,
          outcomeProvider,
          outcomeSourceUrl,
          now,
        ),
      db
        .prepare(
          `UPDATE fights SET status = 'completed', updated_at = ? WHERE id = ?`,
        )
        .bind(now, outcome.fightId),
      auditEvent(db, {
        entityType: 'fight_outcome',
        entityId: outcome.fightId,
        action: 'imported_and_confirmed',
        actorEmail: input.actorEmail,
        details: {
          ...outcome,
          provider: outcomeProvider,
          sourceUrl: outcomeSourceUrl,
        },
        now,
      }),
    )
  }
  for (const settlement of settlementRows) {
    for (const leg of settlement.legs) {
      statements.push(
        db
          .prepare(
            `UPDATE bet_legs SET leg_result = ?, updated_at = ?
             WHERE id = ? AND bet_id = ?`,
          )
          .bind(leg.result, now, leg.legId, settlement.input.betId),
      )
    }
    statements.push(
      db
        .prepare(
          `UPDATE bets SET state = 'settled', result = ?, settlement_odds = ?,
             net_profit_units = ?, settled_at = ?, updated_at = ?
           WHERE id = ? AND state = 'placed'`,
        )
        .bind(
          settlement.input.result,
          settlement.odds,
          settlement.profit,
          now,
          now,
          settlement.input.betId,
        ),
      auditEvent(db, {
        entityType: 'bet',
        entityId: settlement.input.betId,
        action: 'settled_from_reviewed_results',
        actorEmail: input.actorEmail,
        details: {
          result: settlement.input.result,
          settlementOdds: settlement.odds,
          provider: input.provider,
        },
        now,
      }),
    )
  }
  if (statements.length > 0) await db.batch(statements)
  return {
    outcomesApplied: input.outcomes.length,
    betsSettled: input.settlements.length,
  }
}

import type { Bindings } from '../env'
import { auditEvent } from './audit'

export type FightOutcomeStatus =
  'pending' | 'winner' | 'draw' | 'no_contest' | 'overturned' | 'cancelled'

export interface FightOutcomeRecord {
  fightId: string
  status: FightOutcomeStatus
  winnerFighterId: string | null
  method:
    'ko_tko' | 'submission' | 'decision' | 'disqualification' | 'other' | null
  round: '1' | '2' | '3' | '4' | '5' | null
  recordedAt: string | null
  updatedAt: string
}

interface FightOutcomeRow {
  fight_id: string
  status: FightOutcomeStatus
  winner_fighter_id: string | null
  method: FightOutcomeRecord['method']
  round: FightOutcomeRecord['round']
  recorded_at: string | null
  updated_at: string
}

function mapOutcome(row: FightOutcomeRow): FightOutcomeRecord {
  return {
    fightId: row.fight_id,
    status: row.status,
    winnerFighterId: row.winner_fighter_id,
    method: row.method,
    round: row.round,
    recordedAt: row.recorded_at,
    updatedAt: row.updated_at,
  }
}

export async function listFightOutcomes(
  db: Bindings['DB'],
  cardId: string,
): Promise<FightOutcomeRecord[]> {
  const result = await db
    .prepare(
      `SELECT fight_outcomes.fight_id, fight_outcomes.status,
              fight_outcomes.winner_fighter_id, fight_outcomes.method,
              fight_outcomes.round, fight_outcomes.recorded_at,
              fight_outcomes.updated_at
       FROM fight_outcomes
       INNER JOIN fights ON fights.id = fight_outcomes.fight_id
       WHERE fights.card_id = ?
       ORDER BY fights.bout_order, fights.created_at`,
    )
    .bind(cardId)
    .all<FightOutcomeRow>()
  return result.results.map(mapOutcome)
}

export async function recordFightOutcome(
  db: Bindings['DB'],
  fightId: string,
  input: Omit<FightOutcomeRecord, 'fightId' | 'recordedAt' | 'updatedAt'>,
  actorEmail: string,
): Promise<FightOutcomeRecord> {
  const fight = await db
    .prepare(
      `SELECT fight_participants.fighter_id
       FROM fights
       INNER JOIN fight_participants ON fight_participants.fight_id = fights.id
       WHERE fights.id = ?`,
    )
    .bind(fightId)
    .all<{ fighter_id: string }>()
  if (fight.results.length !== 2) throw new Error('Fight not found')
  const participantIds = new Set(fight.results.map((row) => row.fighter_id))
  if (input.status === 'winner') {
    if (!input.winnerFighterId || !participantIds.has(input.winnerFighterId)) {
      throw new Error('The winner must be a participant in this fight')
    }
  } else if (input.winnerFighterId) {
    throw new Error('Only a winner outcome can name a winning fighter')
  }

  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `INSERT INTO fight_outcomes (
           fight_id, status, winner_fighter_id, method, round, recorded_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(fight_id) DO UPDATE SET
           status = excluded.status,
           winner_fighter_id = excluded.winner_fighter_id,
           method = excluded.method,
           round = excluded.round,
           recorded_at = excluded.recorded_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        fightId,
        input.status,
        input.winnerFighterId,
        input.method,
        input.round,
        input.status === 'pending' ? null : now,
        now,
        now,
      ),
    auditEvent(db, {
      entityType: 'fight_outcome',
      entityId: fightId,
      action: 'recorded',
      actorEmail,
      details: input,
      now,
    }),
  ])

  const row = await db
    .prepare(
      `SELECT fight_id, status, winner_fighter_id, method, round,
              recorded_at, updated_at
       FROM fight_outcomes WHERE fight_id = ?`,
    )
    .bind(fightId)
    .first<FightOutcomeRow>()
  if (!row) throw new Error('Fight outcome could not be reloaded')
  return mapOutcome(row)
}

export interface CapperGradeRecord {
  capperId: string
  capperName: string
  winnerCallsGraded: number
  winnerHits: number
  winnerHitRate: number | null
  methodCallsGraded: number
  methodHits: number
  methodHitRate: number | null
  roundCallsGraded: number
  roundHits: number
  roundHitRate: number | null
  pricedTipsGraded: number
  tipRoiAtStatedOdds: number | null
}

export async function listCapperGrades(
  db: Bindings['DB'],
): Promise<CapperGradeRecord[]> {
  const [result, tipResult] = await Promise.all([
    db
      .prepare(
        `SELECT cappers.id AS capper_id, cappers.name AS capper_name,
              COUNT(fight_opinions.id) AS winner_calls_graded,
              SUM(CASE WHEN fight_opinions.picked_fighter_id = fight_outcomes.winner_fighter_id THEN 1 ELSE 0 END) AS winner_hits,
              SUM(CASE WHEN fight_opinions.method IS NOT NULL THEN 1 ELSE 0 END) AS method_calls_graded,
              SUM(CASE WHEN fight_opinions.method IS NOT NULL
                        AND fight_opinions.picked_fighter_id = fight_outcomes.winner_fighter_id
                        AND fight_opinions.method = fight_outcomes.method THEN 1 ELSE 0 END) AS method_hits,
              SUM(CASE WHEN fight_opinions.round IS NOT NULL THEN 1 ELSE 0 END) AS round_calls_graded,
              SUM(CASE WHEN fight_opinions.round IS NOT NULL
                        AND fight_opinions.picked_fighter_id = fight_outcomes.winner_fighter_id
                        AND (
                          fight_opinions.round = fight_outcomes.round
                          OR (fight_opinions.round = 'distance'
                              AND fight_outcomes.method = 'decision'
                              AND fight_outcomes.round = CASE WHEN fights.is_main_event = 1 THEN '5' ELSE '3' END)
                        ) THEN 1 ELSE 0 END) AS round_hits
       FROM cappers
       INNER JOIN fight_opinions ON fight_opinions.capper_id = cappers.id
       INNER JOIN sources ON sources.id = fight_opinions.source_id
       INNER JOIN fights ON fights.id = fight_opinions.fight_id
       INNER JOIN fight_outcomes ON fight_outcomes.fight_id = fights.id
       WHERE cappers.active = 1
         AND fight_outcomes.status = 'winner'
         AND fight_opinions.review_status IN ('accepted', 'corrected')
         AND sources.active_extraction_run_id = fight_opinions.extraction_run_id
       GROUP BY cappers.id, cappers.name
       ORDER BY cappers.name`,
      )
      .all<{
        capper_id: string
        capper_name: string
        winner_calls_graded: number
        winner_hits: number
        method_calls_graded: number
        method_hits: number
        round_calls_graded: number
        round_hits: number
      }>(),
    db
      .prepare(
        `SELECT cappers.id AS capper_id, cappers.name AS capper_name,
              COUNT(capper_tips.id) AS priced_tips_graded,
              SUM(COALESCE(CAST(capper_tips.stated_stake_units AS REAL), 1.0)) AS priced_tip_stake,
              SUM(
                CASE
                  WHEN capper_tips.selection_fighter_id = fight_outcomes.winner_fighter_id
                    THEN COALESCE(CAST(capper_tips.stated_stake_units AS REAL), 1.0)
                       * (CAST(capper_tips.odds_mentioned_decimal AS REAL) - 1.0)
                  ELSE -COALESCE(CAST(capper_tips.stated_stake_units AS REAL), 1.0)
                END
              ) AS priced_tip_profit
       FROM cappers
       INNER JOIN capper_tips ON capper_tips.capper_id = cappers.id
       INNER JOIN sources ON sources.id = capper_tips.source_id
       INNER JOIN fight_outcomes ON fight_outcomes.fight_id = capper_tips.fight_id
       WHERE cappers.active = 1
         AND fight_outcomes.status = 'winner'
         AND capper_tips.market_type = 'moneyline'
         AND capper_tips.selection_fighter_id IS NOT NULL
         AND capper_tips.odds_mentioned_decimal IS NOT NULL
         AND CAST(capper_tips.odds_mentioned_decimal AS REAL) > 1.0
         AND capper_tips.review_status IN ('accepted', 'corrected')
         AND sources.active_extraction_run_id = capper_tips.extraction_run_id
       GROUP BY cappers.id, cappers.name`,
      )
      .all<{
        capper_id: string
        capper_name: string
        priced_tips_graded: number
        priced_tip_stake: number
        priced_tip_profit: number
      }>(),
  ])

  const grades = new Map<string, CapperGradeRecord>()
  for (const row of result.results) {
    grades.set(row.capper_id, {
      capperId: row.capper_id,
      capperName: row.capper_name,
      winnerCallsGraded: row.winner_calls_graded,
      winnerHits: row.winner_hits,
      winnerHitRate:
        row.winner_calls_graded === 0
          ? null
          : row.winner_hits / row.winner_calls_graded,
      methodCallsGraded: row.method_calls_graded,
      methodHits: row.method_hits,
      methodHitRate:
        row.method_calls_graded === 0
          ? null
          : row.method_hits / row.method_calls_graded,
      roundCallsGraded: row.round_calls_graded,
      roundHits: row.round_hits,
      roundHitRate:
        row.round_calls_graded === 0
          ? null
          : row.round_hits / row.round_calls_graded,
      pricedTipsGraded: 0,
      tipRoiAtStatedOdds: null,
    })
  }
  for (const row of tipResult.results) {
    const grade = grades.get(row.capper_id) ?? {
      capperId: row.capper_id,
      capperName: row.capper_name,
      winnerCallsGraded: 0,
      winnerHits: 0,
      winnerHitRate: null,
      methodCallsGraded: 0,
      methodHits: 0,
      methodHitRate: null,
      roundCallsGraded: 0,
      roundHits: 0,
      roundHitRate: null,
      pricedTipsGraded: 0,
      tipRoiAtStatedOdds: null,
    }
    grade.pricedTipsGraded = row.priced_tips_graded
    grade.tipRoiAtStatedOdds =
      row.priced_tip_stake > 0
        ? row.priced_tip_profit / row.priced_tip_stake
        : null
    grades.set(row.capper_id, grade)
  }
  return [...grades.values()].sort((left, right) =>
    left.capperName.localeCompare(right.capperName),
  )
}

import type { Bindings } from '../env'
import { auditEvent } from './audit'
import type { FightEvidence } from '../services/synthesise-card'

function parseEvidence(value: string): FightEvidence {
  try {
    const parsed = JSON.parse(value) as Partial<FightEvidence>
    return {
      missingCurrentMoneylinePrice:
        parsed.missingCurrentMoneylinePrice ?? false,
      supporters: parsed.supporters ?? [],
      dissenters: parsed.dissenters ?? [],
      tracker: parsed.tracker ?? null,
    }
  } catch {
    return {
      missingCurrentMoneylinePrice: false,
      supporters: [],
      dissenters: [],
      tracker: null,
    }
  }
}

export interface SynthesisRecord {
  id: string
  cardId: string
  status: 'accepted'
  recommendedUnits: number
  unspentUnits: number
  fightSummaries: Array<{
    fightId: string
    consensusFighterId: string | null
    weightedShare: number | null
    rawSupportCount: number
    eligibleVoterCount: number
    consensusMethod: string | null
    methodSupportCount: number
    methodEligibleCount: number
    consensusRound: string | null
    roundSupportCount: number
    roundEligibleCount: number
    badges: string[]
    overviewText: string
    evidence: FightEvidence
  }>
  bets: Array<{
    id: string
    selectionText: string
    tier: 'core' | 'value' | 'parlay'
    units: number
    decimalOdds: number
    rationale: string
    supportingCappers: string[]
  }>
}

export async function getCurrentSynthesis(
  db: Bindings['DB'],
  cardId: string,
): Promise<SynthesisRecord | null> {
  const run = await db
    .prepare(
      `SELECT synthesis_runs.id, synthesis_runs.card_id, cards.budget_units
       FROM synthesis_runs
       INNER JOIN cards ON cards.id = synthesis_runs.card_id
       WHERE synthesis_runs.card_id = ? AND synthesis_runs.status = 'accepted'
       ORDER BY synthesis_runs.updated_at DESC
       LIMIT 1`,
    )
    .bind(cardId)
    .first<{ id: string; card_id: string; budget_units: number }>()
  if (!run) return null

  const [summaryResult, betResult, supportResult] = await Promise.all([
    db
      .prepare(
        `SELECT fight_id, consensus_fighter_id, weighted_share,
                raw_support_count, eligible_voter_count, consensus_method,
                method_support_count, method_eligible_count, consensus_round,
                round_support_count, round_eligible_count, badges_json,
                overview_text, evidence_json
         FROM fight_summaries
         WHERE synthesis_run_id = ?
         ORDER BY created_at`,
      )
      .bind(run.id)
      .all<{
        fight_id: string
        consensus_fighter_id: string | null
        weighted_share: string | null
        raw_support_count: number
        eligible_voter_count: number
        consensus_method: string | null
        method_support_count: number
        method_eligible_count: number
        consensus_round: string | null
        round_support_count: number
        round_eligible_count: number
        badges_json: string
        overview_text: string | null
        evidence_json: string
      }>(),
    db
      .prepare(
        `SELECT id, selection_text, tier, recommended_units, recommended_odds,
                rationale
         FROM bets
         WHERE synthesis_run_id = ?
         ORDER BY created_at`,
      )
      .bind(run.id)
      .all<{
        id: string
        selection_text: string
        tier: 'core' | 'value' | 'parlay'
        recommended_units: string
        recommended_odds: string
        rationale: string | null
      }>(),
    db
      .prepare(
        `SELECT bet_support.bet_id, cappers.name
         FROM bet_support
         INNER JOIN cappers ON cappers.id = bet_support.capper_id
         INNER JOIN bets ON bets.id = bet_support.bet_id
         WHERE bets.synthesis_run_id = ?
         ORDER BY cappers.name`,
      )
      .bind(run.id)
      .all<{ bet_id: string; name: string }>(),
  ])

  const supportNames = new Map<string, string[]>()
  for (const support of supportResult.results) {
    const names = supportNames.get(support.bet_id) ?? []
    names.push(support.name)
    supportNames.set(support.bet_id, names)
  }

  const bets = betResult.results.map((bet) => ({
    id: bet.id,
    selectionText: bet.selection_text,
    tier: bet.tier,
    units: Number(bet.recommended_units),
    decimalOdds: Number(bet.recommended_odds),
    rationale: bet.rationale ?? '',
    supportingCappers: supportNames.get(bet.id) ?? [],
  }))
  const recommendedUnits = bets.reduce((total, bet) => total + bet.units, 0)
  return {
    id: run.id,
    cardId: run.card_id,
    status: 'accepted',
    recommendedUnits,
    unspentUnits: Math.max(0, run.budget_units - recommendedUnits),
    fightSummaries: summaryResult.results.map((summary) => ({
      fightId: summary.fight_id,
      consensusFighterId: summary.consensus_fighter_id,
      weightedShare:
        summary.weighted_share === null ? null : Number(summary.weighted_share),
      rawSupportCount: summary.raw_support_count,
      eligibleVoterCount: summary.eligible_voter_count,
      consensusMethod: summary.consensus_method,
      methodSupportCount: summary.method_support_count,
      methodEligibleCount: summary.method_eligible_count,
      consensusRound: summary.consensus_round,
      roundSupportCount: summary.round_support_count,
      roundEligibleCount: summary.round_eligible_count,
      badges: JSON.parse(summary.badges_json) as string[],
      overviewText: summary.overview_text ?? 'Summary unavailable.',
      evidence: parseEvidence(summary.evidence_json),
    })),
    bets,
  }
}

export async function acceptSynthesis(
  db: Bindings['DB'],
  synthesisRunId: string,
  actorEmail: string,
): Promise<void> {
  const run = await db
    .prepare(`SELECT id, card_id, status FROM synthesis_runs WHERE id = ?`)
    .bind(synthesisRunId)
    .first<{ id: string; card_id: string; status: string }>()
  if (!run) throw new Error('Synthesis run not found')
  if (run.status !== 'draft')
    throw new Error('Only a draft synthesis can be accepted')

  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE synthesis_runs
         SET status = 'superseded', updated_at = ?
         WHERE card_id = ? AND status = 'accepted' AND id <> ?`,
      )
      .bind(now, run.card_id, run.id),
    db
      .prepare(
        `UPDATE synthesis_runs SET status = 'accepted', updated_at = ? WHERE id = ?`,
      )
      .bind(now, run.id),
    auditEvent(db, {
      entityType: 'synthesis_run',
      entityId: run.id,
      action: 'accepted',
      actorEmail,
      now,
    }),
  ])
}

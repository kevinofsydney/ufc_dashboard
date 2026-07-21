import type { Bindings } from '../env'

export type WorkflowStageState =
  | 'not_started'
  | 'in_progress'
  | 'needs_attention'
  | 'ready'
  | 'waiting'
  | 'complete'

export interface WorkflowStageStatus {
  state: WorkflowStageState
  summary: string
  blockers: string[]
  counts: Record<string, number>
  stale: boolean
}

export interface CardWorkflowStatus {
  cardId: string
  stages: {
    event: WorkflowStageStatus
    tipperPicks: WorkflowStageStatus
    recommendations: WorkflowStageStatus
    myBets: WorkflowStageStatus
    results: WorkflowStageStatus
  }
}

export async function getWorkflowStatus(
  db: Bindings['DB'],
  cardId: string,
): Promise<CardWorkflowStatus> {
  const card = await db
    .prepare(
      `SELECT id, event_starts_at_utc FROM cards
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(cardId)
    .first<{ id: string; event_starts_at_utc: string | null }>()
  if (!card) throw new Error('Card not found')

  const [fightCounts, sourceCounts, synthesis, betCounts, outcomeCounts] =
    await Promise.all([
      db
        .prepare(
          `SELECT
             COUNT(*) AS fights,
             SUM(CASE WHEN bout_order IS NOT NULL THEN 1 ELSE 0 END) AS ordered,
             SUM(CASE WHEN priced_sides = 2 THEN 1 ELSE 0 END) AS fully_priced
           FROM (
             SELECT fights.id, fights.bout_order,
                    COUNT(DISTINCT CASE
                      WHEN market_prices.market_type = 'moneyline'
                       AND market_prices.deleted_at IS NULL
                      THEN market_prices.selection_fighter_id END) AS priced_sides
             FROM fights
             LEFT JOIN market_prices ON market_prices.fight_id = fights.id
             WHERE fights.card_id = ? AND fights.deleted_at IS NULL
               AND fights.status = 'scheduled'
             GROUP BY fights.id, fights.bout_order
           )`,
        )
        .bind(cardId)
        .first<{ fights: number; ordered: number; fully_priced: number }>(),
      db
        .prepare(
          `SELECT
             COUNT(DISTINCT CASE WHEN extraction_runs.status = 'accepted'
               THEN sources.id END) AS accepted,
             COUNT(DISTINCT CASE WHEN extraction_runs.status = 'accepted'
               THEN sources.primary_capper_id END) AS accepted_cappers,
             COUNT(DISTINCT CASE WHEN extraction_runs.status IN ('needs_review', 'failed')
               THEN extraction_runs.id END) AS attention,
             COUNT(DISTINCT CASE WHEN capper_tips.review_status IN ('accepted', 'corrected')
               THEN capper_tips.id END) AS tips
           FROM sources
           LEFT JOIN extraction_runs ON extraction_runs.source_id = sources.id
           LEFT JOIN capper_tips ON capper_tips.source_id = sources.id
             AND capper_tips.extraction_run_id = sources.active_extraction_run_id
           WHERE sources.card_id = ?`,
        )
        .bind(cardId)
        .first<{
          accepted: number
          accepted_cappers: number
          attention: number
          tips: number
        }>(),
      db
        .prepare(
          `SELECT status, completed_at,
             CASE WHEN EXISTS (
               SELECT 1 FROM sources
               WHERE sources.card_id = synthesis_runs.card_id
                 AND sources.updated_at > COALESCE(synthesis_runs.completed_at, '')
             ) OR EXISTS (
               SELECT 1 FROM market_prices
               WHERE market_prices.card_id = synthesis_runs.card_id
                 AND market_prices.updated_at > COALESCE(synthesis_runs.completed_at, '')
             ) OR EXISTS (
               SELECT 1 FROM fights
               WHERE fights.card_id = synthesis_runs.card_id
                 AND fights.updated_at > COALESCE(synthesis_runs.completed_at, '')
             ) THEN 1 ELSE 0 END AS stale
           FROM synthesis_runs WHERE card_id = ?
           ORDER BY CASE status WHEN 'accepted' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                    created_at DESC LIMIT 1`,
        )
        .bind(cardId)
        .first<{
          status: string
          completed_at: string | null
          stale: number
        }>(),
      db
        .prepare(
          `SELECT
             SUM(CASE WHEN state = 'recommended' THEN 1 ELSE 0 END) AS recommended,
             SUM(CASE WHEN state = 'placed' THEN 1 ELSE 0 END) AS placed,
             SUM(CASE WHEN state = 'settled' THEN 1 ELSE 0 END) AS settled,
             COUNT(*) AS total
           FROM bets WHERE card_id = ?`,
        )
        .bind(cardId)
        .first<{
          recommended: number
          placed: number
          settled: number
          total: number
        }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS final_outcomes
           FROM fight_outcomes
           INNER JOIN fights ON fights.id = fight_outcomes.fight_id
           WHERE fights.card_id = ? AND fights.deleted_at IS NULL
             AND fight_outcomes.status <> 'pending'`,
        )
        .bind(cardId)
        .first<{ final_outcomes: number }>(),
    ])

  const fights = fightCounts?.fights ?? 0
  const ordered = fightCounts?.ordered ?? 0
  const fullyPriced = fightCounts?.fully_priced ?? 0
  const eventBlockers: string[] = []
  if (fights === 0) eventBlockers.push('Add or import the fight card')
  if (ordered < fights) eventBlockers.push('Review the bout order')
  if (fullyPriced < fights)
    eventBlockers.push('Add both moneylines for every fight')

  const acceptedSources = sourceCounts?.accepted ?? 0
  const acceptedCappers = sourceCounts?.accepted_cappers ?? 0
  const attentionSources = sourceCounts?.attention ?? 0
  const tips = sourceCounts?.tips ?? 0
  const recommended = betCounts?.recommended ?? 0
  const placed = betCounts?.placed ?? 0
  const settled = betCounts?.settled ?? 0
  const finalOutcomes = outcomeCounts?.final_outcomes ?? 0
  const eventStarted = card.event_starts_at_utc
    ? Date.parse(card.event_starts_at_utc) <= Date.now()
    : false

  return {
    cardId,
    stages: {
      event: {
        state:
          fights === 0
            ? 'not_started'
            : eventBlockers.length > 0
              ? 'needs_attention'
              : 'ready',
        summary: `${fights} fights · ${fullyPriced} fully priced`,
        blockers: eventBlockers,
        counts: { fights, ordered, fullyPriced },
        stale: false,
      },
      tipperPicks: {
        state:
          acceptedSources === 0
            ? 'not_started'
            : attentionSources > 0
              ? 'needs_attention'
              : 'ready',
        summary: `${acceptedSources} accepted sources · ${tips} tips`,
        blockers:
          attentionSources > 0
            ? [
                `${attentionSources} extraction${attentionSources === 1 ? '' : 's'} need review`,
              ]
            : [],
        counts: {
          acceptedSources,
          acceptedCappers,
          reviewedTips: tips,
          attentionSources,
        },
        stale: false,
      },
      recommendations: {
        state: !synthesis
          ? 'not_started'
          : synthesis.stale
            ? 'needs_attention'
            : synthesis.status === 'accepted'
              ? 'complete'
              : 'in_progress',
        summary: !synthesis
          ? 'No synthesis yet'
          : synthesis.stale
            ? 'Inputs changed · refresh recommendations'
            : synthesis.status === 'accepted'
              ? 'Recommendations accepted'
              : 'Draft ready for review',
        blockers: synthesis?.stale ? ['Recommendations are stale'] : [],
        counts: {
          acceptedSources,
          acceptedCappers,
          reviewedTips: tips,
          fullyPricedFights: fullyPriced,
          openConflicts: attentionSources,
        },
        stale: Boolean(synthesis?.stale),
      },
      myBets: {
        state:
          recommended > 0
            ? 'needs_attention'
            : placed + settled > 0
              ? 'complete'
              : 'not_started',
        summary: `${placed} placed · ${recommended} undecided`,
        blockers:
          recommended > 0
            ? [
                `${recommended} recommendation${recommended === 1 ? '' : 's'} still need a decision`,
              ]
            : [],
        counts: { recommended, placed, settled },
        stale: false,
      },
      results: {
        state:
          !eventStarted && finalOutcomes === 0
            ? 'waiting'
            : fights === 0 || finalOutcomes < fights || placed > 0
              ? 'needs_attention'
              : 'complete',
        summary: `${finalOutcomes}/${fights} results · ${settled} bets settled`,
        blockers: [
          ...(finalOutcomes < fights
            ? [`${fights - finalOutcomes} fight results still pending`]
            : []),
          ...(placed > 0
            ? [`${placed} placed bet${placed === 1 ? '' : 's'} still unsettled`]
            : []),
        ],
        counts: { fights, finalOutcomes, placed, settled },
        stale: false,
      },
    },
  }
}

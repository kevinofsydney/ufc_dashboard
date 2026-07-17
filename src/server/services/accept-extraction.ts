import {
  individualExtractionSchema,
  stripMarkdownFences,
} from '../../shared/schemas/extraction'
import { parseOdds } from '../../shared/maths/odds'
import type { Bindings } from '../env'
import { getExtractionRun } from '../repositories/extractions'
import { listFights } from '../repositories/fights'
import { getSource } from '../repositories/sources'
import {
  acceptAggregatorExtraction,
  acceptStatsTrackerExtraction,
} from './accept-special-extraction'

export async function acceptExtraction(
  env: Bindings,
  runId: string,
  actorEmail: string,
  reviewedOutput: unknown,
): Promise<void> {
  const run = await getExtractionRun(env.DB, runId)
  if (!run) throw new Error('Extraction run not found')
  if (run.status !== 'needs_review') {
    throw new Error('Only a review-ready extraction can be accepted')
  }
  if (!run.rawResponse) throw new Error('The extraction has no model output')

  const source = await getSource(env.DB, run.sourceId)
  if (!source) throw new Error('Source not found')
  if (source.extractionMode === 'aggregator') {
    return acceptAggregatorExtraction(
      env,
      run,
      source,
      actorEmail,
      reviewedOutput,
    )
  }
  if (source.extractionMode === 'stats_tracker') {
    return acceptStatsTrackerExtraction(
      env,
      run,
      source,
      actorEmail,
      reviewedOutput,
    )
  }
  if (!source.primaryCapperId) {
    throw new Error('The source has no primary capper')
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(stripMarkdownFences(run.rawResponse))
  } catch {
    throw new Error('The extraction output is not valid JSON')
  }
  const original = individualExtractionSchema.safeParse(decoded)
  if (!original.success)
    throw new Error('The extraction output is no longer valid')
  const reviewed = individualExtractionSchema.safeParse(reviewedOutput)
  if (!reviewed.success) throw new Error('The reviewed extraction is invalid')
  if (reviewed.data.unmatched.length > 0) {
    throw new Error('Resolve unmatched fighter names before accepting this run')
  }
  const reviewStatus =
    JSON.stringify(original.data) === JSON.stringify(reviewed.data)
      ? 'accepted'
      : 'corrected'

  const fights = await listFights(env.DB, source.cardId)
  const fightMap = new Map(fights.map((fight) => [fight.id, fight]))
  const opinionFightIds = new Set<string>()
  const statements: D1PreparedStatement[] = []
  const now = new Date().toISOString()

  for (const opinion of reviewed.data.opinions) {
    const fight = fightMap.get(opinion.fight_id)
    if (!fight)
      throw new Error('An opinion references a fight outside this card')
    if (opinionFightIds.has(opinion.fight_id)) {
      throw new Error(
        'A capper can have only one final winner opinion per fight',
      )
    }
    opinionFightIds.add(opinion.fight_id)
    const fighterIds = new Set([fight.fighterA.id, fight.fighterB.id])
    if (!fighterIds.has(opinion.picked_fighter_id)) {
      throw new Error('An opinion references a fighter outside its fight')
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO fight_opinions (
           id, extraction_run_id, source_id, card_id, fight_id, capper_id,
           picked_fighter_id, method, round, confidence, reasoning_summary,
           provenance, review_status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'direct', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        run.id,
        source.id,
        source.cardId,
        opinion.fight_id,
        source.primaryCapperId,
        opinion.picked_fighter_id,
        opinion.method,
        opinion.round,
        opinion.confidence,
        opinion.reasoning,
        reviewStatus,
        now,
        now,
      ),
    )
  }

  for (const tip of reviewed.data.tips) {
    if (tip.fight_id) {
      const fight = fightMap.get(tip.fight_id)
      if (!fight) throw new Error('A tip references a fight outside this card')
      if (
        tip.selection_fighter_id &&
        ![fight.fighterA.id, fight.fighterB.id].includes(
          tip.selection_fighter_id,
        )
      ) {
        throw new Error('A tip references a fighter outside its fight')
      }
    }
    let decimalOdds: string | null = null
    if (tip.odds_mentioned_raw) {
      try {
        decimalOdds = parseOdds(tip.odds_mentioned_raw).toFixed(4)
      } catch {
        decimalOdds = null
      }
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO capper_tips (
           id, opinion_id, extraction_run_id, source_id, card_id, fight_id,
           capper_id, market_type, selection_fighter_id, method, round,
           line_value, selection_text, odds_mentioned_raw,
           odds_mentioned_decimal, stated_stake_units, confidence,
           reasoning_summary, provenance, review_status, created_at, updated_at
         ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'direct', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        run.id,
        source.id,
        source.cardId,
        tip.fight_id,
        source.primaryCapperId,
        tip.market_type,
        tip.selection_fighter_id,
        tip.method,
        tip.round,
        tip.line_value,
        tip.selection_text,
        tip.odds_mentioned_raw,
        decimalOdds,
        tip.stated_stake_units?.toString() ?? null,
        tip.confidence,
        tip.reasoning,
        reviewStatus,
        now,
        now,
      ),
    )
  }

  statements.push(
    env.DB.prepare(
      `UPDATE extraction_runs
       SET status = 'accepted', reviewed_response = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(JSON.stringify(reviewed.data), now, run.id),
    env.DB.prepare(
      `UPDATE sources SET active_extraction_run_id = ?, updated_at = ? WHERE id = ?`,
    ).bind(run.id, now, source.id),
    env.DB.prepare(
      `INSERT INTO audit_events (
         id, entity_type, entity_id, action, actor_email, details_json, created_at
       ) VALUES (?, 'extraction_run', ?, 'accepted', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      run.id,
      actorEmail,
      JSON.stringify({
        opinions: reviewed.data.opinions.length,
        tips: reviewed.data.tips.length,
        reviewStatus,
      }),
      now,
    ),
  )

  await env.DB.batch(statements)
}

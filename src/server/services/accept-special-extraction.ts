import { parseOdds } from '../../shared/maths/odds'
import {
  individualExtractionSchema,
  statsTrackerExtractionSchema,
  stripMarkdownFences,
} from '../../shared/schemas/extraction'
import type { Bindings } from '../env'
import type { ExtractionRunRecord } from '../repositories/extractions'
import { listFights } from '../repositories/fights'
import type { SourceRecord } from '../repositories/sources'

function decodeRaw(rawResponse: string): unknown {
  try {
    return JSON.parse(stripMarkdownFences(rawResponse))
  } catch {
    throw new Error('The extraction output is not valid JSON')
  }
}

function normalizeAlias(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function capperResolver(db: Bindings['DB']) {
  const result = await db
    .prepare(
      `SELECT cappers.id, cappers.name, capper_aliases.alias_normalized
       FROM cappers
       LEFT JOIN capper_aliases ON capper_aliases.capper_id = cappers.id
       WHERE cappers.active = 1`,
    )
    .all<{ id: string; name: string; alias_normalized: string | null }>()
  const validIds = new Set(result.results.map((row) => row.id))
  const aliases = new Map<string, string | null>()
  for (const row of result.results) {
    for (const alias of [normalizeAlias(row.name), row.alias_normalized]) {
      if (!alias) continue
      const existing = aliases.get(alias)
      aliases.set(alias, existing && existing !== row.id ? null : row.id)
    }
  }
  return (
    explicitId: string | null | undefined,
    raw: string | null | undefined,
  ) => {
    if (explicitId && validIds.has(explicitId)) return explicitId
    const resolved = raw ? aliases.get(normalizeAlias(raw)) : null
    if (!resolved) {
      throw new Error(
        `Resolve the capper attribution for “${raw ?? 'unknown'}”`,
      )
    }
    return resolved
  }
}

function acceptanceStatements(
  db: Bindings['DB'],
  run: ExtractionRunRecord,
  source: SourceRecord,
  actorEmail: string,
  reviewed: unknown,
  details: Record<string, unknown>,
  now: string,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE extraction_runs
         SET status = 'accepted', reviewed_response = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(JSON.stringify(reviewed), now, run.id),
    db
      .prepare(
        `UPDATE sources SET active_extraction_run_id = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(run.id, now, source.id),
    db
      .prepare(
        `INSERT INTO audit_events (
           id, entity_type, entity_id, action, actor_email, details_json, created_at
         ) VALUES (?, 'extraction_run', ?, 'accepted', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        run.id,
        actorEmail,
        JSON.stringify(details),
        now,
      ),
  ]
}

export async function acceptAggregatorExtraction(
  env: Bindings,
  run: ExtractionRunRecord,
  source: SourceRecord,
  actorEmail: string,
  reviewedOutput: unknown,
): Promise<void> {
  const original = individualExtractionSchema.safeParse(
    decodeRaw(run.rawResponse ?? ''),
  )
  const reviewed = individualExtractionSchema.safeParse(reviewedOutput)
  if (!original.success || !reviewed.success) {
    throw new Error('The reviewed aggregator extraction is invalid')
  }
  if (
    reviewed.data.unmatched.length > 0 ||
    (reviewed.data.unmatched_attribution?.length ?? 0) > 0
  ) {
    throw new Error('Resolve all fighter and capper attribution items first')
  }

  const resolveCapper = await capperResolver(env.DB)
  const fights = await listFights(env.DB, source.cardId)
  const fightMap = new Map(fights.map((fight) => [fight.id, fight]))
  const reviewStatus =
    JSON.stringify(original.data) === JSON.stringify(reviewed.data)
      ? 'accepted'
      : 'corrected'
  const statements: D1PreparedStatement[] = []
  const opinionKeys = new Set<string>()
  const now = new Date().toISOString()

  for (const opinion of reviewed.data.opinions) {
    const fight = fightMap.get(opinion.fight_id)
    if (!fight)
      throw new Error('An opinion references a fight outside this card')
    if (
      ![fight.fighterA.id, fight.fighterB.id].includes(
        opinion.picked_fighter_id,
      )
    ) {
      throw new Error('An opinion references a fighter outside its fight')
    }
    const capperId = resolveCapper(
      opinion.attributed_to_capper_id,
      opinion.attributed_to_raw,
    )
    const key = `${opinion.fight_id}:${capperId}`
    if (opinionKeys.has(key)) {
      throw new Error(
        'An aggregator can credit only one final opinion per capper and fight',
      )
    }
    opinionKeys.add(key)
    statements.push(
      env.DB.prepare(
        `INSERT INTO fight_opinions (
           id, extraction_run_id, source_id, card_id, fight_id, capper_id,
           picked_fighter_id, method, round, confidence, reasoning_summary,
           provenance, review_status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aggregated', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        run.id,
        source.id,
        source.cardId,
        opinion.fight_id,
        capperId,
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
    const capperId = resolveCapper(
      tip.attributed_to_capper_id,
      tip.attributed_to_raw,
    )
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
         ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aggregated', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        run.id,
        source.id,
        source.cardId,
        tip.fight_id,
        capperId,
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
    ...acceptanceStatements(
      env.DB,
      run,
      source,
      actorEmail,
      reviewed.data,
      {
        opinions: reviewed.data.opinions.length,
        tips: reviewed.data.tips.length,
        reviewStatus,
      },
      now,
    ),
  )
  await env.DB.batch(statements)
}

export async function acceptStatsTrackerExtraction(
  env: Bindings,
  run: ExtractionRunRecord,
  source: SourceRecord,
  actorEmail: string,
  reviewedOutput: unknown,
): Promise<void> {
  const original = statsTrackerExtractionSchema.safeParse(
    decodeRaw(run.rawResponse ?? ''),
  )
  const reviewed = statsTrackerExtractionSchema.safeParse(reviewedOutput)
  if (!original.success || !reviewed.success) {
    throw new Error('The reviewed stats-tracker extraction is invalid')
  }
  if (reviewed.data.unmatched.length > 0) {
    throw new Error('Resolve all unmatched fighter names first')
  }

  const fights = await listFights(env.DB, source.cardId)
  const fightMap = new Map(fights.map((fight) => [fight.id, fight]))
  const seenFights = new Set<string>()
  const statements: D1PreparedStatement[] = []
  const now = new Date().toISOString()
  for (const stat of reviewed.data.stats) {
    const fight = fightMap.get(stat.fight_id)
    if (!fight)
      throw new Error('Tracker data references a fight outside this card')
    if (seenFights.has(stat.fight_id)) {
      throw new Error('Tracker data contains more than one row for a fight')
    }
    seenFights.add(stat.fight_id)
    const fighterIds = new Set([fight.fighterA.id, fight.fighterB.id])
    for (const mov of [...(stat.mov_counts ?? []), ...(stat.best_mov ?? [])]) {
      if (!fighterIds.has(mov.fighter_id)) {
        throw new Error(
          'Tracker MOV data references a fighter outside its fight',
        )
      }
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO fight_stats (
           id, extraction_run_id, fight_id, source_id, all_channels_json,
           best_overall_json, best_favourite_json, best_underdog_json,
           mov_counts_json, best_mov_json, bookmaker_note, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        run.id,
        stat.fight_id,
        source.id,
        stat.all_channels ? JSON.stringify(stat.all_channels) : null,
        stat.best_overall ? JSON.stringify(stat.best_overall) : null,
        stat.best_favourite ? JSON.stringify(stat.best_favourite) : null,
        stat.best_underdog ? JSON.stringify(stat.best_underdog) : null,
        stat.mov_counts ? JSON.stringify(stat.mov_counts) : null,
        stat.best_mov ? JSON.stringify(stat.best_mov) : null,
        stat.bookmaker_note,
        now,
        now,
      ),
    )
  }
  statements.push(
    ...acceptanceStatements(
      env.DB,
      run,
      source,
      actorEmail,
      reviewed.data,
      { fights: reviewed.data.stats.length },
      now,
    ),
  )
  await env.DB.batch(statements)
}

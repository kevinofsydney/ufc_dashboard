import { z } from 'zod'
import fightOverviewPrompt from '../../../prompts/fight-overviews.md?raw'
import slateRationalePrompt from '../../../prompts/slate-rationales.md?raw'
import { synthesisConfig } from '../../shared/config/synthesis'
import { allocateSlate, type BetCandidate } from '../../shared/maths/allocation'
import {
  calculateWinnerConsensus,
  type Confidence,
} from '../../shared/maths/consensus'
import type { Bindings } from '../env'
import { callModel } from '../llm/call-model'
import { providerConfigurationFromEnv } from '../llm/configuration'
import type { ProviderConfiguration } from '../llm/provider'

const fightOverviewsSchema = z.object({
  overviews: z.array(
    z.object({
      fight_id: z.string().min(1),
      overview: z.string().min(1).max(900),
    }),
  ),
})

const slateRationalesSchema = z.object({
  rationales: z.array(
    z.object({
      bet_candidate_id: z.string().min(1),
      rationale: z.string().min(1).max(700),
    }),
  ),
})

interface OpinionRow {
  id: string
  fight_id: string
  capper_id: string
  picked_fighter_id: string
  confidence: Confidence
  method: 'ko_tko' | 'submission' | 'decision' | null
  round: '1' | '2' | '3' | '4' | '5' | 'distance' | null
  capper_name: string
  reasoning_summary: string
  provenance: 'direct' | 'aggregated'
}

interface TipRow {
  id: string
  fight_id: string | null
  capper_id: string
  selection_fighter_id: string | null
  market_type: string
  confidence: Confidence
  capper_name: string
  reasoning_summary: string
}

interface StatsRow {
  fight_id: string
  all_channels_json: string | null
  best_overall_json: string | null
  best_favourite_json: string | null
  best_underdog_json: string | null
  mov_counts_json: string | null
  best_mov_json: string | null
  bookmaker_note: string | null
}

interface TrackerSplit {
  fighter_a_count: number | null
  fighter_b_count: number | null
  total: number | null
}

export interface FightEvidence {
  missingCurrentMoneylinePrice: boolean
  supporters: Array<{
    capperId: string
    capperName: string
    confidence: Confidence
    reasoning: string
    provenance: 'direct' | 'aggregated'
  }>
  dissenters: Array<{
    capperId: string
    capperName: string
    pickedFighterId: string
    confidence: Confidence
    reasoning: string
  }>
  tracker: {
    allChannels: TrackerSplit | null
    bestOverall: TrackerSplit | null
    bestFavourite: TrackerSplit | null
    bestUnderdog: TrackerSplit | null
    movCounts: unknown
    bestMov: unknown
    bookmakerNote: string | null
  } | null
}

interface PriceRow {
  id: string
  fight_id: string | null
  selection_fighter_id: string | null
  market_type: string
  selection_text: string
  decimal_odds: string
  captured_at: string
}

export interface SynthesisResult {
  id: string
  cardId: string
  status: 'draft'
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
  bets: Array<
    ReturnType<typeof allocateSlate>['bets'][number] & {
      rationale: string
      supportingCappers: string[]
    }
  >
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function plurality<T extends string>(
  values: Array<T | null>,
): {
  value: T | null
  support: number
  eligible: number
} {
  const specified = values.filter((value): value is T => value !== null)
  const counts = new Map<T, number>()
  for (const value of specified) counts.set(value, (counts.get(value) ?? 0) + 1)
  const ordered = [...counts.entries()].sort(
    ([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || leftValue.localeCompare(rightValue),
  )
  if (ordered.length === 0) return { value: null, support: 0, eligible: 0 }
  if (ordered[0]?.[1] === ordered[1]?.[1]) {
    return {
      value: null,
      support: ordered[0]?.[1] ?? 0,
      eligible: specified.length,
    }
  }
  return {
    value: ordered[0]?.[0] ?? null,
    support: ordered[0]?.[1] ?? 0,
    eligible: specified.length,
  }
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function trackerMajority(
  split: TrackerSplit | null,
  fighterAId: string,
  fighterBId: string,
): string | null {
  if (
    !split ||
    split.fighter_a_count === null ||
    split.fighter_b_count === null ||
    split.fighter_a_count === split.fighter_b_count
  ) {
    return null
  }
  return split.fighter_a_count > split.fighter_b_count ? fighterAId : fighterBId
}

function sentenceCount(value: string): number {
  return value
    .split(/[.!?]+(?:\s|$)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length
}

export async function synthesiseCard(
  env: Bindings,
  cardId: string,
  configurationOverride?: ProviderConfiguration | null,
): Promise<SynthesisResult> {
  const card = await env.DB.prepare(
    `SELECT id, budget_units FROM cards WHERE id = ?`,
  )
    .bind(cardId)
    .first<{ id: string; budget_units: number }>()
  if (!card) throw new Error('Card not found')

  const [opinionResult, tipResult, priceResult, fightResult, statsResult] =
    await Promise.all([
      env.DB.prepare(
        `SELECT fight_opinions.id, fight_opinions.fight_id,
              fight_opinions.capper_id, fight_opinions.picked_fighter_id,
              fight_opinions.confidence, fight_opinions.method,
              fight_opinions.round, cappers.name AS capper_name,
              fight_opinions.reasoning_summary, fight_opinions.provenance
       FROM fight_opinions
       INNER JOIN sources ON sources.id = fight_opinions.source_id
       INNER JOIN cappers ON cappers.id = fight_opinions.capper_id
       INNER JOIN fight_participants current_participant
         ON current_participant.fight_id = fight_opinions.fight_id
        AND current_participant.fighter_id = fight_opinions.picked_fighter_id
       WHERE fight_opinions.card_id = ?
         AND fight_opinions.review_status IN ('accepted', 'corrected')
         AND sources.active_extraction_run_id = fight_opinions.extraction_run_id
       ORDER BY fight_opinions.fight_id, fight_opinions.capper_id,
                CASE fight_opinions.provenance WHEN 'direct' THEN 0 ELSE 1 END,
                fight_opinions.created_at DESC`,
      )
        .bind(cardId)
        .all<OpinionRow>(),
      env.DB.prepare(
        `SELECT capper_tips.id, capper_tips.fight_id, capper_tips.capper_id,
              capper_tips.selection_fighter_id,
              capper_tips.market_type, capper_tips.confidence,
              cappers.name AS capper_name, capper_tips.reasoning_summary
       FROM capper_tips
       INNER JOIN sources ON sources.id = capper_tips.source_id
       INNER JOIN cappers ON cappers.id = capper_tips.capper_id
       WHERE capper_tips.card_id = ?
         AND capper_tips.review_status IN ('accepted', 'corrected')
         AND sources.active_extraction_run_id = capper_tips.extraction_run_id
       ORDER BY capper_tips.fight_id, capper_tips.capper_id,
                capper_tips.market_type, capper_tips.selection_fighter_id,
                capper_tips.confidence`,
      )
        .bind(cardId)
        .all<TipRow>(),
      env.DB.prepare(
        `SELECT market_prices.id, market_prices.fight_id,
              market_prices.selection_fighter_id, market_prices.market_type,
              market_prices.selection_text, market_prices.decimal_odds,
              market_prices.captured_at
       FROM market_prices
       INNER JOIN fight_participants current_price_participant
         ON current_price_participant.fight_id = market_prices.fight_id
        AND current_price_participant.fighter_id = market_prices.selection_fighter_id
       WHERE market_prices.card_id = ? AND market_prices.deleted_at IS NULL
       ORDER BY market_prices.captured_at DESC, market_prices.created_at DESC`,
      )
        .bind(cardId)
        .all<PriceRow>(),
      env.DB.prepare(
        `SELECT fights.id,
                participant_a.fighter_id AS fighter_a_id,
                participant_b.fighter_id AS fighter_b_id
         FROM fights
         INNER JOIN fight_participants participant_a
           ON participant_a.fight_id = fights.id AND participant_a.side = 'a'
         INNER JOIN fight_participants participant_b
           ON participant_b.fight_id = fights.id AND participant_b.side = 'b'
       WHERE fights.card_id = ?
         AND fights.deleted_at IS NULL
         AND fights.status = 'scheduled'
       ORDER BY fights.bout_order, fights.created_at`,
      )
        .bind(cardId)
        .all<{ id: string; fighter_a_id: string; fighter_b_id: string }>(),
      env.DB.prepare(
        `SELECT fight_stats.fight_id, fight_stats.all_channels_json,
                fight_stats.best_overall_json, fight_stats.best_favourite_json,
                fight_stats.best_underdog_json, fight_stats.mov_counts_json,
                fight_stats.best_mov_json, fight_stats.bookmaker_note
         FROM fight_stats
         INNER JOIN sources ON sources.id = fight_stats.source_id
         WHERE sources.card_id = ?
           AND sources.active_extraction_run_id = fight_stats.extraction_run_id
         ORDER BY fight_stats.created_at DESC`,
      )
        .bind(cardId)
        .all<StatsRow>(),
    ])

  const distinctOpinionRows = new Map<string, OpinionRow>()
  for (const opinion of opinionResult.results) {
    const key = `${opinion.fight_id}:${opinion.capper_id}`
    if (!distinctOpinionRows.has(key)) distinctOpinionRows.set(key, opinion)
  }
  const opinions = [...distinctOpinionRows.values()]

  const latestPriceRows = new Map<string, PriceRow>()
  for (const price of priceResult.results) {
    const key = `${price.fight_id}:${price.market_type}:${price.selection_fighter_id}`
    if (!latestPriceRows.has(key)) latestPriceRows.set(key, price)
  }
  const prices = [...latestPriceRows.values()]
  const latestStats = new Map<string, StatsRow>()
  for (const stats of statsResult.results) {
    if (!latestStats.has(stats.fight_id)) latestStats.set(stats.fight_id, stats)
  }

  const summaries: SynthesisResult['fightSummaries'] = []
  const sharesByFight = new Map<string, Record<string, number>>()
  for (const fight of fightResult.results) {
    const fightOpinions = opinions.filter(
      (opinion) => opinion.fight_id === fight.id,
    )
    const consensus = calculateWinnerConsensus(
      fightOpinions.map((opinion) => ({
        capperId: opinion.capper_id,
        fighterId: opinion.picked_fighter_id,
        confidence: opinion.confidence,
      })),
      synthesisConfig.confidenceMultipliers,
    )
    sharesByFight.set(fight.id, consensus.shares)
    const orderedShares = Object.entries(consensus.shares).sort(
      ([leftId, leftShare], [rightId, rightShare]) =>
        rightShare - leftShare || leftId.localeCompare(rightId),
    )
    const tied = orderedShares[0]?.[1] === orderedShares[1]?.[1]
    const consensusFighterId = tied ? null : (orderedShares[0]?.[0] ?? null)
    const weightedShare = consensusFighterId
      ? (consensus.shares[consensusFighterId] ?? null)
      : null
    const supporting = consensusFighterId
      ? fightOpinions.filter(
          (opinion) => opinion.picked_fighter_id === consensusFighterId,
        )
      : []
    const dissenting = consensusFighterId
      ? fightOpinions.filter(
          (opinion) => opinion.picked_fighter_id !== consensusFighterId,
        )
      : []
    const method = plurality(supporting.map((opinion) => opinion.method))
    const round = plurality(supporting.map((opinion) => opinion.round))
    const rawSupportCount = consensusFighterId
      ? (consensus.supportCounts[consensusFighterId] ?? 0)
      : 0
    const eligibleVoterCount = fightOpinions.length
    const rawShare =
      eligibleVoterCount === 0 ? 0 : rawSupportCount / eligibleVoterCount
    const badges: string[] = []
    if (eligibleVoterCount >= 2 && rawSupportCount === eligibleVoterCount) {
      badges.push('UNANIMOUS')
    }
    if (
      eligibleVoterCount >= 4 &&
      Object.keys(consensus.supportCounts).length > 1 &&
      rawShare <= 0.6
    ) {
      badges.push('SPLIT')
    }
    const stats = latestStats.get(fight.id)
    const allChannels = parseJson<TrackerSplit>(
      stats?.all_channels_json ?? null,
    )
    const bestOverall = parseJson<TrackerSplit>(
      stats?.best_overall_json ?? null,
    )
    const crowdMajority = trackerMajority(
      allChannels,
      fight.fighter_a_id,
      fight.fighter_b_id,
    )
    const sharpMajority = trackerMajority(
      bestOverall,
      fight.fighter_a_id,
      fight.fighter_b_id,
    )
    if (crowdMajority && sharpMajority && crowdMajority !== sharpMajority) {
      badges.push('CROWD_VS_SHARPS')
    }
    const evidence: FightEvidence = {
      missingCurrentMoneylinePrice:
        consensusFighterId !== null &&
        !prices.some(
          (price) =>
            price.fight_id === fight.id &&
            price.market_type === 'moneyline' &&
            price.selection_fighter_id === consensusFighterId,
        ),
      supporters: supporting.map((opinion) => ({
        capperId: opinion.capper_id,
        capperName: opinion.capper_name,
        confidence: opinion.confidence,
        reasoning: opinion.reasoning_summary,
        provenance: opinion.provenance,
      })),
      dissenters: dissenting.map((opinion) => ({
        capperId: opinion.capper_id,
        capperName: opinion.capper_name,
        pickedFighterId: opinion.picked_fighter_id,
        confidence: opinion.confidence,
        reasoning: opinion.reasoning_summary,
      })),
      tracker: stats
        ? {
            allChannels,
            bestOverall,
            bestFavourite: parseJson<TrackerSplit>(stats.best_favourite_json),
            bestUnderdog: parseJson<TrackerSplit>(stats.best_underdog_json),
            movCounts: parseJson<unknown>(stats.mov_counts_json),
            bestMov: parseJson<unknown>(stats.best_mov_json),
            bookmakerNote: stats.bookmaker_note,
          }
        : null,
    }
    const overviewText = consensusFighterId
      ? `${rawSupportCount} of ${eligibleVoterCount} reviewed cappers support the consensus side${method.value ? `, most often by ${method.value.replace('_', '/')}` : ''}.${dissenting.length > 0 ? ` ${dissenting.length} reviewed capper${dissenting.length === 1 ? '' : 's'} dissent.` : ''}`
      : eligibleVoterCount === 0
        ? 'No reviewed winner opinions are available.'
        : 'Reviewed opinions are tied; no consensus side is displayed.'

    summaries.push({
      fightId: fight.id,
      consensusFighterId,
      weightedShare,
      rawSupportCount,
      eligibleVoterCount,
      consensusMethod: method.value,
      methodSupportCount: method.support,
      methodEligibleCount: method.eligible,
      consensusRound: round.value,
      roundSupportCount: round.support,
      roundEligibleCount: round.eligible,
      badges,
      overviewText,
      evidence,
    })
  }

  const candidates: BetCandidate[] = prices
    .filter(
      (price) =>
        price.fight_id &&
        price.selection_fighter_id &&
        price.market_type === 'moneyline',
    )
    .map((price) => {
      const strongCappers = new Set(
        tipResult.results
          .filter(
            (tip) =>
              tip.fight_id === price.fight_id &&
              tip.selection_fighter_id === price.selection_fighter_id &&
              tip.market_type === 'moneyline' &&
              (tip.confidence === 'solid' || tip.confidence === 'lock'),
          )
          .map((tip) => tip.capper_id),
      )
      const summary = summaries.find((item) => item.fightId === price.fight_id)
      return {
        id: price.id,
        fightId: price.fight_id as string,
        selectionFighterId: price.selection_fighter_id as string,
        selectionText: price.selection_text,
        marketType: 'moneyline' as const,
        decimalOdds: Number(price.decimal_odds),
        consensusShare:
          sharesByFight.get(price.fight_id as string)?.[
            price.selection_fighter_id as string
          ] ?? 0,
        supportCount:
          summary?.consensusFighterId === price.selection_fighter_id
            ? summary.rawSupportCount
            : 0,
        explicitSolidOrLockSupport: strongCappers.size,
      }
    })

  const allocation = allocateSlate(candidates, card.budget_units)
  const llmConfiguration =
    configurationOverride ?? providerConfigurationFromEnv(env)
  if (llmConfiguration && summaries.length > 0) {
    try {
      const generated = await callModel(
        {
          task: 'fight_overviews',
          schema: fightOverviewsSchema,
          temperature: 0,
          messages: [
            { role: 'system', content: fightOverviewPrompt },
            {
              role: 'user',
              content: JSON.stringify({ fights: summaries }),
            },
          ],
        },
        llmConfiguration,
      )
      const overviewByFight = new Map(
        generated.data.overviews
          .filter((overview) => sentenceCount(overview.overview) <= 3)
          .map((overview) => [overview.fight_id, overview.overview]),
      )
      for (const summary of summaries) {
        summary.overviewText =
          overviewByFight.get(summary.fightId) ?? summary.overviewText
      }
    } catch (error) {
      console.warn('fight_overview_generation_failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
  const inputSnapshot = JSON.stringify({
    opinions,
    tips: tipResult.results,
    prices,
  })
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO synthesis_runs (
         id, card_id, status, config_snapshot_json, input_snapshot_hash,
         prompt_versions_json, started_at, completed_at, created_at, updated_at
       ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      cardId,
      JSON.stringify(synthesisConfig),
      await sha256(inputSnapshot),
      JSON.stringify({ fightOverviews: 'v1', slateRationales: 'v1' }),
      now,
      now,
      now,
      now,
    ),
  ]

  for (const summary of summaries) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO fight_summaries (
           id, synthesis_run_id, fight_id, consensus_fighter_id,
           weighted_share, raw_support_count, eligible_voter_count,
           consensus_method, method_support_count, method_eligible_count,
           consensus_round, round_support_count, round_eligible_count,
           overview_text, badges_json, evidence_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        id,
        summary.fightId,
        summary.consensusFighterId,
        summary.weightedShare?.toFixed(6) ?? null,
        summary.rawSupportCount,
        summary.eligibleVoterCount,
        summary.consensusMethod,
        summary.methodSupportCount,
        summary.methodEligibleCount,
        summary.consensusRound,
        summary.roundSupportCount,
        summary.roundEligibleCount,
        summary.overviewText,
        JSON.stringify(summary.badges),
        JSON.stringify(summary.evidence),
        now,
        now,
      ),
    )
  }

  const allocatedBetIds = new Map<string, string>()
  const rationaleByBetId = new Map<string, string>()
  const supportersByBetId = new Map<string, string[]>()
  const rationaleEvidenceByBetId = new Map<
    string,
    Array<{ capper: string; reasoning: string }>
  >()
  for (const bet of allocation.bets) {
    const betId = crypto.randomUUID()
    allocatedBetIds.set(bet.id, betId)
    const supportCandidateIds =
      bet.tier === 'parlay' ? bet.legCandidateIds : [bet.id]
    const supportCandidates = candidates.filter((candidate) =>
      supportCandidateIds.includes(candidate.id),
    )
    const supportedOpinions = opinions.filter((opinion) =>
      supportCandidates.some(
        (candidate) =>
          candidate.fightId === opinion.fight_id &&
          candidate.selectionFighterId === opinion.picked_fighter_id,
      ),
    )
    const supportedTips = tipResult.results.filter((tip) =>
      supportCandidates.some(
        (candidate) =>
          candidate.fightId === tip.fight_id &&
          candidate.selectionFighterId === tip.selection_fighter_id &&
          candidate.marketType === tip.market_type,
      ),
    )
    const supportingNames = [
      ...new Set([
        ...supportedOpinions.map((opinion) => opinion.capper_name),
        ...supportedTips.map((tip) => tip.capper_name),
      ]),
    ]
    const rationale = supportingNames.length
      ? `${supportingNames.join(', ')} support ${bet.selectionText}. The ${bet.tier} stake follows the snapshotted deterministic allocation rules.`
      : `The ${bet.tier} stake follows the snapshotted deterministic allocation rules.`
    rationaleByBetId.set(bet.id, rationale)
    supportersByBetId.set(bet.id, supportingNames)
    rationaleEvidenceByBetId.set(
      bet.id,
      [
        ...supportedOpinions.map((opinion) => ({
          capper: opinion.capper_name,
          reasoning: opinion.reasoning_summary,
        })),
        ...supportedTips.map((tip) => ({
          capper: tip.capper_name,
          reasoning: tip.reasoning_summary,
        })),
      ].filter(
        (item, index, evidence) =>
          evidence.findIndex(
            (candidate) =>
              candidate.capper === item.capper &&
              candidate.reasoning === item.reasoning,
          ) === index,
      ),
    )
    statements.push(
      env.DB.prepare(
        `INSERT INTO bets (
           id, card_id, synthesis_run_id, origin, tier, market_type,
           selection_text, recommended_units, recommended_odds,
           consensus_share, rationale, state, odds_taken, settlement_odds,
           stake_units, result, net_profit_units, settled_at, notes,
           created_at, updated_at
         ) VALUES (?, ?, ?, 'synthesised', ?, ?, ?, ?, ?, ?, ?,
                   'recommended', NULL, NULL, NULL, 'pending', NULL, NULL, NULL, ?, ?)`,
      ).bind(
        betId,
        cardId,
        id,
        bet.tier,
        bet.marketType,
        bet.selectionText,
        bet.units.toFixed(2),
        bet.decimalOdds.toFixed(4),
        bet.consensusShare?.toFixed(6) ?? null,
        rationale,
        now,
        now,
      ),
    )
    const supportByCapper = new Map<
      string,
      { opinionId: string | null; tipId: string | null }
    >()
    for (const opinion of supportedOpinions) {
      supportByCapper.set(opinion.capper_id, {
        opinionId: opinion.id,
        tipId: null,
      })
    }
    for (const tip of supportedTips) {
      const existing = supportByCapper.get(tip.capper_id)
      supportByCapper.set(tip.capper_id, {
        opinionId: existing?.opinionId ?? null,
        tipId: tip.id,
      })
    }
    for (const [capperId, support] of supportByCapper) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO bet_support (
             bet_id, capper_id, opinion_id, capper_tip_id, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        ).bind(betId, capperId, support.opinionId, support.tipId, now),
      )
    }
  }

  for (const bet of allocation.bets.filter((item) => item.tier === 'parlay')) {
    const betId = allocatedBetIds.get(bet.id)
    if (!betId) continue
    for (const legCandidateId of bet.legCandidateIds) {
      const candidate = candidates.find((item) => item.id === legCandidateId)
      if (!candidate) continue
      statements.push(
        env.DB.prepare(
          `INSERT INTO bet_legs (
             id, bet_id, fight_id, market_type, selection_fighter_id,
             method, round, line_value, selection_text, leg_result,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 'pending', ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          betId,
          candidate.fightId,
          candidate.marketType,
          candidate.selectionFighterId,
          candidate.selectionText,
          now,
          now,
        ),
      )
    }
  }

  if (llmConfiguration && allocation.bets.length > 0) {
    try {
      const generated = await callModel(
        {
          task: 'slate_rationales',
          schema: slateRationalesSchema,
          temperature: 0,
          messages: [
            { role: 'system', content: slateRationalePrompt },
            {
              role: 'user',
              content: JSON.stringify({
                bets: allocation.bets.map((bet) => ({
                  bet_candidate_id: bet.id,
                  selection: bet.selectionText,
                  tier: bet.tier,
                  units: bet.units,
                  supporting_evidence:
                    rationaleEvidenceByBetId.get(bet.id) ?? [],
                })),
              }),
            },
          ],
        },
        llmConfiguration,
      )
      for (const item of generated.data.rationales) {
        const persistedBetId = allocatedBetIds.get(item.bet_candidate_id)
        if (!persistedBetId || sentenceCount(item.rationale) > 2) continue
        rationaleByBetId.set(item.bet_candidate_id, item.rationale)
        statements.push(
          env.DB.prepare('UPDATE bets SET rationale = ? WHERE id = ?').bind(
            item.rationale,
            persistedBetId,
          ),
        )
      }
    } catch (error) {
      console.warn('slate_rationale_generation_failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  await env.DB.batch(statements)
  return {
    id,
    cardId,
    status: 'draft',
    recommendedUnits: allocation.recommendedUnits,
    unspentUnits: allocation.unspentUnits,
    fightSummaries: summaries,
    bets: allocation.bets.map((bet) => ({
      ...bet,
      rationale: rationaleByBetId.get(bet.id) ?? '',
      supportingCappers: supportersByBetId.get(bet.id) ?? [],
    })),
  }
}

import { synthesisConfig, type SynthesisConfig } from '../config/synthesis'

export interface BetCandidate {
  id: string
  fightId: string
  selectionFighterId: string
  selectionText: string
  marketType:
    | 'moneyline'
    | 'method'
    | 'round'
    | 'round_and_method'
    | 'over_under'
    | 'prop'
    | 'other'
  decimalOdds: number
  consensusShare: number
  supportCount: number
  explicitSolidOrLockSupport: number
}

export interface AllocatedBet {
  id: string
  fightId: string | null
  selectionFighterId: string | null
  selectionText: string
  marketType: BetCandidate['marketType'] | 'parlay'
  decimalOdds: number
  consensusShare: number | null
  supportCount: number
  tier: 'core' | 'value' | 'parlay'
  units: number
  legCandidateIds: string[]
}

export interface AllocationResult {
  bets: AllocatedBet[]
  recommendedUnits: number
  unspentUnits: number
  excluded: Array<{ candidateId: string; reason: string }>
}

function classify(
  candidate: BetCandidate,
  config: SynthesisConfig,
): AllocatedBet | null {
  const isCore =
    candidate.marketType === 'moneyline' &&
    candidate.consensusShare >= config.core.minimumShare &&
    candidate.supportCount >= config.core.minimumSupport &&
    candidate.decimalOdds <= config.core.maximumDecimalOdds

  if (isCore) {
    const initialUnits =
      candidate.consensusShare >= config.core.highConfidenceShare
        ? config.core.highConfidenceStakeUnits
        : config.core.standardStakeUnits
    return {
      ...candidate,
      tier: 'core',
      units: Math.min(initialUnits, config.perBetCapUnits),
      legCandidateIds: [],
    }
  }

  const isValue =
    candidate.decimalOdds > config.value.minimumDecimalOddsExclusive &&
    candidate.explicitSolidOrLockSupport >=
      config.value.minimumExplicitSolidOrLockSupport

  if (isValue) {
    return {
      ...candidate,
      tier: 'value',
      units: Math.min(config.value.stakeUnits, config.perBetCapUnits),
      legCandidateIds: [],
    }
  }

  return null
}

function resolveOpposingMoneylines(
  candidates: BetCandidate[],
  excluded: AllocationResult['excluded'],
): BetCandidate[] {
  const byFight = new Map<string, BetCandidate[]>()
  for (const candidate of candidates) {
    if (candidate.marketType !== 'moneyline') continue
    const current = byFight.get(candidate.fightId) ?? []
    current.push(candidate)
    byFight.set(candidate.fightId, current)
  }

  const excludedIds = new Set<string>()
  for (const sameFight of byFight.values()) {
    const distinctSelections = new Set(
      sameFight.map((candidate) => candidate.selectionFighterId),
    )
    if (distinctSelections.size < 2) continue

    const highestShare = Math.max(
      ...sameFight.map((candidate) => candidate.consensusShare),
    )
    const leaders = sameFight.filter(
      (candidate) => candidate.consensusShare === highestShare,
    )

    if (leaders.length > 1) {
      for (const candidate of sameFight) {
        excludedIds.add(candidate.id)
        excluded.push({
          candidateId: candidate.id,
          reason: 'Opposing moneyline candidates were tied',
        })
      }
      continue
    }

    for (const candidate of sameFight) {
      if (candidate.id === leaders[0]?.id) continue
      excludedIds.add(candidate.id)
      excluded.push({
        candidateId: candidate.id,
        reason: 'The opposing side had a higher consensus share',
      })
    }
  }

  return candidates.filter((candidate) => !excludedIds.has(candidate.id))
}

export function allocateSlate(
  inputCandidates: BetCandidate[],
  budgetUnits: number,
  config: SynthesisConfig = synthesisConfig,
): AllocationResult {
  if (!Number.isFinite(budgetUnits) || budgetUnits < 0) {
    throw new Error('Budget units must be a non-negative number')
  }

  const excluded: AllocationResult['excluded'] = []
  const deconflicted = resolveOpposingMoneylines(inputCandidates, excluded)
  const classified: AllocatedBet[] = []

  for (const candidate of deconflicted) {
    const bet = classify(candidate, config)
    if (bet) classified.push(bet)
    else {
      excluded.push({
        candidateId: candidate.id,
        reason: 'Candidate did not qualify for a configured tier',
      })
    }
  }

  classified.sort((left, right) => {
    if (left.tier !== right.tier) return left.tier === 'core' ? -1 : 1
    if (left.tier === 'core') {
      return (
        (right.consensusShare ?? 0) - (left.consensusShare ?? 0) ||
        right.supportCount - left.supportCount ||
        left.id.localeCompare(right.id)
      )
    }
    const leftSource = inputCandidates.find((item) => item.id === left.id)
    const rightSource = inputCandidates.find((item) => item.id === right.id)
    return (
      (rightSource?.explicitSolidOrLockSupport ?? 0) -
        (leftSource?.explicitSolidOrLockSupport ?? 0) ||
      left.id.localeCompare(right.id)
    )
  })

  const bets: AllocatedBet[] = []
  let recommendedUnits = 0
  for (const bet of classified) {
    if (recommendedUnits + bet.units > budgetUnits) {
      excluded.push({
        candidateId: bet.id,
        reason: 'The card budget was already allocated to higher-ranked bets',
      })
      continue
    }
    bets.push(bet)
    recommendedUnits += bet.units
  }

  const coreBets = bets.filter((bet) => bet.tier === 'core')
  if (
    coreBets.length >= config.parlay.maximumLegs &&
    recommendedUnits + config.parlay.stakeUnits <= budgetUnits
  ) {
    const legs = coreBets.slice(0, config.parlay.maximumLegs)
    bets.push({
      id: `parlay:${legs.map((leg) => leg.id).join(':')}`,
      fightId: null,
      selectionFighterId: null,
      selectionText: legs.map((leg) => leg.selectionText).join(' + '),
      marketType: 'parlay',
      decimalOdds: legs.reduce((total, leg) => total * leg.decimalOdds, 1),
      consensusShare: null,
      supportCount: legs.reduce((total, leg) => total + leg.supportCount, 0),
      tier: 'parlay',
      units: config.parlay.stakeUnits,
      legCandidateIds: legs.map((leg) => leg.id),
    })
    recommendedUnits += config.parlay.stakeUnits
  }

  return {
    bets,
    recommendedUnits,
    unspentUnits: budgetUnits - recommendedUnits,
    excluded,
  }
}

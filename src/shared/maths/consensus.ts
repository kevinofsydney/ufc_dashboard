import { synthesisConfig } from '../config/synthesis'

export type Confidence = 'lean' | 'solid' | 'lock'
export type ConfidenceMultipliers = Readonly<Record<Confidence, number>>

export interface ConsensusVote {
  capperId: string
  fighterId: string
  confidence: Confidence
  capperWeight?: number
}

export interface ConsensusResult {
  totalStrength: number
  shares: Record<string, number>
  supportCounts: Record<string, number>
}

export function calculateWinnerConsensus(
  votes: ConsensusVote[],
  confidenceMultipliers: ConfidenceMultipliers = synthesisConfig.confidenceMultipliers,
): ConsensusResult {
  const distinctVotes = new Map<string, ConsensusVote>()
  for (const vote of votes) {
    if (!distinctVotes.has(vote.capperId))
      distinctVotes.set(vote.capperId, vote)
  }

  const strengths: Record<string, number> = {}
  const supportCounts: Record<string, number> = {}

  for (const vote of distinctVotes.values()) {
    const weight = vote.capperWeight ?? 1
    const multiplier = confidenceMultipliers[vote.confidence]
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError('Capper weights must be positive finite numbers')
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new RangeError(
        'Confidence multipliers must be positive finite numbers',
      )
    }
    strengths[vote.fighterId] =
      (strengths[vote.fighterId] ?? 0) + weight * multiplier
    supportCounts[vote.fighterId] = (supportCounts[vote.fighterId] ?? 0) + 1
  }

  const totalStrength = Object.values(strengths).reduce(
    (sum, value) => sum + value,
    0,
  )
  const shares = Object.fromEntries(
    Object.entries(strengths).map(([fighterId, strength]) => [
      fighterId,
      totalStrength === 0 ? 0 : strength / totalStrength,
    ]),
  )

  return { totalStrength, shares, supportCounts }
}

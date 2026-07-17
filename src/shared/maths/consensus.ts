export type Confidence = 'lean' | 'solid' | 'lock'

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

const confidenceMultiplier: Record<Confidence, number> = {
  lean: 0.5,
  solid: 1,
  lock: 1.5,
}

export function calculateWinnerConsensus(
  votes: ConsensusVote[],
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
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError('Capper weights must be positive finite numbers')
    }
    strengths[vote.fighterId] =
      (strengths[vote.fighterId] ?? 0) +
      weight * confidenceMultiplier[vote.confidence]
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

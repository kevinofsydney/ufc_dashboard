export const synthesisConfig = {
  priceStaleHours: 24,
  confidenceMultipliers: {
    lean: 0.5,
    solid: 1,
    lock: 1.5,
  },
  core: {
    minimumShare: 0.6,
    minimumSupport: 3,
    maximumDecimalOdds: 2.2,
    standardStakeUnits: 2,
    highConfidenceShare: 0.8,
    highConfidenceStakeUnits: 3,
  },
  value: {
    minimumDecimalOddsExclusive: 2.2,
    minimumExplicitSolidOrLockSupport: 2,
    stakeUnits: 1,
  },
  perBetCapUnits: 4,
  parlay: {
    maximumLegs: 3,
    stakeUnits: 1,
  },
} as const

export type SynthesisConfig = typeof synthesisConfig

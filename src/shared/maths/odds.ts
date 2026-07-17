export const ODDS_SCALE = 10_000

export function americanToDecimal(american: number): number {
  if (
    !Number.isFinite(american) ||
    american === 0 ||
    Math.abs(american) < 100
  ) {
    throw new RangeError(
      'American odds must be +100 or greater, or -100 or lower',
    )
  }

  const decimal =
    american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)
  return Math.round(decimal * ODDS_SCALE) / ODDS_SCALE
}

export function parseOdds(input: string): number {
  const trimmed = input.trim()
  if (!trimmed) throw new RangeError('Odds are required')

  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) throw new RangeError('Odds must be numeric')

  const explicitlyAmerican = trimmed.startsWith('+') || numeric <= -100
  if (explicitlyAmerican) return americanToDecimal(numeric)
  if (numeric < 1.01) throw new RangeError('Decimal odds must be at least 1.01')

  return Math.round(numeric * ODDS_SCALE) / ODDS_SCALE
}

export function netProfitUnits(
  result: 'won' | 'lost' | 'push' | 'void',
  stakeUnits: number,
  decimalOdds: number,
): number {
  if (stakeUnits < 0 || !Number.isFinite(stakeUnits)) {
    throw new RangeError('Stake must be a finite non-negative number')
  }
  if (decimalOdds < 1.01 || !Number.isFinite(decimalOdds)) {
    throw new RangeError('Decimal odds must be at least 1.01')
  }

  if (result === 'won') return stakeUnits * (decimalOdds - 1)
  if (result === 'lost') return -stakeUnits
  return 0
}

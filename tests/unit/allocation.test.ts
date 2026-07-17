import { describe, expect, it } from 'vitest'
import {
  allocateSlate,
  type BetCandidate,
} from '../../src/shared/maths/allocation'

const core = (overrides: Partial<BetCandidate> = {}): BetCandidate => ({
  id: 'candidate-a',
  fightId: 'fight-a',
  selectionFighterId: 'fighter-a',
  selectionText: 'Fighter A moneyline',
  marketType: 'moneyline',
  decimalOdds: 1.8,
  consensusShare: 0.7,
  supportCount: 4,
  explicitSolidOrLockSupport: 0,
  ...overrides,
})

describe('slate allocation', () => {
  it('qualifies core boundaries and upgrades high-confidence stake', () => {
    const result = allocateSlate(
      [
        core({ id: 'boundary', consensusShare: 0.6, supportCount: 3 }),
        core({
          id: 'high',
          fightId: 'fight-b',
          selectionFighterId: 'fighter-b',
          consensusShare: 0.8,
        }),
      ],
      30,
    )

    expect(result.bets.map((bet) => [bet.id, bet.units])).toEqual([
      ['high', 3],
      ['boundary', 2],
    ])
    expect(result.recommendedUnits).toBe(5)
  })

  it('never exceeds the budget and does not force-spend', () => {
    const candidates = Array.from({ length: 8 }, (_, index) =>
      core({
        id: `candidate-${index}`,
        fightId: `fight-${index}`,
        selectionFighterId: `fighter-${index}`,
      }),
    )
    const result = allocateSlate(candidates, 5)

    expect(result.recommendedUnits).toBeLessThanOrEqual(5)
    expect(result.unspentUnits).toBe(1)
    expect(result.bets.every((bet) => bet.units <= 4)).toBe(true)
  })

  it('drops both opposing candidates on an exact tie', () => {
    const result = allocateSlate(
      [
        core({ id: 'left', consensusShare: 0.6 }),
        core({
          id: 'right',
          selectionFighterId: 'fighter-b',
          selectionText: 'Fighter B moneyline',
          consensusShare: 0.6,
        }),
      ],
      30,
    )

    expect(result.bets).toEqual([])
    expect(result.excluded).toHaveLength(2)
  })

  it('creates at most one three-leg core parlay when budget remains', () => {
    const result = allocateSlate(
      Array.from({ length: 4 }, (_, index) =>
        core({
          id: `candidate-${index}`,
          fightId: `fight-${index}`,
          selectionFighterId: `fighter-${index}`,
        }),
      ),
      30,
    )

    const parlays = result.bets.filter((bet) => bet.tier === 'parlay')
    expect(parlays).toHaveLength(1)
    expect(parlays[0]?.legCandidateIds).toHaveLength(3)
    expect(parlays[0]?.units).toBe(1)
  })

  it('qualifies value only with explicit strong support', () => {
    const result = allocateSlate(
      [
        core({
          id: 'dog',
          decimalOdds: 2.21,
          consensusShare: 0.4,
          supportCount: 2,
          explicitSolidOrLockSupport: 2,
        }),
      ],
      30,
    )

    expect(result.bets[0]).toMatchObject({ tier: 'value', units: 1 })
  })
})

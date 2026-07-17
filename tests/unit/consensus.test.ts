import { describe, expect, it } from 'vitest'
import { calculateWinnerConsensus } from '../../src/shared/maths/consensus'

describe('winner consensus', () => {
  it('normalises confidence-adjusted vote strength', () => {
    const result = calculateWinnerConsensus([
      { capperId: 'one', fighterId: 'a', confidence: 'lock' },
      { capperId: 'two', fighterId: 'b', confidence: 'solid' },
      { capperId: 'three', fighterId: 'a', confidence: 'lean' },
    ])

    expect(result.shares.a).toBeCloseTo(2 / 3)
    expect(result.shares.b).toBeCloseTo(1 / 3)
    expect(result.shares.a + result.shares.b).toBeCloseTo(1)
  })

  it('counts a capper only once', () => {
    const result = calculateWinnerConsensus([
      { capperId: 'one', fighterId: 'a', confidence: 'solid' },
      { capperId: 'one', fighterId: 'b', confidence: 'lock' },
      { capperId: 'two', fighterId: 'b', confidence: 'solid' },
    ])

    expect(result.supportCounts.a).toBe(1)
    expect(result.supportCounts.b).toBe(1)
  })

  it('handles no eligible votes', () => {
    expect(calculateWinnerConsensus([])).toEqual({
      totalStrength: 0,
      shares: {},
      supportCounts: {},
    })
  })
})

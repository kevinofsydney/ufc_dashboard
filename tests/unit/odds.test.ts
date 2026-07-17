import { describe, expect, it } from 'vitest'
import {
  americanToDecimal,
  netProfitUnits,
  parseOdds,
} from '../../src/shared/maths/odds'

describe('odds conversion', () => {
  it('converts negative American odds', () => {
    expect(americanToDecimal(-140)).toBe(1.7143)
  })

  it('converts positive American odds', () => {
    expect(parseOdds('+120')).toBe(2.2)
  })

  it('preserves decimal odds', () => {
    expect(parseOdds('1.91')).toBe(1.91)
  })

  it.each(['', '0', '1', '-50'])('rejects invalid odds %s', (value) => {
    expect(() => parseOdds(value)).toThrow()
  })
})

describe('settlement', () => {
  it('calculates profit for a win', () => {
    expect(netProfitUnits('won', 2, 1.75)).toBe(1.5)
  })

  it('calculates loss and zero-profit returns', () => {
    expect(netProfitUnits('lost', 2, 2.4)).toBe(-2)
    expect(netProfitUnits('push', 2, 2.4)).toBe(0)
    expect(netProfitUnits('void', 2, 2.4)).toBe(0)
  })
})

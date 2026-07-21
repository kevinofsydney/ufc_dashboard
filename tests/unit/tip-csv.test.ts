import { describe, expect, it } from 'vitest'
import {
  parseTipCsv,
  tipCsvMarkets,
  tipCsvTemplate,
} from '../../src/shared/tip-csv'

const header =
  'capper,fight,selection,market,line,confidence,odds,stake_units,reasoning,source_url'

describe('structured tip CSV v1', () => {
  it('requires the exact versioned header', () => {
    expect(() => parseTipCsv('capper,fight\nGuru,A vs B')).toThrow(
      'Expected columns',
    )
  })

  it.each(tipCsvMarkets)('accepts the canonical %s market', (market) => {
    const line = market === 'over_under' ? '2.5' : ''
    const parsed = parseTipCsv(
      `${header}\nGuru,A vs B,A,${market},${line},solid,+120,1.5,Clear edge,https://example.com/source`,
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.rows[0]).toMatchObject({
      market,
      odds: '+120',
      stakeUnits: 1.5,
    })
  })

  it('keeps mentioned odds as a field on the tip rather than a market price', () => {
    const parsed = parseTipCsv(
      `${header}\nGuru,A vs B,A,moneyline,,lock,-135,,Price is acceptable,`,
    )
    expect(parsed.rows[0]?.odds).toBe('-135')
    expect(parsed.rows[0]).not.toHaveProperty('decimalOdds')
  })

  it('flags missing required values, malformed values, and duplicate tips', () => {
    const parsed = parseTipCsv(
      [
        header,
        'Guru,A vs B,A,moneyline,,solid,,,Reason,',
        'Guru,A vs B,A,moneyline,,solid,,,Repeated,',
        'Guru,A vs B,B,over_under,,solid,,,Missing line,',
        'Guru,A vs B,B,unknown,,solid,,,Bad market,',
        'Guru,A vs B,B,decision,,medium,,,Bad confidence,',
        'Guru,A vs B,B,decision,,solid,,nope,Reason,',
      ].join('\n'),
    )
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        'Duplicate tip in this CSV',
        'over_under tips require line',
        'Unsupported market: unknown',
        'confidence must be lean, solid, or lock',
        'stake_units must be greater than 0 and at most 1000',
      ]),
    )
  })

  it('creates a selected-card template with the exact fight label', () => {
    const template = tipCsvTemplate([
      {
        fighterA: { name: 'Max Holloway' },
        fighterB: { name: 'Ilia Topuria' },
      },
    ])
    expect(template).toContain('Max Holloway vs Ilia Topuria')
    expect(parseTipCsv(template).errors).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { Fight } from '../../src/client/api'
import {
  ledgerCsvTemplate,
  ledgerScreenshotPrompt,
  parseLedgerCsv,
} from '../../src/client/ledger-csv'

const fight: Fight = {
  id: 'fight-1',
  cardId: 'card-1',
  fighterA: { id: 'alpha', name: 'Fighter Alpha' },
  fighterB: { id: 'beta', name: 'Fighter Beta' },
  weightClass: 'Lightweight',
  boutOrder: 1,
  isMainEvent: false,
  status: 'scheduled',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
}

describe('ledger CSV import', () => {
  it('resolves fighter markets and fight-wide props into structured placed bets', () => {
    const csv = [
      'fight,selection,market,odds,stake_units,notes',
      '"Fighter Beta vs Fighter Alpha",Fighter Alpha,ML,+150,1.5,"Bookmaker, mobile"',
      'Fighter Alpha v Fighter Beta,Over 2.5 rounds,fight_prop,1.91,0.5,',
    ].join('\n')

    expect(parseLedgerCsv(csv, [fight])).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        input: {
          marketType: 'moneyline',
          selectionText: 'Fighter Alpha ML',
          oddsTakenInput: '+150',
          stakeUnits: 1.5,
          notes: 'Bookmaker, mobile',
          legs: [
            {
              fightId: 'fight-1',
              marketType: 'moneyline',
              selectionFighterId: 'alpha',
              selectionText: 'Fighter Alpha ML',
            },
          ],
        },
      }),
      expect.objectContaining({
        rowNumber: 3,
        input: {
          marketType: 'prop',
          selectionText: 'Fighter Alpha vs Fighter Beta — Over 2.5 rounds',
          oddsTakenInput: '1.91',
          stakeUnits: 0.5,
          notes: null,
          legs: [
            {
              fightId: 'fight-1',
              marketType: 'prop',
              selectionFighterId: null,
              selectionText: 'Fighter Alpha vs Fighter Beta — Over 2.5 rounds',
            },
          ],
        },
      }),
    ])
  })

  it('rejects unsupported, mismatched, and invalid rows with the row number', () => {
    const header = 'fight,selection,market,odds,stake_units,notes'
    expect(() =>
      parseLedgerCsv(
        `${header}\nFighter Alpha vs Fighter Beta,Someone Else,moneyline,1.80,1,`,
        [fight],
      ),
    ).toThrow('selection must exactly name one fighter in the bout on row 2')

    expect(() =>
      parseLedgerCsv(
        `${header}\nFighter Alpha vs Fighter Beta,Fighter Alpha,round_5,1.80,1,`,
        [fight],
      ),
    ).toThrow('market is not valid for this bout on row 2')

    expect(() =>
      parseLedgerCsv(
        `${header}\nFighter Alpha vs Fighter Beta,Fighter Alpha,moneyline,not-odds,1,`,
        [fight],
      ),
    ).toThrow('Odds must be numeric on row 2')
  })

  it('generates a selected-card template and a non-inventive screenshot prompt', () => {
    const template = ledgerCsvTemplate([fight])
    expect(template).toContain('fight,selection,market,odds,stake_units,notes')
    expect(template).toContain('Fighter Alpha vs Fighter Beta')
    expect(template).toContain('fight_prop')

    const prompt = ledgerScreenshotPrompt('Fixture UFC Card', [fight])
    expect(prompt).toContain('Fixture UFC Card')
    expect(prompt).toContain('- Fighter Alpha vs Fighter Beta')
    expect(prompt).toContain('never guess it')
    expect(prompt).toContain('Return only CSV')
  })
})

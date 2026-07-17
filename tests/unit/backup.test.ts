import { describe, expect, it } from 'vitest'
import { validateApplicationBackup } from '../../src/server/services/backup'

const tableNames = [
  'app_settings',
  'cards',
  'fighters',
  'fighter_aliases',
  'fights',
  'fight_participants',
  'cappers',
  'capper_aliases',
  'sources',
  'audit_events',
  'extraction_runs',
  'fight_opinions',
  'capper_tips',
  'fight_stats',
  'extraction_review_items',
  'market_prices',
  'synthesis_runs',
  'fight_summaries',
  'bets',
  'bet_legs',
  'bet_support',
  'fight_outcomes',
] as const

function emptyBackup() {
  return {
    format: 'ufc-bet-synthesiser-backup',
    version: 2,
    exportedAt: '2026-07-17T00:00:00.000Z',
    tables: Object.fromEntries(tableNames.map((table) => [table, []])),
  }
}

describe('application backup contract', () => {
  it('accepts a complete versioned backup', () => {
    expect(validateApplicationBackup(emptyBackup()).version).toBe(2)
  })

  it('upgrades a complete version 1 backup with default settings', () => {
    const legacy = emptyBackup()
    legacy.version = 1 as 2
    delete (legacy.tables as Record<string, unknown>).app_settings

    expect(validateApplicationBackup(legacy)).toMatchObject({
      version: 2,
      tables: { app_settings: [] },
    })
  })

  it('rejects incomplete and executable-shaped values', () => {
    const missingTable = emptyBackup()
    delete (missingTable.tables as Record<string, unknown>).bets
    expect(() => validateApplicationBackup(missingTable)).toThrow(/bets/)

    const invalidValue = emptyBackup()
    invalidValue.tables.cards = [{ id: () => 'not data' }] as never
    expect(() => validateApplicationBackup(invalidValue)).toThrow(/cards/)
  })
})

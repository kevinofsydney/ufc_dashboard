import { parseOdds } from '../shared/maths/odds'
import type { Fight } from './api'
import { buildBetSelection, type PickType } from './bet-builder'
import { formatCsvRow, parseCsvRows } from './csv'

export const ledgerCsvHeaders = [
  'fight',
  'selection',
  'market',
  'odds',
  'stake_units',
  'notes',
] as const

export interface LedgerCsvBet {
  rowNumber: number
  fightLabel: string
  selectionLabel: string
  marketLabel: string
  input: {
    marketType: string
    selectionText: string
    oddsTakenInput: string
    stakeUnits: number
    notes: string | null
    legs: Array<{
      fightId: string
      marketType: string
      selectionFighterId: string | null
      selectionText: string
    }>
  }
}

function comparable(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
}

function fightAliases(fight: Fight): Set<string> {
  const names = [fight.fighterA.name, fight.fighterB.name]
  return new Set(
    [names, [...names].reverse()].flatMap(([first, second]) =>
      ['vs', 'v', 'versus'].map((separator) =>
        comparable(`${first} ${separator} ${second}`),
      ),
    ),
  )
}

function resolveFight(
  label: string,
  fights: Fight[],
  rowNumber: number,
): Fight {
  const key = comparable(label)
  const matches = fights.filter((fight) => fightAliases(fight).has(key))
  if (matches.length === 0) {
    throw new Error(
      `fight does not match a bout on the selected card on row ${rowNumber}`,
    )
  }
  if (matches.length > 1) {
    throw new Error(`fight is ambiguous on row ${rowNumber}`)
  }
  return matches[0]
}

function pickType(value: string): PickType | 'fight_prop' | null {
  const key = comparable(value).replaceAll(' ', '_')
  const aliases: Record<string, PickType | 'fight_prop'> = {
    ml: 'moneyline',
    moneyline: 'moneyline',
    inside_distance: 'inside_distance',
    inside_the_distance: 'inside_distance',
    itd: 'inside_distance',
    ko: 'ko_tko',
    tko: 'ko_tko',
    ko_tko: 'ko_tko',
    submission: 'submission',
    sub: 'submission',
    decision: 'decision',
    dec: 'decision',
    fight_prop: 'fight_prop',
    prop: 'fight_prop',
  }
  if (aliases[key]) return aliases[key]
  const round = /^(?:round|r)_?([1-5])$/u.exec(key)?.[1]
  return round ? (`round_${round}` as PickType) : null
}

function valueAt(
  row: string[],
  indexes: Map<string, number>,
  header: (typeof ledgerCsvHeaders)[number],
) {
  return row[indexes.get(header) ?? -1] ?? ''
}

export function parseLedgerCsv(
  csvText: string,
  fights: Fight[],
): LedgerCsvBet[] {
  const rows = parseCsvRows(csvText)
  if (rows.length < 2) {
    throw new Error(
      'The CSV must contain a header row and at least one bet row',
    )
  }
  if (rows.length > 201) throw new Error('The CSV may contain at most 200 bets')

  const headers = rows[0].map((header) =>
    comparable(header).replaceAll(' ', '_'),
  )
  const indexes = new Map<string, number>()
  headers.forEach((header, index) => {
    if (!header) return
    if (indexes.has(header)) {
      throw new Error(`The CSV contains the header ${header} more than once`)
    }
    indexes.set(header, index)
  })
  const missing = ledgerCsvHeaders.filter((header) => !indexes.has(header))
  if (missing.length > 0)
    throw new Error(`The CSV is missing: ${missing.join(', ')}`)

  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2
    const fightLabel = valueAt(row, indexes, 'fight').trim()
    const selectionLabel = valueAt(row, indexes, 'selection').trim()
    const marketLabel = valueAt(row, indexes, 'market').trim()
    const odds = valueAt(row, indexes, 'odds').trim()
    const stakeText = valueAt(row, indexes, 'stake_units').trim()
    const notes = valueAt(row, indexes, 'notes').trim()

    if (!fightLabel) throw new Error(`fight is empty on row ${rowNumber}`)
    if (!selectionLabel)
      throw new Error(`selection is empty on row ${rowNumber}`)
    if (!marketLabel) throw new Error(`market is empty on row ${rowNumber}`)
    if (!odds) throw new Error(`odds is empty on row ${rowNumber}`)
    if (!stakeText) throw new Error(`stake_units is empty on row ${rowNumber}`)
    if (notes.length > 2_000)
      throw new Error(
        `notes is longer than 2,000 characters on row ${rowNumber}`,
      )
    try {
      parseOdds(odds)
    } catch (oddsError) {
      throw new Error(
        `${oddsError instanceof Error ? oddsError.message : 'Odds are invalid'} on row ${rowNumber}`,
        { cause: oddsError },
      )
    }
    const stakeUnits = Number(stakeText)
    if (!Number.isFinite(stakeUnits) || stakeUnits <= 0 || stakeUnits > 1_000) {
      throw new Error(
        `stake_units must be greater than 0 and no more than 1,000 on row ${rowNumber}`,
      )
    }

    const fight = resolveFight(fightLabel, fights, rowNumber)
    const market = pickType(marketLabel)
    if (!market) throw new Error(`market is not supported on row ${rowNumber}`)

    if (market === 'fight_prop') {
      const selectionText = `${fight.fighterA.name} vs ${fight.fighterB.name} — ${selectionLabel}`
      if (selectionText.length > 240) {
        throw new Error(`selection is too long on row ${rowNumber}`)
      }
      return {
        rowNumber,
        fightLabel,
        selectionLabel,
        marketLabel,
        input: {
          marketType: 'prop',
          selectionText,
          oddsTakenInput: odds,
          stakeUnits,
          notes: notes || null,
          legs: [
            {
              fightId: fight.id,
              marketType: 'prop',
              selectionFighterId: null,
              selectionText,
            },
          ],
        },
      }
    }

    const fighters = [fight.fighterA, fight.fighterB]
    const fighter = fighters.find(
      (participant) =>
        comparable(participant.name) === comparable(selectionLabel),
    )
    if (!fighter) {
      throw new Error(
        `selection must exactly name one fighter in the bout on row ${rowNumber}`,
      )
    }
    const selection = buildBetSelection(fight, fighter.id, market)
    if (!selection) {
      throw new Error(`market is not valid for this bout on row ${rowNumber}`)
    }
    return {
      rowNumber,
      fightLabel,
      selectionLabel,
      marketLabel,
      input: {
        marketType: selection.marketType,
        selectionText: selection.selectionText,
        oddsTakenInput: odds,
        stakeUnits,
        notes: notes || null,
        legs: [
          {
            fightId: fight.id,
            marketType: selection.marketType,
            selectionFighterId: fighter.id,
            selectionText: selection.selectionText,
          },
        ],
      },
    }
  })
}

export function ledgerCsvTemplate(fights: Fight[]): string {
  const fight = fights[0]
  const fightLabel = fight
    ? `${fight.fighterA.name} vs ${fight.fighterB.name}`
    : 'Fighter A vs Fighter B'
  const fighter = fight?.fighterA.name ?? 'Fighter A'
  return [
    formatCsvRow([...ledgerCsvHeaders]),
    formatCsvRow([fightLabel, fighter, 'moneyline', '1.80', '1', '']),
    formatCsvRow([
      fightLabel,
      'Over 2.5 rounds',
      'fight_prop',
      '-120',
      '0.5',
      '',
    ]),
  ].join('\r\n')
}

export function ledgerScreenshotPrompt(
  cardName: string,
  fights: Fight[],
): string {
  const fightList = fights.length
    ? fights
        .map((fight) => `- ${fight.fighterA.name} vs ${fight.fighterB.name}`)
        .join('\n')
    : '- No fights are loaded yet; ask me for the official bout list.'
  return `I am going to attach one or more bookmaker screenshots for ${cardName || 'a UFC card'}. Read only information that is clearly visible in the screenshots and return an import-ready CSV for my bet ledger.

Use this exact header and column order:
fight,selection,market,odds,stake_units,notes

Rules:
- Return only CSV in one fenced code block. Do not return a Markdown table or explanatory text.
- Use the exact fight spelling from this allowed list:
${fightList}
- For a fighter bet, selection must be the exact fighter name and market must be one of: moneyline, inside_distance, ko_tko, submission, decision, round_1, round_2, round_3, round_4, round_5.
- For a fight-wide total or other fight prop, put the visible prop wording in selection and use fight_prop as market.
- Preserve the visible odds as decimal or signed American odds. Do not convert or infer missing odds.
- Use the stake in units that I tell you. If I do not provide a stake, leave stake_units blank for me to complete; never guess it.
- Put the bookmaker or any useful visible context in notes. Escape commas and quotes correctly for CSV.
- Omit unclear rows. Never invent a fighter, market, price, or stake.
- Include one row per bet, even when several bets come from the same fight.`
}

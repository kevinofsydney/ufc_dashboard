import { formatCsvRow, parseCsvRows } from './csv'

export const tipCsvMarkets = [
  'moneyline',
  'inside_distance',
  'ko_tko',
  'submission',
  'decision',
  'round_1',
  'round_2',
  'round_3',
  'round_4',
  'round_5',
  'over_under',
  'fight_prop',
] as const

export type TipCsvMarket = (typeof tipCsvMarkets)[number]

export interface TipCsvRow {
  rowNumber: number
  capper: string
  fight: string
  selection: string
  market: TipCsvMarket
  line: string | null
  confidence: 'lean' | 'solid' | 'lock'
  odds: string | null
  stakeUnits: number | null
  reasoning: string
  sourceUrl: string | null
}

export interface TipCsvParseResult {
  rows: TipCsvRow[]
  errors: Array<{ rowNumber: number; message: string }>
}

const headers = [
  'capper',
  'fight',
  'selection',
  'market',
  'line',
  'confidence',
  'odds',
  'stake_units',
  'reasoning',
  'source_url',
] as const

export function parseTipCsv(input: string): TipCsvParseResult {
  const parsed = parseCsvRows(input)
  if (parsed.length === 0) throw new Error('The tip CSV is empty')
  const suppliedHeaders = (parsed[0] ?? []).map((value) => value.trim())
  if (
    suppliedHeaders.length !== headers.length ||
    headers.some((header, index) => suppliedHeaders[index] !== header)
  ) {
    throw new Error(`Expected columns: ${headers.join(',')}`)
  }

  const rows: TipCsvRow[] = []
  const errors: TipCsvParseResult['errors'] = []
  const duplicateKeys = new Set<string>()
  for (const [index, values] of parsed.slice(1).entries()) {
    const rowNumber = index + 2
    const value = (column: number) => (values[column] ?? '').trim()
    const [capper, fight, selection, marketValue, line, confidence, odds] = [
      value(0),
      value(1),
      value(2),
      value(3),
      value(4),
      value(5),
      value(6),
    ]
    const reasoning = value(8)
    const sourceUrl = value(9)
    if (!capper || !fight || !selection || !marketValue || !reasoning) {
      errors.push({
        rowNumber,
        message:
          'capper, fight, selection, market, confidence, and reasoning are required',
      })
      continue
    }
    if (!tipCsvMarkets.includes(marketValue as TipCsvMarket)) {
      errors.push({ rowNumber, message: `Unsupported market: ${marketValue}` })
      continue
    }
    if (!['lean', 'solid', 'lock'].includes(confidence)) {
      errors.push({
        rowNumber,
        message: 'confidence must be lean, solid, or lock',
      })
      continue
    }
    if (marketValue === 'over_under' && !line) {
      errors.push({ rowNumber, message: 'over_under tips require line' })
      continue
    }
    if (sourceUrl) {
      try {
        new URL(sourceUrl)
      } catch {
        errors.push({ rowNumber, message: 'source_url must be a valid URL' })
        continue
      }
    }
    const stakeText = value(7)
    const stakeUnits = stakeText ? Number(stakeText) : null
    if (
      stakeUnits !== null &&
      (!Number.isFinite(stakeUnits) || stakeUnits <= 0 || stakeUnits > 1_000)
    ) {
      errors.push({
        rowNumber,
        message: 'stake_units must be greater than 0 and at most 1000',
      })
      continue
    }
    const duplicateKey = [capper, fight, selection, marketValue, line]
      .map((part) => part.toLocaleLowerCase())
      .join('|')
    if (duplicateKeys.has(duplicateKey)) {
      errors.push({ rowNumber, message: 'Duplicate tip in this CSV' })
      continue
    }
    duplicateKeys.add(duplicateKey)
    rows.push({
      rowNumber,
      capper,
      fight,
      selection,
      market: marketValue as TipCsvMarket,
      line: line || null,
      confidence: confidence as TipCsvRow['confidence'],
      odds: odds || null,
      stakeUnits,
      reasoning,
      sourceUrl: sourceUrl || null,
    })
  }
  return { rows, errors }
}

export function tipCsvTemplate(
  fights: Array<{ fighterA: { name: string }; fighterB: { name: string } }>,
): string {
  const exampleFight = fights[0]
    ? `${fights[0].fighterA.name} vs ${fights[0].fighterB.name}`
    : 'Max Holloway vs Opponent'
  const selection = fights[0]?.fighterA.name ?? 'Max Holloway'
  return [
    formatCsvRow([...headers]),
    formatCsvRow([
      'MMA Guru',
      exampleFight,
      selection,
      'moneyline',
      '',
      'solid',
      '',
      '',
      'Favours the matchup and recent form',
      '',
    ]),
  ].join('\r\n')
}

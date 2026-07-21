import {
  parseTipCsv,
  type TipCsvMarket,
  type TipCsvRow,
} from '../../shared/tip-csv'
import type { IndividualExtraction } from '../../shared/schemas/extraction'
import type { Bindings } from '../env'
import { sha256 } from '../hash'
import { createCapper, listCappers } from '../repositories/cappers'
import {
  completeExtractionRun,
  createExtractionRun,
} from '../repositories/extractions'
import { listFights, type FightRecord } from '../repositories/fights'
import { createSource } from '../repositories/sources'
import { acceptExtraction } from './accept-extraction'

export interface TipCsvPreviewRow extends TipCsvRow {
  fightId: string | null
  selectionFighterId: string | null
  normalizedSelection: string
  willCreateCapper: boolean
  issues: string[]
}

export interface TipCsvPreview {
  rows: TipCsvPreviewRow[]
  errors: Array<{ rowNumber: number; message: string }>
  canAccept: boolean
}

function fightLabel(fight: FightRecord): string {
  return `${fight.fighterA.name} vs ${fight.fighterB.name}`
}

function marketFields(
  row: TipCsvRow,
  fighter: { id: string; name: string } | null,
): Pick<
  IndividualExtraction['tips'][number],
  | 'market_type'
  | 'selection_fighter_id'
  | 'method'
  | 'round'
  | 'line_value'
  | 'selection_text'
> {
  const base = {
    selection_fighter_id: fighter?.id ?? null,
    method: null,
    round: null,
    line_value: row.line,
  }
  if (row.market === 'moneyline')
    return {
      ...base,
      market_type: 'moneyline',
      selection_text: `${fighter?.name ?? row.selection} ML`,
    }
  if (row.market === 'inside_distance')
    return {
      ...base,
      market_type: 'prop',
      selection_text: `${fighter?.name ?? row.selection} Inside the Distance`,
    }
  if (['ko_tko', 'submission', 'decision'].includes(row.market)) {
    const method = row.market as 'ko_tko' | 'submission' | 'decision'
    const label =
      method === 'ko_tko'
        ? 'KO/TKO'
        : method === 'submission'
          ? 'Submission'
          : 'Decision'
    return {
      ...base,
      market_type: 'method',
      method,
      selection_text: `${fighter?.name ?? row.selection} by ${label}`,
    }
  }
  if (row.market.startsWith('round_')) {
    const round = row.market.slice(-1) as '1' | '2' | '3' | '4' | '5'
    return {
      ...base,
      market_type: 'round',
      round,
      selection_text: `${fighter?.name ?? row.selection} in Round ${round}`,
    }
  }
  if (row.market === 'over_under')
    return {
      ...base,
      selection_fighter_id: null,
      market_type: 'over_under',
      selection_text: `${row.selection} ${row.line}`.trim(),
    }
  return {
    ...base,
    selection_fighter_id: null,
    market_type: 'prop',
    selection_text: row.selection,
  }
}

function requiresFighter(market: TipCsvMarket): boolean {
  return !['over_under', 'fight_prop'].includes(market)
}

export async function previewTipCsv(
  db: Bindings['DB'],
  cardId: string,
  rawCsv: string,
): Promise<TipCsvPreview> {
  const parsed = parseTipCsv(rawCsv)
  const [fights, cappers] = await Promise.all([
    listFights(db, cardId),
    listCappers(db),
  ])
  const fightByLabel = new Map(
    fights.map((fight) => [fightLabel(fight).toLocaleLowerCase(), fight]),
  )
  const capperNames = new Set(
    cappers.map((capper) => capper.name.toLocaleLowerCase()),
  )
  const rows = parsed.rows.map<TipCsvPreviewRow>((row) => {
    const fight = fightByLabel.get(row.fight.toLocaleLowerCase()) ?? null
    const fighter = fight
      ? ([fight.fighterA, fight.fighterB].find(
          (candidate) =>
            candidate.name.toLocaleLowerCase() ===
            row.selection.toLocaleLowerCase(),
        ) ?? null)
      : null
    const issues: string[] = []
    if (!fight) issues.push('Fight does not exactly match this card')
    if (fight && requiresFighter(row.market) && !fighter)
      issues.push('Selection must exactly match a fighter in this fight')
    return {
      ...row,
      fightId: fight?.id ?? null,
      selectionFighterId: fighter?.id ?? null,
      normalizedSelection: fighter?.name ?? row.selection,
      willCreateCapper: !capperNames.has(row.capper.toLocaleLowerCase()),
      issues,
    }
  })
  const directionsByCapperFight = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.fightId || !row.selectionFighterId) continue
    const key = `${row.capper.toLocaleLowerCase()}|${row.fightId}`
    const directions = directionsByCapperFight.get(key) ?? new Set<string>()
    directions.add(row.selectionFighterId)
    directionsByCapperFight.set(key, directions)
  }
  for (const row of rows) {
    if (!row.fightId) continue
    const key = `${row.capper.toLocaleLowerCase()}|${row.fightId}`
    if ((directionsByCapperFight.get(key)?.size ?? 0) > 1) {
      row.issues.push(
        'This capper has opposing fighter selections for the same fight',
      )
    }
  }
  return {
    rows,
    errors: parsed.errors,
    canAccept:
      rows.length > 0 &&
      parsed.errors.length === 0 &&
      rows.every((row) => row.issues.length === 0),
  }
}

export async function importTipCsv(
  env: Bindings,
  cardId: string,
  rawCsv: string,
  actorEmail: string,
): Promise<{ importedTips: number; extractionRunIds: string[] }> {
  const preview = await previewTipCsv(env.DB, cardId, rawCsv)
  if (!preview.canAccept)
    throw new Error('Resolve every CSV preview issue before importing')
  const existingCappers = await listCappers(env.DB)
  const capperByName = new Map(
    existingCappers.map((capper) => [capper.name.toLocaleLowerCase(), capper]),
  )
  const rowsByCapper = new Map<string, TipCsvPreviewRow[]>()
  for (const row of preview.rows) {
    const key = row.capper.toLocaleLowerCase()
    rowsByCapper.set(key, [...(rowsByCapper.get(key) ?? []), row])
  }
  const runIds: string[] = []
  for (const [capperKey, rows] of rowsByCapper) {
    let capper = capperByName.get(capperKey)
    if (!capper) {
      capper = await createCapper(env.DB, {
        name: rows[0]?.capper ?? capperKey,
      })
      capperByName.set(capperKey, capper)
    }
    const sourceHash = await sha256(`${cardId}:${capperKey}:${rawCsv}`)
    const duplicate = await env.DB.prepare(
      `SELECT extraction_runs.id
       FROM extraction_runs
       INNER JOIN sources ON sources.id = extraction_runs.source_id
       WHERE sources.card_id = ? AND extraction_runs.source_hash = ?
         AND extraction_runs.status = 'accepted'
       LIMIT 1`,
    )
      .bind(cardId, sourceHash)
      .first<{ id: string }>()
    if (duplicate) {
      runIds.push(duplicate.id)
      continue
    }
    const sourceUrls = [
      ...new Set(rows.map((row) => row.sourceUrl).filter(Boolean)),
    ]
    const source = await createSource(env.DB, {
      cardId,
      primaryCapperId: capper.id,
      medium: 'other',
      extractionMode: 'individual',
      sourceUrl: sourceUrls.length === 1 ? sourceUrls[0] : null,
      title: `Structured tip CSV · ${capper.name}`,
      rawText: rawCsv,
    })
    const output: IndividualExtraction = {
      opinions: [],
      tips: rows.map((row) => ({
        fight_id: row.fightId,
        ...marketFields(
          row,
          row.selectionFighterId
            ? { id: row.selectionFighterId, name: row.normalizedSelection }
            : null,
        ),
        odds_mentioned_raw: row.odds,
        stated_stake_units: row.stakeUnits,
        confidence: row.confidence,
        reasoning: row.reasoning,
        attributed_to_raw: null,
        attributed_to_capper_id: null,
      })),
      fights_not_covered: [],
      unmatched: [],
      unmatched_attribution: [],
    }
    const rawResponse = JSON.stringify(output)
    const run = await createExtractionRun(env.DB, {
      sourceId: source.id,
      provider: 'structured_csv',
      model: 'none',
      promptVersion: 'tip-csv-v1',
      sourceHash,
    })
    await completeExtractionRun(env.DB, run.id, {
      rawResponse,
      inputTokens: null,
      outputTokens: null,
      estimatedCostMicros: 0,
    })
    await acceptExtraction(env, run.id, actorEmail, output)
    runIds.push(run.id)
  }
  return { importedTips: preview.rows.length, extractionRunIds: runIds }
}

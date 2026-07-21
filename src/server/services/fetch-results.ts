import type { Bindings } from '../env'
import { listBets } from '../repositories/bets'
import {
  listCardSourceLinks,
  markCardSourceChecked,
  type EventProvider,
} from '../repositories/card-source-links'
import { listFights } from '../repositories/fights'
import {
  proposeBetResolutions,
  type BetResolutionProposal,
} from './result-resolution'

export interface ImportedFightOutcome {
  fightId: string
  fightLabel: string
  status: 'winner' | 'draw' | 'no_contest' | 'cancelled' | 'overturned'
  winnerFighterId: string | null
  method:
    'ko_tko' | 'submission' | 'decision' | 'disqualification' | 'other' | null
  round: '1' | '2' | '3' | '4' | '5' | null
  sourceProvider: EventProvider
  sourceUrl: string
  issues: string[]
}

export interface ResultsPreview {
  provider: EventProvider
  sourceUrl: string
  outcomes: ImportedFightOutcome[]
  unmatched: string[]
  conflicts: string[]
  betProposals: BetResolutionProposal[]
}

interface ParsedResultRow {
  fighterA: string
  fighterB: string
  winner: string | null
  status: ImportedFightOutcome['status']
  method: ImportedFightOutcome['method']
  round: ImportedFightOutcome['round']
}

function textFromHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function classText(html: string, classFragment: string): string | null {
  const escaped = classFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(
    new RegExp(
      `<[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
      'i',
    ),
  )
  return match?.[1] ? textFromHtml(match[1]) : null
}

function classTexts(html: string, classFragment: string): string[] {
  const escaped = classFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [
    ...html.matchAll(
      new RegExp(
        `<[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
        'gi',
      ),
    ),
  ]
    .map((match) => textFromHtml(match[1] ?? ''))
    .filter(Boolean)
}

function normalizeMethod(raw: string | null): ImportedFightOutcome['method'] {
  if (!raw) return null
  if (/ko|tko/i.test(raw)) return 'ko_tko'
  if (/sub/i.test(raw)) return 'submission'
  if (/dec/i.test(raw)) return 'decision'
  if (/dq|disqual/i.test(raw)) return 'disqualification'
  return 'other'
}

function parseUfcResultRows(html: string): ParsedResultRow[] {
  const starts = [
    ...html.matchAll(
      /<[^>]+class=["'][^"']*c-listing-fight\b[^"']*["'][^>]*>/gi,
    ),
  ]
  return starts.flatMap((start, index) => {
    const chunk = html.slice(
      start.index,
      starts[index + 1]?.index ?? html.length,
    )
    const fighterA = classText(chunk, 'c-listing-fight__corner-name--red')
    const fighterB = classText(chunk, 'c-listing-fight__corner-name--blue')
    if (!fighterA || !fighterB) return []
    const redOutcome = classText(chunk, 'c-listing-fight__outcome--red')
    const blueOutcome = classText(chunk, 'c-listing-fight__outcome--blue')
    const winner = /win/i.test(redOutcome ?? '')
      ? fighterA
      : /win/i.test(blueOutcome ?? '')
        ? fighterB
        : null
    const method = classText(chunk, 'c-listing-fight__result-text')
    const roundRaw = classText(chunk, 'c-listing-fight__result-round')
    const status = /no contest/i.test(method ?? '')
      ? 'no_contest'
      : /draw/i.test(method ?? '')
        ? 'draw'
        : winner
          ? 'winner'
          : null
    if (!status) return []
    return [
      {
        fighterA,
        fighterB,
        winner,
        status,
        method: normalizeMethod(method),
        round: (roundRaw?.match(/[1-5]/)?.[0] ??
          null) as ImportedFightOutcome['round'],
      },
    ]
  })
}

function parseTapologyResultRows(html: string): ParsedResultRow[] {
  const starts = [
    ...html.matchAll(
      /<[^>]+class=["'][^"']*(?:fightCardBout|fight-card-bout)\b[^"']*["'][^>]*>/gi,
    ),
  ]
  return starts.flatMap((start, index) => {
    const chunk = html.slice(
      start.index,
      starts[index + 1]?.index ?? html.length,
    )
    const names = [
      ...classTexts(chunk, 'fightCardFighterName'),
      ...classTexts(chunk, 'fight-card-fighter-name'),
    ].filter((name, nameIndex, all) => all.indexOf(name) === nameIndex)
    if (names.length < 2) return []
    const fighterA = names[0]
    const fighterB = names[1]
    const text = textFromHtml(chunk)
    const escapedA = fighterA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedB = fighterB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const winner = new RegExp(`\\bW\\s+${escapedA}\\b`, 'i').test(text)
      ? fighterA
      : new RegExp(`\\bW\\s+${escapedB}\\b`, 'i').test(text)
        ? fighterB
        : null
    const methodRaw =
      text.match(
        /(?:method\s*)?(KO\/TKO|TKO|KO|submission|decision|no contest|draw|disqualification)/i,
      )?.[1] ?? null
    const status = /no contest/i.test(methodRaw ?? text)
      ? 'no_contest'
      : /\bdraw\b/i.test(methodRaw ?? text)
        ? 'draw'
        : winner
          ? 'winner'
          : null
    if (!status) return []
    return [
      {
        fighterA,
        fighterB,
        winner,
        status,
        method: normalizeMethod(methodRaw),
        round: (text.match(/\b(?:round|r)\s*([1-5])\b/i)?.[1] ??
          null) as ImportedFightOutcome['round'],
      },
    ]
  })
}

function providerForUrl(rawUrl: string): EventProvider | null {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') return null
  if (['ufc.com', 'www.ufc.com'].includes(url.hostname.toLowerCase()))
    return 'ufc'
  if (['tapology.com', 'www.tapology.com'].includes(url.hostname.toLowerCase()))
    return 'tapology'
  return null
}

export async function fetchResultsPreview(
  db: Bindings['DB'],
  cardId: string,
): Promise<ResultsPreview> {
  const links = await listCardSourceLinks(db, cardId)
  const ordered = [...links].sort((left, right) =>
    left.provider === right.provider ? 0 : left.provider === 'ufc' ? -1 : 1,
  )
  if (ordered.length === 0)
    throw new Error(
      'Save a UFC.com or Tapology event URL in Event settings first',
    )
  const fights = await listFights(db, cardId)
  const errors: string[] = []
  const providerPreviews: Array<{
    provider: EventProvider
    sourceUrl: string
    outcomes: ImportedFightOutcome[]
    unmatched: string[]
  }> = []
  for (const link of ordered) {
    try {
      if (providerForUrl(link.url) !== link.provider)
        throw new Error('Saved source host does not match its provider')
      const response = await fetch(link.url, {
        headers: { 'User-Agent': 'UFC Bet Synthesiser/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (providerForUrl(response.url || link.url) !== link.provider)
        throw new Error('Source redirected to an unsupported host')
      const html = await response.text()
      if (html.length > 2_000_000) throw new Error('Result page is too large')
      const parsed =
        link.provider === 'ufc'
          ? parseUfcResultRows(html)
          : parseTapologyResultRows(html)
      if (parsed.length === 0)
        throw new Error('No completed results were found')
      const unmatched: string[] = []
      const outcomes = parsed.flatMap<ImportedFightOutcome>((row) => {
        const importedNames = new Set([
          row.fighterA.toLocaleLowerCase(),
          row.fighterB.toLocaleLowerCase(),
        ])
        const fight = fights.find(
          (candidate) =>
            importedNames.has(candidate.fighterA.name.toLocaleLowerCase()) &&
            importedNames.has(candidate.fighterB.name.toLocaleLowerCase()),
        )
        if (!fight) {
          unmatched.push(`${row.fighterA} vs ${row.fighterB}`)
          return []
        }
        const winnerFighterId = row.winner
          ? ([fight.fighterA, fight.fighterB].find(
              (fighter) =>
                fighter.name.toLocaleLowerCase() ===
                row.winner?.toLocaleLowerCase(),
            )?.id ?? null)
          : null
        return [
          {
            fightId: fight.id,
            fightLabel: `${fight.fighterA.name} vs ${fight.fighterB.name}`,
            status: row.status,
            winnerFighterId,
            method: row.method,
            round: row.round,
            sourceProvider: link.provider,
            sourceUrl: link.url,
            issues:
              row.status === 'winner' && !winnerFighterId
                ? ['Winner could not be matched']
                : [],
          },
        ]
      })
      await markCardSourceChecked(db, cardId, link.provider)
      providerPreviews.push({
        provider: link.provider,
        sourceUrl: link.url,
        outcomes,
        unmatched,
      })
    } catch (error) {
      errors.push(
        `${link.provider}: ${error instanceof Error ? error.message : 'fetch failed'}`,
      )
    }
  }
  if (providerPreviews.length === 0)
    throw new Error(`Results could not be fetched. ${errors.join('; ')}`)

  const primary = providerPreviews[0]
  const outcomes = primary.outcomes.map((outcome) => ({ ...outcome }))
  const conflicts: string[] = []
  for (const fallback of providerPreviews.slice(1)) {
    for (const fallbackOutcome of fallback.outcomes) {
      const preferred = outcomes.find(
        (outcome) => outcome.fightId === fallbackOutcome.fightId,
      )
      if (!preferred) {
        outcomes.push(fallbackOutcome)
        continue
      }
      const disagrees =
        preferred.status !== fallbackOutcome.status ||
        preferred.winnerFighterId !== fallbackOutcome.winnerFighterId ||
        (preferred.method !== null &&
          fallbackOutcome.method !== null &&
          preferred.method !== fallbackOutcome.method) ||
        (preferred.round !== null &&
          fallbackOutcome.round !== null &&
          preferred.round !== fallbackOutcome.round)
      if (disagrees) {
        const conflict = `${preferred.fightLabel}: UFC.com and Tapology disagree`
        preferred.issues.push(conflict)
        conflicts.push(conflict)
      } else {
        preferred.method ??= fallbackOutcome.method
        preferred.round ??= fallbackOutcome.round
      }
    }
  }
  const fetchedAt = new Date().toISOString()
  const transientOutcomes = outcomes.map((outcome) => ({
    fightId: outcome.fightId,
    status: outcome.status,
    winnerFighterId: outcome.winnerFighterId,
    method: outcome.method,
    round: outcome.round,
    recordedAt: null,
    updatedAt: fetchedAt,
    sourceProvider: outcome.sourceProvider,
    sourceUrl: outcome.sourceUrl,
    fetchedAt,
  }))
  return {
    provider: primary.provider,
    sourceUrl: primary.sourceUrl,
    outcomes,
    unmatched: providerPreviews.flatMap((preview) => preview.unmatched),
    conflicts,
    betProposals: proposeBetResolutions(
      await listBets(db, cardId),
      transientOutcomes,
    ),
  }
}

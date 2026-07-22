import {
  postCard,
  postFight,
  postMarketPrice,
  putCardSourceLink,
  type Card,
  type CardFetchPreview,
  type Fight,
} from './api'
import { PROVIDER_LABELS, type EventProvider } from '../shared/providers'

/**
 * BetMMA quotes one aggregated best-available price rather than a named book's
 * line, so its snapshots are labelled differently from the official pages.
 */
export function bookmakerLabel(provider: EventProvider): string {
  return provider === 'betmma'
    ? 'BetMMA best available'
    : `${PROVIDER_LABELS[provider]} event page`
}

/**
 * BetMMA is the only provider that reliably prices both sides of every bout, so
 * its prices are imported unless the owner opts out.
 */
export function importsOddsByDefault(provider: EventProvider): boolean {
  return provider === 'betmma'
}

export interface ImportPreviewResult {
  card: Card
  fights: Fight[]
  /** False when at least one page price was rejected and needs manual entry. */
  pricesComplete: boolean
}

export async function importPreviewOdds(
  preview: CardFetchPreview,
  cardId: string,
  fight: Fight,
  bout: CardFetchPreview['bouts'][number],
): Promise<boolean> {
  let complete = true
  const prices = [
    { raw: bout.fighter_a_odds_raw, fighter: fight.fighterA },
    { raw: bout.fighter_b_odds_raw, fighter: fight.fighterB },
  ]
  for (const price of prices) {
    if (!price.raw || price.raw === '-') continue
    try {
      await postMarketPrice({
        cardId,
        fightId: fight.id,
        bookmaker: bookmakerLabel(preview.provider),
        marketType: 'moneyline',
        selectionFighterId: price.fighter.id,
        selectionText: price.fighter.name,
        oddsInput: price.raw,
        sourceProvider: preview.provider,
        sourceUrl: preview.source_url,
      })
    } catch {
      complete = false
    }
  }
  return complete
}

export async function addPreviewBouts(
  preview: CardFetchPreview,
  cardId: string,
  bouts: CardFetchPreview['bouts'],
  importOdds: boolean,
): Promise<{ fights: Fight[]; pricesComplete: boolean }> {
  const fights: Fight[] = []
  let pricesComplete = true
  for (const bout of bouts) {
    const fight = await postFight({
      cardId,
      fighterAName: bout.fighter_a,
      fighterBName: bout.fighter_b,
      weightClass: bout.weight_class,
      boutOrder: bout.bout_order,
      isMainEvent: bout.is_main_event ?? false,
    })
    fights.push(fight)
    if (importOdds)
      pricesComplete =
        (await importPreviewOdds(preview, cardId, fight, bout)) &&
        pricesComplete
  }
  await putCardSourceLink(cardId, preview.provider, preview.source_url)
  return { fights, pricesComplete }
}

export async function importCardPreview(
  preview: CardFetchPreview,
  options: {
    unitValueCents: number
    importOdds: boolean
    budgetUnits?: number
  },
): Promise<ImportPreviewResult> {
  if (!preview.event_name)
    throw new Error('The preview has no event name to import')
  const parsedDate = preview.event_starts_at_raw
    ? new Date(preview.event_starts_at_raw)
    : null
  const card = await postCard({
    name: preview.event_name,
    eventStartsAtUtc:
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : null,
    budgetUnits: options.budgetUnits ?? 30,
    unitValueCents: options.unitValueCents,
  })
  const { fights, pricesComplete } = await addPreviewBouts(
    preview,
    card.id,
    preview.bouts,
    options.importOdds,
  )
  return { card, fights, pricesComplete }
}

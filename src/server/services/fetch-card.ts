import cardFetchPrompt from '../../../prompts/card-fetch.md?raw'
import { providerForUrl, type EventProvider } from '../../shared/providers'
import {
  cardFetchSchema,
  type CardFetchResult,
} from '../../shared/schemas/card-fetch'
import type { Bindings } from '../env'
import { callModel } from '../llm/call-model'
import { providerConfigurationFromEnv } from '../llm/configuration'
import type { ProviderConfiguration } from '../llm/provider'

export type CardPageProvider = EventProvider

export interface CardPagePreview extends CardFetchResult {
  provider: CardPageProvider
  source_url: string
  field_provenance: {
    event_name: CardPageProvider
    event_starts_at_raw: CardPageProvider
    bouts: CardPageProvider
  }
  /** Blocks import in the review UI. */
  conflicts: string[]
  /** Surfaced for review but never blocks import. */
  warnings: string[]
}

interface MarkupPreview {
  preview: CardFetchResult
  warnings: string[]
}

function plainMarkup(preview: CardFetchResult | null): MarkupPreview | null {
  return preview ? { preview, warnings: [] } : null
}

function withPreviewMetadata(
  preview: CardFetchResult,
  provider: CardPageProvider,
  sourceUrl: string,
  warnings: string[] = [],
): CardPagePreview {
  return {
    ...preview,
    provider,
    source_url: sourceUrl,
    field_provenance: {
      event_name: provider,
      event_starts_at_raw: provider,
      bouts: provider,
    },
    conflicts: [],
    warnings,
  }
}

interface HtmlElementSlice {
  openingTag: string
  innerHtml: string
  end: number
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function attributeValue(tag: string, attribute: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${escapeRegExp(attribute)}\\s*=\\s*(["'])(.*?)\\1`, 'i'),
  )
  return match?.[2] ?? null
}

function hasClass(tag: string, className: string): boolean {
  const classes = attributeValue(tag, 'class')
  return classes?.split(/\s+/).includes(className) ?? false
}

function balancedElement(
  html: string,
  tagName: string,
  openingEnd: number,
  openingTag: string,
): HtmlElementSlice | null {
  if (/\/\s*>$/.test(openingTag)) {
    return { openingTag, innerHtml: '', end: openingEnd }
  }

  const tags = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi')
  tags.lastIndex = openingEnd
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = tags.exec(html))) {
    const tag = match[0]
    if (new RegExp(`^<\\/${escapeRegExp(tagName)}\\b`, 'i').test(tag)) {
      depth -= 1
      if (depth === 0) {
        return {
          openingTag,
          innerHtml: html.slice(openingEnd, match.index),
          end: tags.lastIndex,
        }
      }
    } else if (!/\/\s*>$/.test(tag)) {
      depth += 1
    }
  }
  return null
}

function elementsByClass(html: string, className: string): HtmlElementSlice[] {
  const elements: HtmlElementSlice[] = []
  const openings = /<([a-z][\w:-]*)\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = openings.exec(html))) {
    const openingTag = match[0]
    if (!hasClass(openingTag, className)) continue
    const element = balancedElement(
      html,
      match[1] as string,
      openings.lastIndex,
      openingTag,
    )
    if (!element) continue
    elements.push(element)
    openings.lastIndex = element.end
  }
  return elements
}

function elementsByAttribute(
  html: string,
  tagName: string,
  attribute: string,
  value: string,
): HtmlElementSlice[] {
  const elements: HtmlElementSlice[] = []
  const openings = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = openings.exec(html))) {
    const openingTag = match[0]
    if (attributeValue(openingTag, attribute) !== value) continue
    const element = balancedElement(
      html,
      tagName,
      openings.lastIndex,
      openingTag,
    )
    if (!element) continue
    elements.push(element)
    openings.lastIndex = element.end
  }
  return elements
}

/**
 * Direct children only. BetMMA nests a whole table inside the odds row, so a
 * document-wide scan for `td` would descend into it.
 */
function childElements(html: string, tagName: string): HtmlElementSlice[] {
  const children: HtmlElementSlice[] = []
  const openings = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = openings.exec(html))) {
    const element = balancedElement(html, tagName, openings.lastIndex, match[0])
    if (!element) continue
    children.push(element)
    openings.lastIndex = element.end
  }
  return children
}

function decodeHtml(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        const codePoint = Number.parseInt(body.slice(2), 16)
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : entity
      }
      if (body.startsWith('#')) {
        const codePoint = Number.parseInt(body.slice(1), 10)
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : entity
      }
      return namedEntities[body.toLowerCase()] ?? entity
    },
  )
}

function textFromHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function firstClassText(html: string, className: string): string | null {
  const element = elementsByClass(html, className)[0]
  return element ? textFromHtml(element.innerHtml) || null : null
}

function pageTitle(html: string): string | null {
  const rawTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (!rawTitle) return null
  return (
    textFromHtml(rawTitle)
      .replace(/\s+\|\s+UFC.*$/i, '')
      .trim() || null
  )
}

function eventStartsAt(html: string): string | null {
  const dateElement =
    elementsByClass(html, 'hero-fixed-bar__date')[0] ??
    elementsByClass(html, 'hero-fixed-bar__date--mobile')[0] ??
    elementsByClass(html, 'c-event-fight-card-broadcaster__time')[0]
  if (!dateElement) return null
  const timestamp = attributeValue(dateElement.openingTag, 'data-timestamp')
  if (timestamp && /^\d{9,12}$/.test(timestamp)) {
    const date = new Date(Number(timestamp) * 1_000)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return textFromHtml(dateElement.innerHtml) || null
}

function displayedOdds(value: string | null): string | null {
  if (!value || value === '-') return null
  return value.length <= 32 ? value : null
}

function ufcMarkupPreview(html: string): CardFetchResult | null {
  const markup = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const fightElements = elementsByClass(markup, 'c-listing-fight')
  const bouts = fightElements.flatMap((fight, index) => {
    const fighterA = firstClassText(
      fight.innerHtml,
      'c-listing-fight__corner-name--red',
    )
    const fighterB = firstClassText(
      fight.innerHtml,
      'c-listing-fight__corner-name--blue',
    )
    if (!fighterA || !fighterB) return []
    const odds = elementsByClass(
      fight.innerHtml,
      'c-listing-fight__odds-amount',
    ).map((element) => displayedOdds(textFromHtml(element.innerHtml)))
    const weightClass = firstClassText(
      fight.innerHtml,
      'c-listing-fight__class-text',
    )?.replace(/\s+Bout$/i, '')
    return [
      {
        fighter_a: fighterA,
        fighter_b: fighterB,
        fighter_a_odds_raw: odds[0] ?? null,
        fighter_b_odds_raw: odds[1] ?? null,
        weight_class: weightClass || null,
        bout_order: index + 1,
        is_main_event: index === 0,
      },
    ]
  })

  if (bouts.length === 0) return null
  return cardFetchSchema.parse({
    event_name: pageTitle(markup),
    event_starts_at_raw: eventStartsAt(markup),
    bouts,
  })
}

function tapologyMarkupPreview(html: string): CardFetchResult | null {
  const markup = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const fightElements = [
    ...elementsByClass(markup, 'fightCardBout'),
    ...elementsByClass(markup, 'fightCard'),
  ]
  const seen = new Set<string>()
  const bouts = fightElements.flatMap((fight, index) => {
    const nameElements = elementsByClass(
      fight.innerHtml,
      'fightCardFighterName',
    )
    const names = nameElements
      .map((element) => textFromHtml(element.innerHtml))
      .filter(Boolean)
    if (names.length < 2) return []
    const fighterA = names[0] as string
    const fighterB = names[1] as string
    const key = `${fighterA.toLocaleLowerCase()}|${fighterB.toLocaleLowerCase()}`
    if (seen.has(key)) return []
    seen.add(key)
    const odds = elementsByClass(fight.innerHtml, 'fightOdds')
      .map(
        (element) =>
          textFromHtml(element.innerHtml).match(/[+-]\d{2,5}|\d+\.\d+/)?.[0] ??
          null,
      )
      .filter((value): value is string => Boolean(value))
    return [
      {
        fighter_a: fighterA,
        fighter_b: fighterB,
        fighter_a_odds_raw: odds[0] ?? null,
        fighter_b_odds_raw: odds[1] ?? null,
        weight_class: null,
        bout_order: null,
        is_main_event: index === 0 ? true : null,
      },
    ]
  })
  if (bouts.length === 0) return null
  return cardFetchSchema.parse({
    event_name: pageTitle(markup),
    event_starts_at_raw: null,
    bouts: bouts.map((bout, index) => ({ ...bout, bout_order: index + 1 })),
  })
}

/**
 * BetMMA publishes a weight limit rather than a division name, and never states
 * whether a bout is a women's division, so these are the men's names only.
 */
const BETMMA_WEIGHT_CLASSES: Record<string, string> = {
  '115': 'Strawweight',
  '125': 'Flyweight',
  '135': 'Bantamweight',
  '145': 'Featherweight',
  '155': 'Lightweight',
  '170': 'Welterweight',
  '185': 'Middleweight',
  '205': 'Light Heavyweight',
  '265': 'Heavyweight',
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

const BETMMA_FIGHT_ANCHOR = /ufc_betting_advice\.php\?[^'"]*?Fight=\d+/i
const BETMMA_FIGHTER_LINK = /fighter_profile\.php\?[^'"]*?['"][^>]*>([^<]+)</gi
const BETMMA_ODDS = /^@?(\d+(?:\.\d+)?)$/

function betmmaEventName(markup: string): string | null {
  const heading = markup.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]
  const fromHeading = heading
    ? textFromHtml(heading).replace(/^The Next UFC Event is:\s*/i, '')
    : null
  if (fromHeading) return fromHeading
  return pageTitle(markup)?.replace(/^Next UFC Event:\s*/i, '') || null
}

/**
 * BetMMA states the date in prose and never publishes a start time, so this
 * normalises to a date-only ISO string the card importer can parse.
 */
function betmmaEventDate(markup: string): string | null {
  const match = textFromHtml(markup).match(
    /takes place in [^.]*? on (\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i,
  )
  if (!match) return null
  const month = MONTHS.indexOf((match[2] as string).toLowerCase())
  if (month < 0) return null
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${(match[1] as string).padStart(2, '0')}`
}

function betmmaBoutOdds(blockHtml: string): [string | null, string | null] {
  for (const row of childElements(blockHtml, 'tr')) {
    const cells = childElements(row.innerHtml, 'td')
    if (cells.length < 2) continue
    const first = textFromHtml((cells[0] as HtmlElementSlice).innerHtml)
    const last = textFromHtml(
      (cells[cells.length - 1] as HtmlElementSlice).innerHtml,
    )
    const fighterA = first.match(BETMMA_ODDS)?.[1] ?? null
    const fighterB = last.match(BETMMA_ODDS)?.[1] ?? null
    if (fighterA || fighterB) return [fighterA, fighterB]
  }
  return [null, null]
}

function betmmaMarkupPreview(html: string): MarkupPreview | null {
  const markup = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const blocks = elementsByAttribute(markup, 'table', 'cellspacing', '5')
  const warnings: string[] = []
  const corrections: string[] = []
  let skipped = 0

  const bouts = blocks.flatMap((block, index) => {
    // The "vs" link separates the two fighters and is the only reliable way to
    // tell them apart from the last-fight opponents, which use the same
    // fighter_profile.php URL further down the block.
    const separatorAt = block.innerHtml.match(BETMMA_FIGHT_ANCHOR)?.index
    if (separatorAt === undefined) {
      skipped += 1
      return []
    }
    const links = [...block.innerHtml.matchAll(BETMMA_FIGHTER_LINK)]
    const before = links.filter((link) => link.index < separatorAt)
    const after = links.filter((link) => link.index > separatorAt)
    const fighterA = textFromHtml(before[before.length - 1]?.[1] ?? '')
    const fighterB = textFromHtml(after[0]?.[1] ?? '')
    if (!fighterA || !fighterB) {
      skipped += 1
      return []
    }

    const [fighterAOdds, fighterBOdds] = betmmaBoutOdds(block.innerHtml)
    const fightWeight = block.innerHtml.match(
      /Fight Weight:\s*(\d+)\s*lbs/i,
    )?.[1]
    const listed = block.innerHtml.match(
      /(\d+(?:\.\d+)?)\s*lbs\s*<strong\b[^>]*>\s*Weight\s*<\/strong>\s*(\d+(?:\.\d+)?)\s*lbs/i,
    )
    // BetMMA's "Fight Weight" is unreliable — several bouts on a typical card
    // carry the wrong limit, usually a 205lbs bout stated as 265lbs. Where it
    // disagrees with a weight both fighters share, and that shared weight is
    // itself a division limit, the fighters' figure is the trustworthy one.
    const agreedWeight = listed && listed[1] === listed[2] ? listed[1] : null
    const divisionWeight =
      agreedWeight &&
      agreedWeight !== fightWeight &&
      BETMMA_WEIGHT_CLASSES[agreedWeight]
        ? agreedWeight
        : fightWeight
    if (fightWeight && divisionWeight !== fightWeight) {
      corrections.push(
        `${fighterA} vs ${fighterB} (${divisionWeight}lbs, not ${fightWeight}lbs)`,
      )
    }

    return [
      {
        fighter_a: fighterA,
        fighter_b: fighterB,
        fighter_a_odds_raw: fighterAOdds,
        fighter_b_odds_raw: fighterBOdds,
        weight_class: divisionWeight
          ? (BETMMA_WEIGHT_CLASSES[divisionWeight] ?? `${divisionWeight}lbs`)
          : null,
        bout_order: index + 1,
        is_main_event: index === 0,
      },
    ]
  })

  if (bouts.length === 0) return null
  if (skipped > 0) {
    warnings.push(
      `${skipped} block(s) on the BetMMA page could not be read as a bout. Check the card against the source page before importing.`,
    )
  }
  if (corrections.length > 0) {
    warnings.push(
      `BetMMA's stated fight weight disagreed with both fighters' listed weight on ${corrections.length} bout(s), so the card uses the fighters' division instead: ${corrections.join('; ')}.`,
    )
  }
  warnings.push(
    'BetMMA publishes the event date but not its start time, and does not mark women’s divisions. Confirm the Melbourne start date and time before importing, and confirm weight classes on the card afterward.',
  )
  return {
    preview: cardFetchSchema.parse({
      event_name: betmmaEventName(markup),
      event_starts_at_raw: betmmaEventDate(markup),
      bouts: bouts.map((bout, index) => ({ ...bout, bout_order: index + 1 })),
    }),
    warnings,
  }
}

function objectValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(objectValues)
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  return [record, ...Object.values(record).flatMap(objectValues)]
}

function nameOf(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (value && typeof value === 'object') {
    const name = (value as Record<string, unknown>).name
    return typeof name === 'string' ? name.trim() || null : null
  }
  return null
}

function structuredPreview(html: string): CardFetchResult | null {
  const scripts = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ]
  for (const script of scripts) {
    try {
      const decoded = JSON.parse(script[1] ?? '') as unknown
      for (const item of objectValues(decoded)) {
        const record = item as Record<string, unknown>
        const type = Array.isArray(record['@type'])
          ? record['@type']
          : [record['@type']]
        if (!type.some((entry) => entry === 'SportsEvent' || entry === 'Event'))
          continue
        const subEvents = Array.isArray(record.subEvent)
          ? record.subEvent
          : Array.isArray(record.subEvents)
            ? record.subEvents
            : []
        const bouts = subEvents.flatMap((subEvent, index) => {
          if (!subEvent || typeof subEvent !== 'object') return []
          const bout = subEvent as Record<string, unknown>
          const competitors = Array.isArray(bout.competitor)
            ? bout.competitor
                .map(nameOf)
                .filter((name): name is string => Boolean(name))
            : []
          if (competitors.length !== 2) return []
          return [
            {
              fighter_a: competitors[0] as string,
              fighter_b: competitors[1] as string,
              fighter_a_odds_raw: null,
              fighter_b_odds_raw: null,
              weight_class: null,
              bout_order: index + 1,
              is_main_event: index === 0 ? true : null,
            },
          ]
        })
        if (bouts.length > 0) {
          return cardFetchSchema.parse({
            event_name: nameOf(record),
            event_starts_at_raw:
              typeof record.startDate === 'string' ? record.startDate : null,
            bouts,
          })
        }
      }
    } catch {
      // Continue to the next JSON-LD block or the model fallback.
    }
  }
  return null
}

function strippedPageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100_000)
}

export async function fetchCardPreview(
  env: Bindings,
  rawUrl: string,
  configurationOverride?: ProviderConfiguration | null,
): Promise<CardPagePreview> {
  const url = new URL(rawUrl)
  const provider = providerForUrl(url)
  if (!provider) {
    throw new Error(
      'Only HTTPS BetMMA, UFC.com or Tapology event pages are allowed',
    )
  }
  const response = await fetch(url, {
    headers: { 'User-Agent': 'UFC Bet Synthesiser/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12_000),
  })
  const responseUrl = new URL(response.url || url.toString())
  if (providerForUrl(responseUrl) !== provider) {
    throw new Error('The event page redirected to an unsupported host')
  }
  if (!response.ok)
    throw new Error(`Event page returned HTTP ${response.status}`)
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > 2_000_000) throw new Error('Event page is too large')
  const html = await response.text()
  if (html.length > 2_000_000) throw new Error('Event page is too large')
  const markup =
    provider === 'betmma'
      ? betmmaMarkupPreview(html)
      : plainMarkup(
          provider === 'ufc'
            ? ufcMarkupPreview(html)
            : tapologyMarkupPreview(html),
        )
  if (markup)
    return withPreviewMetadata(
      markup.preview,
      provider,
      responseUrl.toString(),
      markup.warnings,
    )
  const structured = structuredPreview(html)
  if (structured)
    return withPreviewMetadata(structured, provider, responseUrl.toString())

  const configuration =
    configurationOverride ?? providerConfigurationFromEnv(env)
  if (!configuration) {
    throw new Error(
      'Structured event data was unavailable; configure the LLM fallback or enter the card manually',
    )
  }
  const result = await callModel(
    {
      task: 'card_fetch',
      schema: cardFetchSchema,
      temperature: 0,
      messages: [
        { role: 'system', content: cardFetchPrompt },
        {
          role: 'user',
          content: `Event URL: ${url.toString()}\n\nPAGE_CONTENT_START\n${strippedPageText(html)}\nPAGE_CONTENT_END`,
        },
      ],
      metadata: { url: url.toString() },
    },
    configuration,
  )
  return withPreviewMetadata(result.data, provider, responseUrl.toString())
}

function eventLinks(html: string, pageUrl: URL, provider: CardPageProvider) {
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => {
      try {
        return new URL(match[1] ?? '', pageUrl)
      } catch {
        return null
      }
    })
    .filter((url): url is URL => Boolean(url))
    .filter((url) => providerForUrl(url) === provider)
    .filter((url) =>
      provider === 'ufc'
        ? /^\/event\//i.test(url.pathname)
        : /^\/fightcenter\/events\//i.test(url.pathname),
    )
  return [...new Map(links.map((url) => [url.toString(), url])).values()].slice(
    0,
    8,
  )
}

export async function discoverNextCardPreview(
  env: Bindings,
  configurationOverride?: ProviderConfiguration | null,
): Promise<CardPagePreview> {
  const discoveryPages: Array<{
    provider: CardPageProvider
    url: string
    mode: 'direct' | 'crawl'
  }> = [
    // BetMMA's page always describes exactly the next event and carries prices
    // for both sides, so it needs no listing crawl.
    {
      provider: 'betmma',
      url: 'https://www.betmma.tips/next_ufc_event.php',
      mode: 'direct',
    },
    { provider: 'ufc', url: 'https://www.ufc.com/events', mode: 'crawl' },
    {
      provider: 'tapology',
      url: 'https://www.tapology.com/fightcenter?group=ufc',
      mode: 'crawl',
    },
  ]
  const errors: string[] = []
  for (const discovery of discoveryPages) {
    try {
      if (discovery.mode === 'direct') {
        return await fetchCardPreview(env, discovery.url, configurationOverride)
      }
      const pageUrl = new URL(discovery.url)
      const response = await fetch(pageUrl, {
        headers: { 'User-Agent': 'UFC Bet Synthesiser/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      if (html.length > 2_000_000) throw new Error('listing page is too large')
      const candidates = eventLinks(html, pageUrl, discovery.provider)
      const previews: CardPagePreview[] = []
      for (const candidate of candidates) {
        try {
          previews.push(
            await fetchCardPreview(
              env,
              candidate.toString(),
              configurationOverride,
            ),
          )
        } catch {
          // A listing can contain past or non-event links; try the next item.
        }
      }
      const now = Date.now()
      const upcoming = previews
        .map((preview) => ({
          preview,
          startsAt: preview.event_starts_at_raw
            ? Date.parse(preview.event_starts_at_raw)
            : Number.NaN,
        }))
        .filter(
          (item) => Number.isFinite(item.startsAt) && item.startsAt >= now,
        )
        .sort((left, right) => left.startsAt - right.startsAt)[0]?.preview
      if (upcoming) return upcoming
      if (previews[0]) return previews[0]
      throw new Error('no event links could be parsed')
    } catch (error) {
      errors.push(
        `${discovery.provider}: ${error instanceof Error ? error.message : 'discovery failed'}`,
      )
    }
  }
  throw new Error(
    `Automatic event discovery was unavailable. Enter a BetMMA, UFC.com or Tapology URL manually. ${errors.join('; ')}`,
  )
}

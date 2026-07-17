import cardFetchPrompt from '../../../prompts/card-fetch.md?raw'
import {
  cardFetchSchema,
  type CardFetchResult,
} from '../../shared/schemas/card-fetch'
import type { Bindings } from '../env'
import { callModel } from '../llm/call-model'
import { providerConfigurationFromEnv } from '../llm/configuration'
import type { ProviderConfiguration } from '../llm/provider'

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
): Promise<CardFetchResult> {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || !/(^|\.)ufc\.com$/i.test(url.hostname)) {
    throw new Error('Only HTTPS UFC.com event pages are allowed')
  }
  const response = await fetch(url, {
    headers: { 'User-Agent': 'UFC Bet Synthesiser/1.0' },
    redirect: 'follow',
  })
  if (!response.ok)
    throw new Error(`UFC event page returned HTTP ${response.status}`)
  const html = await response.text()
  const structured = structuredPreview(html)
  if (structured) return structured

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
  return result.data
}

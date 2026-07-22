export const EVENT_PROVIDERS = ['ufc', 'tapology', 'betmma'] as const

export type EventProvider = (typeof EVENT_PROVIDERS)[number]

/**
 * BetMMA's next-event page publishes upcoming cards and prices only, so it is
 * deliberately not a source for completed fight outcomes.
 */
export const RESULTS_PROVIDERS = ['ufc', 'tapology'] as const

export type ResultsProvider = (typeof RESULTS_PROVIDERS)[number]

export const PROVIDER_HOSTS: Record<EventProvider, readonly string[]> = {
  ufc: ['ufc.com', 'www.ufc.com'],
  tapology: ['tapology.com', 'www.tapology.com'],
  betmma: ['betmma.tips', 'www.betmma.tips'],
}

export const PROVIDER_LABELS: Record<EventProvider, string> = {
  ufc: 'UFC.com',
  tapology: 'Tapology',
  betmma: 'BetMMA',
}

export const EVENT_PROVIDER_NAMES = EVENT_PROVIDERS.map(
  (provider) => PROVIDER_LABELS[provider],
).join(', ')

export function providerForUrl(url: URL): EventProvider | null {
  if (url.protocol !== 'https:') return null
  const hostname = url.hostname.toLowerCase()
  return (
    EVENT_PROVIDERS.find((provider) =>
      PROVIDER_HOSTS[provider].includes(hostname),
    ) ?? null
  )
}

export function isResultsProvider(
  provider: EventProvider,
): provider is ResultsProvider {
  return (RESULTS_PROVIDERS as readonly EventProvider[]).includes(provider)
}

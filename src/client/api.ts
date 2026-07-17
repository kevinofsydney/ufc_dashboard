export interface Card {
  id: string
  name: string
  eventStartsAtUtc: string | null
  displayTimezone: string
  budgetUnits: number
  unitValueCents: number
  currency: string
  lifecycle: string
  createdAt: string
  updatedAt: string
}

export interface Capper {
  id: string
  name: string
  notes: string | null
  active: boolean
}

export interface Source {
  id: string
  cardId: string
  primaryCapperId: string | null
  primaryCapperName: string | null
  medium: string
  extractionMode: string
  title: string | null
  rawText: string
  addedAt: string
}

export interface Fight {
  id: string
  cardId: string
  fighterA: { id: string; name: string }
  fighterB: { id: string; name: string }
  weightClass: string | null
  boutOrder: number | null
  isMainEvent: boolean
  status: string
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const body = (await response.json()) as T & { error?: string }
  if (!response.ok)
    throw new Error(body.error ?? 'The request could not be completed')
  return body
}

export async function getCards(): Promise<Card[]> {
  return (await requestJson<{ cards: Card[] }>('/api/cards')).cards
}

export async function postCard(input: {
  name: string
  eventStartsAtUtc: string | null
  budgetUnits: number
  unitValueCents: number
}): Promise<Card> {
  return (
    await requestJson<{ card: Card }>('/api/cards', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).card
}

export async function getFights(cardId: string): Promise<Fight[]> {
  return (
    await requestJson<{ fights: Fight[] }>(
      `/api/fights?cardId=${encodeURIComponent(cardId)}`,
    )
  ).fights
}

export async function postFight(input: {
  cardId: string
  fighterAName: string
  fighterBName: string
  weightClass: string | null
  boutOrder: number | null
  isMainEvent: boolean
}): Promise<Fight> {
  return (
    await requestJson<{ fight: Fight }>('/api/fights', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).fight
}

export async function getCappers(): Promise<Capper[]> {
  return (await requestJson<{ cappers: Capper[] }>('/api/cappers')).cappers
}

export async function postCapper(input: {
  name: string
  notes?: string
}): Promise<Capper> {
  return (
    await requestJson<{ capper: Capper }>('/api/cappers', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).capper
}

export async function getSources(cardId: string): Promise<Source[]> {
  return (
    await requestJson<{ sources: Source[] }>(
      `/api/sources?cardId=${encodeURIComponent(cardId)}`,
    )
  ).sources
}

export async function postSource(input: {
  cardId: string
  primaryCapperId: string | null
  medium: string
  extractionMode: string
  title: string | null
  sourceUrl: string | null
  rawText: string
}): Promise<Source> {
  return (
    await requestJson<{ source: Source }>('/api/sources', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).source
}

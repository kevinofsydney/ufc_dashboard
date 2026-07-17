export interface Card {
  id: string
  name: string
  eventStartsAtUtc: string | null
  displayTimezone: string
  budgetUnits: number
  unitValueCents: number
  currency: string
  lifecycle: 'draft' | 'ready' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: string
  updatedAt: string
}

export interface Capper {
  id: string
  name: string
  notes: string | null
  active: boolean
}

export interface Alias {
  id: string
  entityId: string
  entityName: string
  aliasDisplay: string
  aliasNormalized: string
}

export interface CardFetchPreview {
  event_name: string | null
  event_starts_at_raw: string | null
  bouts: Array<{
    fighter_a: string
    fighter_b: string
    weight_class: string | null
    bout_order: number | null
    is_main_event: boolean | null
  }>
}

export interface Source {
  id: string
  cardId: string
  primaryCapperId: string | null
  primaryCapperName: string | null
  medium: string
  extractionMode: string
  sourceUrl: string | null
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
  status: 'scheduled' | 'cancelled' | 'completed'
  createdAt: string
  updatedAt: string
}

export interface FightOutcome {
  fightId: string
  status:
    'pending' | 'winner' | 'draw' | 'no_contest' | 'overturned' | 'cancelled'
  winnerFighterId: string | null
  method:
    'ko_tko' | 'submission' | 'decision' | 'disqualification' | 'other' | null
  round: '1' | '2' | '3' | '4' | '5' | null
  recordedAt: string | null
  updatedAt: string
}

export interface CapperGrade {
  capperId: string
  capperName: string
  winnerCallsGraded: number
  winnerHits: number
  winnerHitRate: number | null
  methodCallsGraded: number
  methodHits: number
  methodHitRate: number | null
  roundCallsGraded: number
  roundHits: number
  roundHitRate: number | null
  pricedTipsGraded: number
  tipRoiAtStatedOdds: number | null
}

export interface MarketPrice {
  id: string
  cardId: string
  fightId: string | null
  fighterAName: string | null
  fighterBName: string | null
  bookmaker: string | null
  marketType: string
  selectionFighterId: string | null
  selectionFighterName: string | null
  selectionText: string
  decimalOdds: string
  capturedAt: string
  source: 'manual' | 'api'
}

export interface ExtractionRun {
  id: string
  sourceId: string
  sourceTitle: string | null
  status: 'pending' | 'running' | 'needs_review' | 'accepted' | 'failed'
  provider: string
  model: string
  promptVersion: string
  rawResponse: string | null
  reviewedResponse: string | null
  validationErrors: string | null
  tokenUsage: { input: number | null; output: number | null } | null
  estimatedCostMicros: number | null
  completedAt: string | null
  createdAt: string
}

export interface FightSummary {
  fightId: string
  consensusFighterId: string | null
  weightedShare: number | null
  rawSupportCount: number
  eligibleVoterCount: number
  consensusMethod: string | null
  methodSupportCount: number
  methodEligibleCount: number
  consensusRound: string | null
  roundSupportCount: number
  roundEligibleCount: number
  badges: string[]
  overviewText: string
  evidence: {
    missingCurrentMoneylinePrice: boolean
    supporters: Array<{
      capperId: string
      capperName: string
      confidence: 'lean' | 'solid' | 'lock'
      reasoning: string
      provenance: 'direct' | 'aggregated'
    }>
    dissenters: Array<{
      capperId: string
      capperName: string
      pickedFighterId: string
      confidence: 'lean' | 'solid' | 'lock'
      reasoning: string
    }>
    tracker: {
      allChannels: {
        fighter_a_count: number | null
        fighter_b_count: number | null
        total: number | null
      } | null
      bestOverall: {
        fighter_a_count: number | null
        fighter_b_count: number | null
        total: number | null
      } | null
      bestFavourite: unknown
      bestUnderdog: unknown
      movCounts: unknown
      bestMov: unknown
      bookmakerNote: string | null
    } | null
  }
}

export interface Synthesis {
  id: string
  cardId: string
  status: 'draft' | 'accepted'
  recommendedUnits: number
  unspentUnits: number
  fightSummaries: FightSummary[]
  bets: Array<{
    id: string
    selectionText: string
    tier: 'core' | 'value' | 'parlay'
    units: number
    decimalOdds: number
    rationale: string
    supportingCappers: string[]
  }>
}

export interface Bet {
  id: string
  cardId: string
  synthesisRunId: string | null
  origin: 'synthesised' | 'manual'
  tier: 'core' | 'value' | 'parlay' | 'manual'
  marketType: string
  selectionText: string
  recommendedUnits: string | null
  recommendedOdds: string | null
  consensusShare: string | null
  state: 'recommended' | 'skipped' | 'placed' | 'settled'
  oddsTaken: string | null
  settlementOdds: string | null
  stakeUnits: string | null
  result: 'pending' | 'won' | 'lost' | 'push' | 'void'
  netProfitUnits: string | null
  notes: string | null
  createdAt: string
  legs: Array<{
    id: string
    fightId: string
    marketType: string
    selectionFighterId: string | null
    selectionText: string
    legResult: 'pending' | 'won' | 'lost' | 'push' | 'void'
  }>
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

export async function downloadBackup(): Promise<void> {
  const response = await fetch('/api/backup')
  if (!response.ok) throw new Error('The backup could not be downloaded')
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] ??
    `ufc-bet-synthesiser-${new Date().toISOString().slice(0, 10)}.json`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function getCards(): Promise<Card[]> {
  return (await requestJson<{ cards: Card[] }>('/api/cards')).cards
}

export async function fetchCardPreview(url: string): Promise<CardFetchPreview> {
  return (
    await requestJson<{ preview: CardFetchPreview }>(
      '/api/cards/fetch-preview',
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      },
    )
  ).preview
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

export async function patchCard(
  cardId: string,
  input: {
    name: string
    eventStartsAtUtc: string | null
    budgetUnits: number
    unitValueCents: number
    lifecycle: Card['lifecycle']
  },
): Promise<Card> {
  return (
    await requestJson<{ card: Card }>(
      `/api/cards/${encodeURIComponent(cardId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    )
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

export async function patchFight(
  fightId: string,
  input: {
    fighterAName: string
    fighterBName: string
    weightClass: string | null
    boutOrder: number | null
    isMainEvent: boolean
    status: Fight['status']
  },
): Promise<Fight> {
  return (
    await requestJson<{ fight: Fight }>(
      `/api/fights/${encodeURIComponent(fightId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    )
  ).fight
}

export async function hideFight(fightId: string): Promise<void> {
  await requestJson<{ hidden: true }>(
    `/api/fights/${encodeURIComponent(fightId)}`,
    {
      method: 'DELETE',
    },
  )
}

export async function getFightOutcomes(
  cardId: string,
): Promise<FightOutcome[]> {
  return (
    await requestJson<{ outcomes: FightOutcome[] }>(
      `/api/fight-outcomes?cardId=${encodeURIComponent(cardId)}`,
    )
  ).outcomes
}

export async function putFightOutcome(
  fightId: string,
  input: Pick<FightOutcome, 'status' | 'winnerFighterId' | 'method' | 'round'>,
): Promise<FightOutcome> {
  return (
    await requestJson<{ outcome: FightOutcome }>(
      `/api/fights/${encodeURIComponent(fightId)}/outcome`,
      { method: 'PUT', body: JSON.stringify(input) },
    )
  ).outcome
}

export async function getCappers(): Promise<Capper[]> {
  return (await requestJson<{ cappers: Capper[] }>('/api/cappers')).cappers
}

export async function getCapperGrades(): Promise<CapperGrade[]> {
  return (await requestJson<{ grades: CapperGrade[] }>('/api/capper-grades'))
    .grades
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

export async function patchCapper(
  capperId: string,
  input: { name: string; notes: string | null; active: boolean },
): Promise<Capper> {
  return (
    await requestJson<{ capper: Capper }>(
      `/api/cappers/${encodeURIComponent(capperId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    )
  ).capper
}

export async function getFighterAliases(): Promise<Alias[]> {
  return (await requestJson<{ aliases: Alias[] }>('/api/fighter-aliases'))
    .aliases
}

export async function postFighterAlias(
  entityId: string,
  aliasDisplay: string,
): Promise<Alias> {
  return (
    await requestJson<{ alias: Alias }>('/api/fighter-aliases', {
      method: 'POST',
      body: JSON.stringify({ entityId, aliasDisplay }),
    })
  ).alias
}

export async function getCapperAliases(): Promise<Alias[]> {
  return (await requestJson<{ aliases: Alias[] }>('/api/capper-aliases'))
    .aliases
}

export async function postCapperAlias(
  entityId: string,
  aliasDisplay: string,
): Promise<Alias> {
  return (
    await requestJson<{ alias: Alias }>('/api/capper-aliases', {
      method: 'POST',
      body: JSON.stringify({ entityId, aliasDisplay }),
    })
  ).alias
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

export async function patchSource(
  sourceId: string,
  input: Omit<Parameters<typeof postSource>[0], 'cardId'>,
): Promise<Source> {
  return (
    await requestJson<{ source: Source }>(
      `/api/sources/${encodeURIComponent(sourceId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    )
  ).source
}

export async function getMarketPrices(cardId: string): Promise<MarketPrice[]> {
  return (
    await requestJson<{ prices: MarketPrice[] }>(
      `/api/market-prices?cardId=${encodeURIComponent(cardId)}`,
    )
  ).prices
}

export async function postMarketPrice(input: {
  cardId: string
  fightId: string
  bookmaker: string | null
  marketType: string
  selectionFighterId: string
  selectionText: string
  oddsInput: string
}): Promise<MarketPrice> {
  return (
    await requestJson<{ price: MarketPrice }>('/api/market-prices', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).price
}

export async function hideMarketPrice(priceId: string): Promise<void> {
  await requestJson<{ hidden: true }>(
    `/api/market-prices/${encodeURIComponent(priceId)}`,
    { method: 'DELETE' },
  )
}

export async function getExtractionRuns(
  cardId: string,
): Promise<ExtractionRun[]> {
  return (
    await requestJson<{ runs: ExtractionRun[] }>(
      `/api/extractions?cardId=${encodeURIComponent(cardId)}`,
    )
  ).runs
}

export async function parseSource(sourceId: string): Promise<ExtractionRun> {
  return (
    await requestJson<{ run: ExtractionRun }>(
      `/api/sources/${encodeURIComponent(sourceId)}/parse`,
      { method: 'POST' },
    )
  ).run
}

export async function acceptExtraction(
  runId: string,
  output: unknown,
): Promise<void> {
  await requestJson<{ accepted: true }>(
    `/api/extractions/${encodeURIComponent(runId)}/accept`,
    { method: 'POST', body: JSON.stringify({ output }) },
  )
}

export async function postSynthesis(cardId: string): Promise<Synthesis> {
  return (
    await requestJson<{ synthesis: Synthesis }>(
      `/api/cards/${encodeURIComponent(cardId)}/syntheses`,
      { method: 'POST' },
    )
  ).synthesis
}

export async function getCurrentSynthesis(
  cardId: string,
): Promise<Synthesis | null> {
  return (
    await requestJson<{ synthesis: Synthesis | null }>(
      `/api/cards/${encodeURIComponent(cardId)}/synthesis`,
    )
  ).synthesis
}

export async function acceptSynthesis(runId: string): Promise<void> {
  await requestJson<{ accepted: true }>(
    `/api/syntheses/${encodeURIComponent(runId)}/accept`,
    { method: 'POST' },
  )
}

export async function getBets(cardId: string): Promise<Bet[]> {
  return (
    await requestJson<{ bets: Bet[] }>(
      `/api/bets?cardId=${encodeURIComponent(cardId)}`,
    )
  ).bets
}

export async function getAnalyticsBets(): Promise<Bet[]> {
  return (await requestJson<{ bets: Bet[] }>('/api/analytics/bets')).bets
}

export async function postManualBet(input: {
  cardId: string
  marketType: string
  selectionText: string
  oddsTakenInput: string
  stakeUnits: number
  notes: string | null
  legs?: Array<{
    fightId: string
    marketType: string
    selectionFighterId: string | null
    selectionText: string
  }>
}): Promise<Bet> {
  return (
    await requestJson<{ bet: Bet }>('/api/bets', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).bet
}

export async function placeBet(
  betId: string,
  oddsTakenInput: string,
  stakeUnits: number,
): Promise<Bet> {
  return (
    await requestJson<{ bet: Bet }>(`/api/bets/${encodeURIComponent(betId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'place', oddsTakenInput, stakeUnits }),
    })
  ).bet
}

export async function skipBet(betId: string): Promise<Bet> {
  return (
    await requestJson<{ bet: Bet }>(`/api/bets/${encodeURIComponent(betId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'skip' }),
    })
  ).bet
}

export async function settleBet(
  betId: string,
  result: 'won' | 'lost' | 'push' | 'void',
  settlementOddsInput: string | null,
): Promise<Bet> {
  return (
    await requestJson<{ bet: Bet }>(`/api/bets/${encodeURIComponent(betId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'settle', result, settlementOddsInput }),
    })
  ).bet
}

export async function unsettleBet(betId: string): Promise<Bet> {
  return (
    await requestJson<{ bet: Bet }>(`/api/bets/${encodeURIComponent(betId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'unsettle' }),
    })
  ).bet
}

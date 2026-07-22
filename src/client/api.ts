import {
  getOpenRouterSessionSettings,
  openRouterHeaders,
  type OpenRouterSessionSettings,
} from './llm-settings'
import type { ReasoningEffort } from '../shared/schemas/openrouter'
import type { EventProvider, ResultsProvider } from '../shared/providers'

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

export interface ApplicationSettings {
  currentBankrollCents: number
  defaultUnitValueCents: number
  preferredOpenRouterModel: string | null
  savedOpenRouterModels: string[]
  openRouterReasoningEffort: ReasoningEffort
  updatedAt: string
}

export interface Alias {
  id: string
  entityId: string
  entityName: string
  aliasDisplay: string
  aliasNormalized: string
}

export interface CardFetchPreview {
  provider: EventProvider
  source_url: string
  field_provenance: {
    event_name: EventProvider
    event_starts_at_raw: EventProvider
    bouts: EventProvider
  }
  conflicts: string[]
  warnings: string[]
  event_name: string | null
  event_starts_at_raw: string | null
  bouts: Array<{
    fighter_a: string
    fighter_b: string
    fighter_a_odds_raw: string | null
    fighter_b_odds_raw: string | null
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
  sourceProvider: ResultsProvider | null
  sourceUrl: string | null
  fetchedAt: string | null
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
  sourceProvider: EventProvider | null
  sourceUrl: string | null
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
  fightId: string | null
  selectionFighterId: string | null
  method: string | null
  round: string | null
  lineValue: string | null
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
    method: string | null
    round: string | null
    lineValue: string | null
    selectionText: string
    legResult: 'pending' | 'won' | 'lost' | 'push' | 'void'
  }>
}

export interface CardSourceLink {
  id: string
  cardId: string
  provider: EventProvider
  url: string
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

export type WorkflowStageState =
  | 'not_started'
  | 'in_progress'
  | 'needs_attention'
  | 'ready'
  | 'waiting'
  | 'complete'

export interface WorkflowStageStatus {
  state: WorkflowStageState
  summary: string
  blockers: string[]
  counts: Record<string, number>
  stale: boolean
}

export interface CardWorkflowStatus {
  cardId: string
  stages: Record<
    'event' | 'tipperPicks' | 'recommendations' | 'myBets' | 'results',
    WorkflowStageStatus
  >
}

export interface TipCsvPreview {
  rows: Array<{
    rowNumber: number
    capper: string
    fight: string
    selection: string
    market: string
    line: string | null
    confidence: 'lean' | 'solid' | 'lock'
    odds: string | null
    stakeUnits: number | null
    reasoning: string
    sourceUrl: string | null
    fightId: string | null
    selectionFighterId: string | null
    normalizedSelection: string
    willCreateCapper: boolean
    issues: string[]
  }>
  errors: Array<{ rowNumber: number; message: string }>
  canAccept: boolean
}

export interface ResultsPreview {
  provider: ResultsProvider
  sourceUrl: string
  outcomes: Array<{
    fightId: string
    fightLabel: string
    status: Exclude<FightOutcome['status'], 'pending'>
    winnerFighterId: string | null
    method: FightOutcome['method']
    round: FightOutcome['round']
    sourceProvider: ResultsProvider
    sourceUrl: string
    issues: string[]
  }>
  unmatched: string[]
  conflicts: string[]
  betProposals: Array<{
    betId: string
    result: 'won' | 'lost' | 'push' | 'void' | null
    reason: string
    requiresManualReview: boolean
    legProposals: Array<{
      legId: string
      result: 'won' | 'lost' | 'push' | 'void' | null
      reason: string
      requiresManualReview: boolean
    }>
  }>
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
  includeLlmSettings = false,
): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (includeLlmSettings) {
    const settings = getOpenRouterSessionSettings()
    for (const [name, value] of Object.entries(openRouterHeaders(settings))) {
      headers.set(name, value)
    }
  }
  const response = await fetch(url, {
    ...init,
    headers,
  })

  let body: T & { error?: string }
  try {
    body = (await response.json()) as T & { error?: string }
  } catch {
    if (!response.ok) {
      throw new Error(`The request failed with status ${response.status}`)
    }
    throw new Error('The server returned an unreadable response')
  }
  if (!response.ok) {
    throw new Error(
      body.error ?? `The request failed with status ${response.status}`,
    )
  }
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

export async function getApplicationSettings(): Promise<ApplicationSettings> {
  return (await requestJson<{ settings: ApplicationSettings }>('/api/settings'))
    .settings
}

export async function patchApplicationSettings(input: {
  currentBankrollCents?: number
  defaultUnitValueCents?: number
  preferredOpenRouterModel?: string | null
  savedOpenRouterModels?: string[]
  openRouterReasoningEffort?: ReasoningEffort
}): Promise<ApplicationSettings> {
  return (
    await requestJson<{ settings: ApplicationSettings }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  ).settings
}

export async function fetchCardPreview(url: string): Promise<CardFetchPreview> {
  return (
    await requestJson<{ preview: CardFetchPreview }>(
      '/api/cards/fetch-preview',
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      },
      true,
    )
  ).preview
}

export async function discoverCardPreview(): Promise<CardFetchPreview> {
  return (
    await requestJson<{ preview: CardFetchPreview }>(
      '/api/cards/discover-preview',
      { method: 'POST' },
      true,
    )
  ).preview
}

export async function getCardSourceLinks(
  cardId: string,
): Promise<CardSourceLink[]> {
  return (
    await requestJson<{ links: CardSourceLink[] }>(
      `/api/cards/${encodeURIComponent(cardId)}/source-links`,
    )
  ).links
}

export async function putCardSourceLink(
  cardId: string,
  provider: CardSourceLink['provider'],
  url: string,
): Promise<CardSourceLink> {
  return (
    await requestJson<{ link: CardSourceLink }>(
      `/api/cards/${encodeURIComponent(cardId)}/source-links/${provider}`,
      { method: 'PUT', body: JSON.stringify({ url }) },
    )
  ).link
}

export async function getCardWorkflowStatus(
  cardId: string,
): Promise<CardWorkflowStatus> {
  return (
    await requestJson<{ workflow: CardWorkflowStatus }>(
      `/api/cards/${encodeURIComponent(cardId)}/workflow-status`,
    )
  ).workflow
}

export async function previewTipCsv(
  cardId: string,
  csv: string,
): Promise<TipCsvPreview> {
  return (
    await requestJson<{ preview: TipCsvPreview }>(
      `/api/cards/${encodeURIComponent(cardId)}/tip-csv/preview`,
      { method: 'POST', body: JSON.stringify({ csv }) },
    )
  ).preview
}

export async function importTipCsv(
  cardId: string,
  csv: string,
): Promise<{ importedTips: number; extractionRunIds: string[] }> {
  return requestJson(
    `/api/cards/${encodeURIComponent(cardId)}/tip-csv/import`,
    { method: 'POST', body: JSON.stringify({ csv }) },
  )
}

export async function fetchResultsPreview(
  cardId: string,
): Promise<ResultsPreview> {
  return (
    await requestJson<{ preview: ResultsPreview }>(
      `/api/cards/${encodeURIComponent(cardId)}/results/fetch-preview`,
      { method: 'POST' },
    )
  ).preview
}

export async function applyResultsReview(
  cardId: string,
  input: {
    provider: ResultsPreview['provider']
    sourceUrl: string
    outcomes: ResultsPreview['outcomes']
    settlements: Array<{
      betId: string
      result: 'won' | 'lost' | 'push' | 'void'
      settlementOddsInput?: string | null
      legs?: Array<{
        legId: string
        result: 'won' | 'lost' | 'push' | 'void'
      }>
    }>
  },
): Promise<{ outcomesApplied: number; betsSettled: number }> {
  return requestJson(`/api/cards/${encodeURIComponent(cardId)}/results/apply`, {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      outcomes: input.outcomes.map(
        ({
          fightId,
          status,
          winnerFighterId,
          method,
          round,
          sourceProvider,
          sourceUrl,
        }) => ({
          fightId,
          status,
          winnerFighterId,
          method,
          round,
          sourceProvider,
          sourceUrl,
        }),
      ),
    }),
  })
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

export async function deleteCard(cardId: string): Promise<void> {
  await requestJson<{ deleted: true }>(
    `/api/cards/${encodeURIComponent(cardId)}`,
    { method: 'DELETE' },
  )
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
  sourceProvider?: EventProvider | null
  sourceUrl?: string | null
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
      true,
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
      true,
    )
  ).synthesis
}

export interface OpenRouterConnectionSummary {
  keyLabel: string | null
  isFreeTier: boolean | null
  limitRemaining: number | null
  limitReset: string | null
  modelId: string
  modelName: string | null
}

export interface OpenRouterModelSummary {
  id: string
  name: string
  description: string | null
  contextLength: number | null
  promptPrice: string | null
  completionPrice: string | null
  reasoning: {
    supportedEfforts: Exclude<ReasoningEffort, 'default'>[] | null
    defaultEffort: Exclude<ReasoningEffort, 'default'> | null
    defaultEnabled: boolean | null
    supportsMaxTokens: boolean
    mandatory: boolean
  } | null
}

export async function testOpenRouterConnection(
  settings: OpenRouterSessionSettings,
): Promise<OpenRouterConnectionSummary> {
  const headers = new Headers(openRouterHeaders(settings))
  return (
    await requestJson<{ connection: OpenRouterConnectionSummary }>(
      '/api/settings/openrouter/test',
      { method: 'POST', headers },
    )
  ).connection
}

export async function getOpenRouterModels(
  apiKey: string,
): Promise<OpenRouterModelSummary[]> {
  const headers = new Headers({ 'X-OpenRouter-Api-Key': apiKey })
  return (
    await requestJson<{ models: OpenRouterModelSummary[] }>(
      '/api/settings/openrouter/models',
      { method: 'POST', headers },
    )
  ).models
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
    method?: string | null
    round?: string | null
    lineValue?: string | null
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

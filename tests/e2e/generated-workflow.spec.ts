import { expect, test, type Page, type Route } from '@playwright/test'
import type { Bet } from '../../src/client/api'

type JsonRecord = Record<string, unknown>

async function responseJson<T extends JsonRecord>(
  response: Awaited<ReturnType<Page['request']['post']>>,
  key: string,
): Promise<T> {
  expect(response.ok()).toBe(true)
  return ((await response.json()) as Record<string, T>)[key] as T
}

test('reviews generated evidence, places the slate, settles it, and updates analytics', async ({
  page,
}) => {
  const auditId = Date.now()
  const cardName = `E2E UFC Card Generated ${auditId}`
  const card = await responseJson<{ id: string; name: string }>(
    await page.request.post('/api/cards', {
      data: {
        name: cardName,
        eventStartsAtUtc: '2026-07-26T02:00:00.000Z',
        budgetUnits: 30,
        unitValueCents: 1000,
      },
    }),
    'card',
  )
  const fight = await responseJson<{
    id: string
    fighterA: { id: string; name: string }
    fighterB: { id: string; name: string }
  }>(
    await page.request.post('/api/fights', {
      data: {
        cardId: card.id,
        fighterAName: `E2E Fighter Generated Alpha ${auditId}`,
        fighterBName: `E2E Fighter Generated Beta ${auditId}`,
        weightClass: 'Lightweight',
        boutOrder: 1,
        isMainEvent: true,
      },
    }),
    'fight',
  )
  const capper = await responseJson<{ id: string; name: string }>(
    await page.request.post('/api/cappers', {
      data: { name: `E2E Capper Generated ${auditId}` },
    }),
    'capper',
  )
  const sourceTitle = `E2E Functional Source Generated ${auditId}`
  const source = await responseJson<{ id: string }>(
    await page.request.post('/api/sources', {
      data: {
        cardId: card.id,
        primaryCapperId: capper.id,
        medium: 'pasted_text',
        extractionMode: 'individual',
        title: sourceTitle,
        sourceUrl: null,
        rawText: `${fight.fighterA.name} is my final pick by decision.`,
      },
    }),
    'source',
  )
  await page.request.post('/api/market-prices', {
    data: {
      cardId: card.id,
      fightId: fight.id,
      bookmaker: 'E2E Bookmaker',
      marketType: 'moneyline',
      selectionFighterId: fight.fighterA.id,
      selectionText: `${fight.fighterA.name} moneyline`,
      oddsInput: '1.80',
    },
  })

  const runId = `e2e-run-${auditId}`
  const synthesisId = `e2e-synthesis-${auditId}`
  const betId = `e2e-bet-${auditId}`
  const extractionOutput = {
    opinions: [
      {
        fight_id: fight.id,
        picked_fighter_id: fight.fighterA.id,
        method: 'decision',
        round: 'distance',
        confidence: 'solid',
        reasoning: 'The final pick is based on cleaner striking and cardio.',
      },
    ],
    tips: [],
    fights_not_covered: [],
    unmatched: [
      {
        raw_name: 'E2E misheard Alpha',
        context: 'Resolve this transcription spelling before acceptance.',
      },
    ],
    unmatched_attribution: [],
  }
  let runStatus = 'needs_review'
  const extractionRun = () => ({
    id: runId,
    sourceId: source.id,
    sourceTitle,
    status: runStatus,
    provider: 'openrouter',
    model: 'fixture/exact-model-id',
    promptVersion: 'individual-extraction-v1',
    rawResponse: JSON.stringify(extractionOutput),
    reviewedResponse:
      runStatus === 'accepted'
        ? JSON.stringify({ ...extractionOutput, unmatched: [] })
        : null,
    validationErrors: null,
    tokenUsage: { input: 100, output: 40 },
    estimatedCostMicros: 100,
    completedAt: '2026-07-18T00:00:00.000Z',
    createdAt: '2026-07-18T00:00:00.000Z',
  })

  await page.route('**/api/extractions?cardId=*', async (route) => {
    await route.fulfill({ json: { runs: [extractionRun()] } })
  })
  await page.route(`**/api/sources/${source.id}/parse`, async (route) => {
    await route.fulfill({ status: 201, json: { run: extractionRun() } })
  })
  await page.route(`**/api/extractions/${runId}/accept`, async (route) => {
    const reviewed = (route.request().postDataJSON() as { output: JsonRecord })
      .output
    expect(reviewed.unmatched).toEqual([])
    runStatus = 'accepted'
    await route.fulfill({ json: { accepted: true } })
  })

  const synthesis = {
    id: synthesisId,
    cardId: card.id,
    status: 'draft',
    recommendedUnits: 3,
    unspentUnits: 27,
    fightSummaries: [
      {
        fightId: fight.id,
        consensusFighterId: fight.fighterA.id,
        weightedShare: 0.78,
        rawSupportCount: 3,
        eligibleVoterCount: 3,
        consensusMethod: 'decision',
        methodSupportCount: 2,
        methodEligibleCount: 3,
        consensusRound: 'distance',
        roundSupportCount: 2,
        roundEligibleCount: 3,
        badges: ['strong_consensus'],
        overviewText:
          'Three reviewed sources favour the same side, with decision the most common method.',
        evidence: {
          missingCurrentMoneylinePrice: false,
          supporters: [
            {
              capperId: capper.id,
              capperName: capper.name,
              confidence: 'solid',
              reasoning: 'Cleaner striking and cardio.',
              provenance: 'direct',
            },
          ],
          dissenters: [],
          tracker: null,
        },
      },
    ],
    bets: [
      {
        id: betId,
        selectionText: `${fight.fighterA.name} moneyline`,
        tier: 'core',
        units: 3,
        decimalOdds: 1.8,
        rationale:
          'Reviewed consensus and the current price satisfy the core allocation rules.',
        supportingCappers: [capper.name],
      },
    ],
  }
  let synthesisAccepted = false
  await page.route(`**/api/cards/${card.id}/syntheses`, async (route) => {
    await route.fulfill({ status: 201, json: { synthesis } })
  })
  await page.route(`**/api/syntheses/${synthesisId}/accept`, async (route) => {
    synthesisAccepted = true
    await route.fulfill({ json: { accepted: true } })
  })
  await page.route(`**/api/cards/${card.id}/synthesis`, async (route) => {
    await route.fulfill({
      json: {
        synthesis: synthesisAccepted
          ? { ...synthesis, status: 'accepted' }
          : null,
      },
    })
  })

  const generatedBet: Bet = {
    id: betId,
    cardId: card.id,
    synthesisRunId: synthesisId,
    origin: 'synthesised',
    tier: 'core',
    marketType: 'moneyline',
    selectionText: `${fight.fighterA.name} moneyline`,
    recommendedUnits: '3.00',
    recommendedOdds: '1.8000',
    consensusShare: '0.7800',
    state: 'recommended',
    oddsTaken: null,
    settlementOdds: null,
    stakeUnits: null,
    result: 'pending',
    netProfitUnits: null,
    notes: null,
    createdAt: '2026-07-18T00:00:00.000Z',
    legs: [],
  }
  await page.route('**/api/bets?cardId=*', async (route) => {
    await route.fulfill({ json: { bets: [generatedBet] } })
  })
  await page.route('**/api/bets/*', async (route: Route) => {
    const action = route.request().postDataJSON() as {
      action: 'place' | 'settle' | 'unsettle'
      oddsTakenInput?: string
      stakeUnits?: number
      result?: string
      settlementOddsInput?: string | null
    }
    if (action.action === 'place') {
      generatedBet.state = 'placed'
      generatedBet.oddsTaken = action.oddsTakenInput ?? '1.8000'
      generatedBet.stakeUnits = String(action.stakeUnits ?? 3)
    } else if (action.action === 'settle') {
      generatedBet.state = 'settled'
      generatedBet.result = (action.result as Bet['result']) ?? 'won'
      generatedBet.settlementOdds = action.settlementOddsInput ?? '1.8000'
      generatedBet.netProfitUnits = '2.4000'
    }
    await route.fulfill({ json: { bet: generatedBet } })
  })
  await page.route('**/api/analytics/bets', async (route) => {
    await route.fulfill({ json: { bets: [generatedBet] } })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Sources' }).click()
  await page.getByLabel('Working card').selectOption({ label: cardName })
  const sourceRow = page.locator('.source-row').filter({ hasText: sourceTitle })
  await sourceRow.getByRole('button', { name: 'Parse source' }).click()
  await sourceRow.getByRole('button', { name: 'Review extraction' }).click()
  const reviewedJson = page.getByLabel('Reviewed JSON')
  await expect(reviewedJson).toContainText('E2E misheard Alpha')
  await reviewedJson.fill(
    JSON.stringify({ ...extractionOutput, unmatched: [] }, null, 2),
  )
  await page
    .getByLabel('I reviewed every opinion, tip, and fighter mapping.')
    .check()
  await page.getByRole('button', { name: 'Accept reviewed extraction' }).click()
  await expect(sourceRow).toContainText('Latest run: accepted')

  await page.getByRole('button', { name: 'Fight board' }).click()
  await page.getByLabel('Working card').selectOption({ label: cardName })
  await page.getByRole('button', { name: 'Create draft slate' }).click()
  await expect(
    page.getByRole('heading', { name: 'Recommended slate' }),
  ).toBeVisible()
  await expect(page.getByText('3/3 cappers', { exact: false })).toBeVisible()
  await expect(page.getByText('27u unspent', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Accept draft' }).click()
  await expect(
    page.getByRole('button', { name: 'Accepted to ledger' }),
  ).toBeDisabled()

  await page.getByRole('button', { name: 'Bet ledger' }).click()
  await page.getByLabel('Working card').selectOption({ label: cardName })
  const ledgerBet = page
    .locator('.ledger-row')
    .filter({ hasText: generatedBet.selectionText })
  await expect(ledgerBet).toContainText('recommended')
  await ledgerBet.getByLabel('Actual odds').fill('1.80')
  await ledgerBet.getByLabel('Stake units').fill('3')
  await ledgerBet.getByRole('button', { name: 'Place' }).click()
  await expect(ledgerBet).toContainText('placed')
  await ledgerBet.getByLabel('Settlement result').selectOption('won')
  await ledgerBet.getByRole('button', { name: 'Settle' }).click()
  await expect(ledgerBet).toContainText('WON')
  await expect(ledgerBet).toContainText('+2.40u')

  await page.getByRole('button', { name: 'Bankroll' }).click()
  await expect(page.getByText('+2.40u', { exact: true }).first()).toBeVisible()
  await expect(
    page.locator('.bankroll-row').filter({ hasText: cardName }),
  ).toContainText('80.0%')
})

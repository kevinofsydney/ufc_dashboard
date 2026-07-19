import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { Miniflare } from 'miniflare'
import { applyMigrations } from '../helpers/migrations'
import { createCard } from '../../src/server/repositories/cards'
import { createCapper } from '../../src/server/repositories/cappers'
import { createFight } from '../../src/server/repositories/fights'
import { updateFight } from '../../src/server/repositories/fights'
import { createMarketPrice } from '../../src/server/repositories/market-prices'
import { listBets, placeBet } from '../../src/server/repositories/bets'
import {
  acceptSynthesis,
  getCurrentSynthesis,
} from '../../src/server/repositories/syntheses'
import { createSource } from '../../src/server/repositories/sources'
import { acceptExtraction } from '../../src/server/services/accept-extraction'
import { parseSource } from '../../src/server/services/parse-source'
import { synthesiseCard } from '../../src/server/services/synthesise-card'

describe('generated research workflow', () => {
  let runtime: Miniflare
  let db: D1Database

  beforeAll(async () => {
    runtime = new Miniflare({
      compatibilityDate: '2026-07-17',
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'generated-workflow' },
      d1Persist: false,
    })
    db = await runtime.getD1Database('DB')
    await applyMigrations([db])
  })

  afterEach(() => vi.unstubAllGlobals())
  afterAll(async () => runtime.dispose())

  it('persists reviewed extraction evidence and generated synthesis copy', async () => {
    const card = await createCard(db, {
      name: 'Generated workflow fixture',
      budgetUnits: 30,
    })
    const fight = await createFight(db, {
      cardId: card.id,
      fighterAName: 'Fixture Alpha',
      fighterBName: 'Fixture Beta',
      weightClass: 'Lightweight',
      boutOrder: 1,
      isMainEvent: true,
    })
    const cappers = await Promise.all(
      ['Analyst One', 'Analyst Two', 'Analyst Three'].map((name) =>
        createCapper(db, { name }),
      ),
    )
    const sources = await Promise.all(
      cappers.map((capper) =>
        createSource(db, {
          cardId: card.id,
          primaryCapperId: capper.id,
          medium: 'pasted_text',
          extractionMode: 'individual',
          title: `${capper.name} preview`,
          rawText:
            'Fixture Alpha is the pick by decision after a competitive fight.',
        }),
      ),
    )

    const requests: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          model: string
          messages: Array<{ role: string; content: string }>
          response_format: { json_schema: { name: string } }
        }
        requests.push(request as unknown as Record<string, unknown>)
        const task = request.response_format.json_schema.name
        let content: unknown

        if (task === 'individual_extraction') {
          content = {
            opinions: [
              {
                fight_id: fight.id,
                picked_fighter_id: fight.fighterA.id,
                method: 'decision',
                round: 'distance',
                confidence: 'solid',
                reasoning: 'Alpha has the cleaner striking and late cardio.',
              },
            ],
            tips: [],
            fights_not_covered: [],
            unmatched: [],
            unmatched_attribution: [],
          }
        } else if (task === 'fight_overviews') {
          content = {
            overviews: [
              {
                fight_id: fight.id,
                overview:
                  'All three reviewed analysts favour Fixture Alpha, most often by decision.',
              },
            ],
          }
        } else if (task === 'slate_rationales') {
          const userMessage = request.messages.find(
            (message) => message.role === 'user',
          )
          const prompt = JSON.parse(userMessage?.content ?? '{}') as {
            bets?: Array<{ bet_candidate_id: string }>
          }
          content = {
            rationales: (prompt.bets ?? []).map((bet) => ({
              bet_candidate_id: bet.bet_candidate_id,
              rationale:
                'Three reviewed analysts agree on Fixture Alpha, and the current price meets the core allocation rules.',
            })),
          }
        } else {
          return new Response('Unexpected model task', { status: 500 })
        }

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(content) } }],
            usage: { prompt_tokens: 120, completion_tokens: 40, cost: 0.001 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const configuration = {
      provider: 'openrouter' as const,
      model: 'fixture/exact-model-id',
      apiKey: 'fixture-key',
      reasoningEffort: 'high' as const,
    }
    for (const source of sources) {
      const run = await parseSource({ DB: db }, source.id, configuration)
      expect(run.status).toBe('needs_review')
      expect(run.rawResponse).not.toBeNull()
      await acceptExtraction(
        { DB: db },
        run.id,
        'reviewer@example.com',
        JSON.parse(run.rawResponse ?? '{}'),
      )
    }

    await createMarketPrice(db, {
      cardId: card.id,
      fightId: fight.id,
      bookmaker: 'Fixture book',
      marketType: 'moneyline',
      selectionFighterId: fight.fighterA.id,
      selectionText: 'Fixture Alpha moneyline',
      decimalOdds: '1.8000',
    })

    const draft = await synthesiseCard({ DB: db }, card.id, configuration)
    expect(draft.fightSummaries).toEqual([
      expect.objectContaining({
        fightId: fight.id,
        consensusFighterId: fight.fighterA.id,
        rawSupportCount: 3,
        eligibleVoterCount: 3,
        overviewText:
          'All three reviewed analysts favour Fixture Alpha, most often by decision.',
      }),
    ])
    expect(draft.bets).toEqual([
      expect.objectContaining({
        selectionText: 'Fixture Alpha moneyline',
        tier: 'core',
        units: 3,
        supportingCappers: expect.arrayContaining(
          cappers.map((capper) => capper.name),
        ),
        rationale:
          'Three reviewed analysts agree on Fixture Alpha, and the current price meets the core allocation rules.',
      }),
    ])

    await acceptSynthesis(db, draft.id, 'reviewer@example.com')
    const acceptedDraft = await getCurrentSynthesis(db, card.id)
    expect(acceptedDraft).toMatchObject({
      id: draft.id,
      status: 'accepted',
      recommendedUnits: 3,
      bets: [
        {
          selectionText: 'Fixture Alpha moneyline',
          rationale:
            'Three reviewed analysts agree on Fixture Alpha, and the current price meets the core allocation rules.',
        },
      ],
    })

    const placed = await placeBet(db, acceptedDraft!.bets[0]!.id, {
      oddsTaken: '1.8500',
      stakeUnits: '2.5000',
    })
    expect(placed).toMatchObject({
      state: 'placed',
      oddsTaken: '1.8500',
      stakeUnits: '2.5000',
    })

    const repeatedRun = await parseSource(
      { DB: db },
      sources[0]!.id,
      configuration,
    )
    await acceptExtraction(
      { DB: db },
      repeatedRun.id,
      'reviewer@example.com',
      JSON.parse(repeatedRun.rawResponse ?? '{}'),
    )
    const repeatedDraft = await synthesiseCard(
      { DB: db },
      card.id,
      configuration,
    )
    expect(repeatedDraft.fightSummaries[0]).toMatchObject({
      rawSupportCount: 3,
      eligibleVoterCount: 3,
    })
    await acceptSynthesis(db, repeatedDraft.id, 'reviewer@example.com')

    const afterResynthesis = await listBets(db, card.id)
    expect(afterResynthesis.find((bet) => bet.id === placed.id)).toMatchObject({
      state: 'placed',
      oddsTaken: '1.8500',
      stakeUnits: '2.5000',
    })
    expect(
      afterResynthesis.some((bet) => bet.synthesisRunId === repeatedDraft.id),
    ).toBe(true)

    const replacedFight = await updateFight(
      db,
      fight.id,
      {
        fighterAName: fight.fighterA.name,
        fighterBName: 'Fixture Replacement',
        weightClass: fight.weightClass,
        boutOrder: fight.boutOrder,
        isMainEvent: fight.isMainEvent,
        status: 'scheduled',
      },
      'reviewer@example.com',
    )
    expect(replacedFight.fighterA.id).toBe(fight.fighterA.id)
    expect(replacedFight.fighterB.name).toBe('Fixture Replacement')
    const historicalOpinion = await db
      .prepare(
        `SELECT picked_fighter_id FROM fight_opinions
         WHERE extraction_run_id = ?`,
      )
      .bind(repeatedRun.id)
      .first<{ picked_fighter_id: string }>()
    expect(historicalOpinion?.picked_fighter_id).toBe(fight.fighterA.id)

    expect(requests).toHaveLength(8)
    expect(
      requests.every((request) => request.model === configuration.model),
    ).toBe(true)
    expect(
      requests.map(
        (request) =>
          (
            request.response_format as {
              json_schema: { name: string }
            }
          ).json_schema.name,
      ),
    ).toEqual([
      'individual_extraction',
      'individual_extraction',
      'individual_extraction',
      'fight_overviews',
      'slate_rationales',
      'individual_extraction',
      'fight_overviews',
      'slate_rationales',
    ])
  })
})

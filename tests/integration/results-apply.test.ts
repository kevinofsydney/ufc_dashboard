import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { createManualBet, listBets } from '../../src/server/repositories/bets'
import { createCard } from '../../src/server/repositories/cards'
import { createFight } from '../../src/server/repositories/fights'
import { listFightOutcomes } from '../../src/server/repositories/outcomes'
import { applyResultsReview } from '../../src/server/services/apply-results'
import { applyMigrations } from '../helpers/migrations'

describe('reviewed results apply', () => {
  let runtime: Miniflare
  let db: D1Database

  beforeAll(async () => {
    runtime = new Miniflare({
      compatibilityDate: '2026-07-17',
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'results-apply' },
      d1Persist: false,
    })
    db = await runtime.getD1Database('DB')
    await applyMigrations([db])
  })

  afterAll(async () => runtime.dispose())

  it('atomically records provenance, leg grading, settlement, and audit events', async () => {
    const card = await createCard(db, {
      name: 'Results fixture',
      budgetUnits: 30,
    })
    const fight = await createFight(db, {
      cardId: card.id,
      fighterAName: 'Results Alpha',
      fighterBName: 'Results Beta',
      boutOrder: 1,
      isMainEvent: true,
    })
    const placed = await createManualBet(db, {
      cardId: card.id,
      marketType: 'moneyline',
      selectionText: 'Results Alpha ML',
      oddsTaken: '2.0000',
      stakeUnits: '1.00',
      legs: [
        {
          fightId: fight.id,
          marketType: 'moneyline',
          selectionFighterId: fight.fighterA.id,
          selectionText: 'Results Alpha ML',
        },
      ],
    })
    const legId = placed.legs[0]?.id
    expect(legId).toBeTruthy()

    await expect(
      applyResultsReview(db, {
        cardId: card.id,
        provider: 'ufc',
        sourceUrl: 'https://www.ufc.com/event/results-fixture',
        actorEmail: 'reviewer@example.com',
        outcomes: [
          {
            fightId: fight.id,
            status: 'winner',
            winnerFighterId: fight.fighterA.id,
            method: 'decision',
            round: '5',
          },
        ],
        settlements: [
          {
            betId: placed.id,
            result: 'won',
            legs: [{ legId: legId as string, result: 'won' }],
          },
        ],
      }),
    ).resolves.toEqual({ outcomesApplied: 1, betsSettled: 1 })

    expect(await listFightOutcomes(db, card.id)).toEqual([
      expect.objectContaining({
        fightId: fight.id,
        status: 'winner',
        sourceProvider: 'ufc',
        sourceUrl: 'https://www.ufc.com/event/results-fixture',
      }),
    ])
    expect((await listBets(db, card.id))[0]).toMatchObject({
      state: 'settled',
      result: 'won',
      settlementOdds: '2.0000',
      netProfitUnits: '1.0000',
      legs: [expect.objectContaining({ legResult: 'won' })],
    })
    const audit = await db
      .prepare(
        `SELECT action FROM audit_events
         WHERE entity_id IN (?, ?) ORDER BY created_at`,
      )
      .bind(fight.id, placed.id)
      .all<{ action: string }>()
    expect(audit.results.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'imported_and_confirmed',
        'settled_from_reviewed_results',
      ]),
    )
  })

  it('does not apply fight outcomes when settlement review is incomplete', async () => {
    const card = await createCard(db, {
      name: 'Atomic rejection fixture',
      budgetUnits: 30,
    })
    const fight = await createFight(db, {
      cardId: card.id,
      fighterAName: 'Atomic Alpha',
      fighterBName: 'Atomic Beta',
      boutOrder: 1,
      isMainEvent: true,
    })
    const placed = await createManualBet(db, {
      cardId: card.id,
      marketType: 'moneyline',
      selectionText: 'Atomic Alpha ML',
      oddsTaken: '1.8000',
      stakeUnits: '1.00',
      legs: [
        {
          fightId: fight.id,
          marketType: 'moneyline',
          selectionFighterId: fight.fighterA.id,
          selectionText: 'Atomic Alpha ML',
        },
      ],
    })

    await expect(
      applyResultsReview(db, {
        cardId: card.id,
        provider: 'tapology',
        sourceUrl: 'https://www.tapology.com/fightcenter/events/atomic',
        actorEmail: 'reviewer@example.com',
        outcomes: [
          {
            fightId: fight.id,
            status: 'winner',
            winnerFighterId: fight.fighterA.id,
            method: 'decision',
            round: '3',
          },
        ],
        settlements: [{ betId: placed.id, result: 'won' }],
      }),
    ).rejects.toThrow('Every parlay leg must be reviewed')
    expect(await listFightOutcomes(db, card.id)).toEqual([])
    expect((await listBets(db, card.id))[0]?.state).toBe('placed')
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { applyMigrations } from '../helpers/migrations'
import {
  createManualBet,
  listAnalyticsBets,
  listBets,
} from '../../src/server/repositories/bets'

describe('bet listings', () => {
  let runtime: Miniflare
  let db: D1Database

  beforeAll(async () => {
    runtime = new Miniflare({
      compatibilityDate: '2026-07-17',
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'db' },
      d1Persist: false,
    })
    db = await runtime.getD1Database('DB')
    await applyMigrations([db])

    const now = '2026-07-17T00:00:00.000Z'
    await db
      .prepare(
        `INSERT INTO cards (
           id, name, event_starts_at_utc, display_timezone, budget_units,
           unit_value_cents, currency, lifecycle, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        'card-legs-test',
        'Legs listing card',
        now,
        'Australia/Sydney',
        30,
        1000,
        'AUD',
        'in_progress',
        now,
        now,
      )
      .run()
    await db.batch([
      db
        .prepare(
          'INSERT INTO fighters (id, canonical_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind('fighter-alpha', 'Fighter Alpha', now, now),
      db
        .prepare(
          'INSERT INTO fighters (id, canonical_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind('fighter-beta', 'Fighter Beta', now, now),
      db
        .prepare(
          'INSERT INTO fighters (id, canonical_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind('fighter-gamma', 'Fighter Gamma', now, now),
      db
        .prepare(
          'INSERT INTO fighters (id, canonical_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind('fighter-delta', 'Fighter Delta', now, now),
    ])
    await db.batch([
      db
        .prepare(
          `INSERT INTO fights (
             id, card_id, weight_class, bout_order, is_main_event, status,
             external_reference, deleted_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          'fight-legs-one',
          'card-legs-test',
          'Lightweight',
          1,
          1,
          'scheduled',
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO fights (
             id, card_id, weight_class, bout_order, is_main_event, status,
             external_reference, deleted_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          'fight-legs-two',
          'card-legs-test',
          'Welterweight',
          2,
          0,
          'scheduled',
          now,
          now,
        ),
    ])
    await db.batch(
      (
        [
          ['fight-legs-one', 'fighter-alpha', 'a', 'Fighter Alpha'],
          ['fight-legs-one', 'fighter-beta', 'b', 'Fighter Beta'],
          ['fight-legs-two', 'fighter-gamma', 'a', 'Fighter Gamma'],
          ['fight-legs-two', 'fighter-delta', 'b', 'Fighter Delta'],
        ] as const
      ).map(([fightId, fighterId, side, name]) =>
        db
          .prepare(
            `INSERT INTO fight_participants (
               fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(fightId, fighterId, side, name, now, now),
      ),
    )
  })

  afterAll(async () => runtime.dispose())

  it('returns manual parlay legs from both card and analytics listings', async () => {
    const bet = await createManualBet(db, {
      cardId: 'card-legs-test',
      marketType: 'parlay',
      selectionText: 'Alpha ML + Gamma ML',
      oddsTaken: '2.5000',
      stakeUnits: '1.0000',
      legs: [
        {
          fightId: 'fight-legs-one',
          marketType: 'moneyline',
          selectionFighterId: 'fighter-alpha',
          selectionText: 'Fighter Alpha ML',
        },
        {
          fightId: 'fight-legs-two',
          marketType: 'moneyline',
          selectionFighterId: 'fighter-gamma',
          selectionText: 'Fighter Gamma ML',
        },
      ],
    })
    expect(bet.legs).toHaveLength(2)

    const cardBets = await listBets(db, 'card-legs-test')
    expect(cardBets.find((item) => item.id === bet.id)?.legs).toHaveLength(2)

    const analyticsBets = await listAnalyticsBets(db)
    const analyticsBet = analyticsBets.find((item) => item.id === bet.id)
    expect(analyticsBet).toBeDefined()
    expect(analyticsBet?.legs).toHaveLength(2)
    expect(analyticsBet?.legs.map((leg) => leg.selectionText).sort()).toEqual([
      'Fighter Alpha ML',
      'Fighter Gamma ML',
    ])
  })
})

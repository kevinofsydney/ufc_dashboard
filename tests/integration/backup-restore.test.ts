import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import {
  exportApplicationBackup,
  restoreApplicationBackup,
} from '../../src/server/services/backup'
import { synthesiseCard } from '../../src/server/services/synthesise-card'
import { listCards, softDeleteCard } from '../../src/server/repositories/cards'
import { listCapperGrades } from '../../src/server/repositories/outcomes'
import {
  getApplicationSettings,
  updateApplicationSettings,
} from '../../src/server/repositories/settings'

const migrationFiles = [
  '0001_initial.sql',
  '0002_seed_cappers.sql',
  '0003_extraction_and_markets.sql',
  '0004_synthesis_ledger_and_outcomes.sql',
  '0005_active_extraction.sql',
  '0006_reviewed_extraction.sql',
  '0007_synthesis_evidence.sql',
  '0008_soft_delete_prices.sql',
  '0009_application_settings.sql',
  '0010_soft_delete_cards.sql',
  '0011_openrouter_preferences.sql',
]

describe('D1 backup restore rehearsal', () => {
  let runtime: Miniflare
  let source: D1Database
  let target: D1Database

  beforeAll(async () => {
    runtime = new Miniflare({
      compatibilityDate: '2026-07-17',
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { SOURCE: 'source', TARGET: 'target' },
      d1Persist: false,
    })
    source = await runtime.getD1Database('SOURCE')
    target = await runtime.getD1Database('TARGET')
    for (const filename of migrationFiles) {
      const sql = (await readFile(resolve('migrations', filename), 'utf8'))
        .replace(/^PRAGMA foreign_keys = ON;\s*/u, '')
        .split(';')
        .map((statement) => statement.replace(/\s+/gu, ' ').trim())
        .filter(Boolean)
        .map((statement) => `${statement};`)
        .join('\n')
      await source.exec(sql)
      await target.exec(sql)
    }
  })

  afterAll(async () => runtime.dispose())

  it('restores a complete export into a fresh migrated database', async () => {
    const now = '2026-07-17T00:00:00.000Z'
    await source
      .prepare(
        `INSERT INTO cards (
           id, name, event_starts_at_utc, display_timezone, budget_units,
           unit_value_cents, currency, lifecycle, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        'card-restore-test',
        'Restore rehearsal',
        now,
        'Australia/Sydney',
        30,
        1000,
        'AUD',
        'completed',
        now,
        now,
      )
      .run()
    await source.batch([
      source
        .prepare(
          'INSERT INTO fighters (id, canonical_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind('fighter-alpha', 'Fighter Alpha', now, now),
      source
        .prepare(
          'INSERT INTO fighters (id, canonical_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind('fighter-beta', 'Fighter Beta', now, now),
      source
        .prepare(
          `INSERT INTO fights (
             id, card_id, weight_class, bout_order, is_main_event, status,
             external_reference, deleted_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          'fight-restore-test',
          'card-restore-test',
          'Lightweight',
          1,
          1,
          'scheduled',
          now,
          now,
        ),
    ])
    await source.batch([
      source
        .prepare(
          `INSERT INTO fight_participants (
             fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
           ) VALUES (?, ?, 'a', ?, ?, ?)`,
        )
        .bind('fight-restore-test', 'fighter-alpha', 'Fighter Alpha', now, now),
      source
        .prepare(
          `INSERT INTO fight_participants (
             fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
           ) VALUES (?, ?, 'b', ?, ?, ?)`,
        )
        .bind('fight-restore-test', 'fighter-beta', 'Fighter Beta', now, now),
      source
        .prepare(
          `INSERT INTO sources (
             id, card_id, primary_capper_id, medium, extraction_mode,
             source_url, title, raw_text, added_at, created_at, updated_at
           ) VALUES (?, ?, ?, 'pasted_text', 'individual', NULL, ?, ?, ?, ?, ?)`,
        )
        .bind(
          'source-restore-test',
          'card-restore-test',
          'capper-mma-guru',
          'Reviewed picks',
          'fixture',
          now,
          now,
          now,
        ),
    ])
    await source
      .prepare(
        `INSERT INTO extraction_runs (
           id, source_id, status, provider, model, prompt_version, source_hash,
           raw_response, reviewed_response, validation_errors, token_usage_json,
           estimated_cost_micros, completed_at, created_at, updated_at
         ) VALUES (?, ?, 'accepted', 'openrouter', 'fixture', 'v1', 'hash',
                   '{}', '{}', NULL, NULL, NULL, ?, ?, ?)`,
      )
      .bind('run-restore-test', 'source-restore-test', now, now, now)
      .run()
    await source
      .prepare('UPDATE sources SET active_extraction_run_id = ? WHERE id = ?')
      .bind('run-restore-test', 'source-restore-test')
      .run()
    for (const [index, capperId] of [
      'capper-mma-guru',
      'capper-mma-lock',
      'capper-tony',
    ].entries()) {
      await source
        .prepare(
          `INSERT INTO fight_opinions (
             id, extraction_run_id, source_id, card_id, fight_id, capper_id,
             picked_fighter_id, method, round, confidence, reasoning_summary,
             provenance, review_status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'decision', 'distance', 'solid', ?,
                     'direct', 'accepted', ?, ?)`,
        )
        .bind(
          `opinion-${index}`,
          'run-restore-test',
          'source-restore-test',
          'card-restore-test',
          'fight-restore-test',
          capperId,
          'fighter-alpha',
          `Reviewed reason ${index}`,
          now,
          now,
        )
        .run()
    }
    await source.batch([
      source
        .prepare(
          `INSERT INTO capper_tips (
             id, opinion_id, extraction_run_id, source_id, card_id, fight_id,
             capper_id, market_type, selection_fighter_id, method, round,
             line_value, selection_text, odds_mentioned_raw,
             odds_mentioned_decimal, stated_stake_units, confidence,
             reasoning_summary, provenance, review_status, created_at, updated_at
           ) VALUES (?, NULL, ?, ?, ?, ?, ?, 'moneyline', ?, NULL, NULL, NULL,
                     'Fighter Alpha moneyline', '+100', '2.0000', '1.00',
                     'solid', 'Explicit priced tip', 'direct', 'accepted', ?, ?)`,
        )
        .bind(
          'tip-restore-test',
          'run-restore-test',
          'source-restore-test',
          'card-restore-test',
          'fight-restore-test',
          'capper-mma-guru',
          'fighter-alpha',
          now,
          now,
        ),
      source
        .prepare(
          `INSERT INTO fight_outcomes (
             fight_id, status, winner_fighter_id, method, round, recorded_at,
             created_at, updated_at
           ) VALUES (?, 'winner', ?, 'decision', '3', ?, ?, ?)`,
        )
        .bind('fight-restore-test', 'fighter-alpha', now, now, now),
    ])
    await source
      .prepare(
        `INSERT INTO market_prices (
           id, card_id, fight_id, bookmaker, market_type, selection_fighter_id,
           method, round, line_value, selection_text, decimal_odds, captured_at,
           source, created_at, updated_at
         ) VALUES (?, ?, ?, 'Fixture book', 'moneyline', ?, NULL, NULL, NULL,
                   'Fighter Alpha', '1.8000', ?, 'manual', ?, ?)`,
      )
      .bind(
        'price-restore-test',
        'card-restore-test',
        'fight-restore-test',
        'fighter-alpha',
        now,
        now,
        now,
      )
      .run()

    const synthesis = await synthesiseCard({ DB: source }, 'card-restore-test')
    expect(synthesis.fightSummaries[0]).toMatchObject({
      consensusFighterId: 'fighter-alpha',
      rawSupportCount: 3,
      eligibleVoterCount: 3,
    })
    expect(synthesis.bets[0]).toMatchObject({ tier: 'core', units: 3 })
    expect(await listCapperGrades(source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capperId: 'capper-mma-guru',
          pricedTipsGraded: 1,
          tipRoiAtStatedOdds: 1,
        }),
      ]),
    )

    await updateApplicationSettings(
      source,
      {
        currentBankrollCents: 25_000,
        defaultUnitValueCents: 1_500,
        preferredOpenRouterModel: 'author/reasoner',
        savedOpenRouterModels: ['author/reasoner', 'author/free:free'],
        openRouterReasoningEffort: 'high',
      },
      'restore-test@example.com',
    )

    const backup = await exportApplicationBackup(source)
    const result = await restoreApplicationBackup(target, backup)
    const restored = await target
      .prepare('SELECT name, lifecycle FROM cards WHERE id = ?')
      .bind('card-restore-test')
      .first<{ name: string; lifecycle: string }>()

    expect(result.restoredRows).toBeGreaterThan(4)
    expect(restored).toEqual({
      name: 'Restore rehearsal',
      lifecycle: 'completed',
    })
    expect(await getApplicationSettings(target)).toMatchObject({
      currentBankrollCents: 25_000,
      defaultUnitValueCents: 1_500,
      preferredOpenRouterModel: 'author/reasoner',
      savedOpenRouterModels: ['author/reasoner', 'author/free:free'],
      openRouterReasoningEffort: 'high',
    })
    expect(
      await target
        .prepare('SELECT COUNT(*) AS count FROM synthesis_runs')
        .first<{ count: number }>(),
    ).toEqual({ count: 1 })

    await softDeleteCard(target, 'card-restore-test', 'owner@example.com')
    expect(await listCards(target)).toEqual([])
    expect(
      await target
        .prepare(
          `SELECT cards.deleted_at IS NOT NULL AS deleted, audit_events.action
           FROM cards
           INNER JOIN audit_events ON audit_events.entity_id = cards.id
           WHERE cards.id = ? AND audit_events.action = 'deleted'`,
        )
        .bind('card-restore-test')
        .first(),
    ).toMatchObject({ deleted: 1, action: 'deleted' })
  })

  it('refuses to overwrite an already restored database', async () => {
    const backup = await exportApplicationBackup(source)
    await expect(restoreApplicationBackup(target, backup)).rejects.toThrow(
      /empty database/,
    )
  })
})

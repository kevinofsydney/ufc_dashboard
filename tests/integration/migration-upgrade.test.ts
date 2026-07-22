import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { applyMigrations, listMigrationFiles } from '../helpers/migrations'

describe('previous-schema migration upgrade', () => {
  let runtime: Miniflare
  let db: D1Database

  beforeAll(async () => {
    runtime = new Miniflare({
      compatibilityDate: '2026-07-17',
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'migration-upgrade' },
      d1Persist: false,
    })
    db = await runtime.getD1Database('DB')
  })

  afterAll(async () => runtime.dispose())

  it('upgrades the pre-settings schema without losing existing card data', async () => {
    const files = await listMigrationFiles()
    const previousSchema = files.filter((name) => name < '0009_')
    const remaining = files.filter((name) => name >= '0009_')
    await applyMigrations([db], previousSchema)
    await db
      .prepare(
        `INSERT INTO cards (
           id, name, event_starts_at_utc, display_timezone, budget_units,
           unit_value_cents, currency, lifecycle, created_at, updated_at
         ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        'pre-settings-card',
        'Card created on the previous schema',
        'Australia/Sydney',
        30,
        1000,
        'AUD',
        'draft',
        '2026-07-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      )
      .run()

    await applyMigrations([db], remaining)

    await expect(
      db
        .prepare('SELECT name, deleted_at FROM cards WHERE id = ?')
        .bind('pre-settings-card')
        .first(),
    ).resolves.toMatchObject({
      name: 'Card created on the previous schema',
      deleted_at: null,
    })
    await expect(
      db
        .prepare(
          `SELECT current_bankroll_cents, default_unit_value_cents,
                  preferred_openrouter_model, openrouter_reasoning_effort
           FROM app_settings WHERE id = 1`,
        )
        .first(),
    ).resolves.toMatchObject({
      current_bankroll_cents: 0,
      default_unit_value_cents: 1000,
      preferred_openrouter_model: null,
      openrouter_reasoning_effort: 'default',
    })
  })
})

describe('card_source_links provider rebuild', () => {
  let runtime: Miniflare
  let db: D1Database

  beforeAll(async () => {
    runtime = new Miniflare({
      compatibilityDate: '2026-07-17',
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'source-link-rebuild' },
      d1Persist: false,
    })
    db = await runtime.getD1Database('DB')
  })

  afterAll(async () => runtime.dispose())

  it('keeps existing links and accepts betmma after the rebuild', async () => {
    const files = await listMigrationFiles()
    await applyMigrations(
      [db],
      files.filter((name) => name < '0013_'),
    )
    await db
      .prepare(
        `INSERT INTO cards (
           id, name, event_starts_at_utc, display_timezone, budget_units,
           unit_value_cents, currency, lifecycle, created_at, updated_at
         ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        'rebuild-card',
        'Card created before the betmma provider',
        'Australia/Sydney',
        30,
        1000,
        'AUD',
        'draft',
        '2026-07-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      )
      .run()
    await db
      .prepare(
        `INSERT INTO card_source_links (
           id, card_id, provider, url, last_checked_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(
        'rebuild-link',
        'rebuild-card',
        'ufc',
        'https://www.ufc.com/event/pre-rebuild',
        '2026-07-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      )
      .run()

    await applyMigrations(
      [db],
      files.filter((name) => name >= '0013_'),
    )

    await expect(
      db
        .prepare(
          'SELECT card_id, provider, url FROM card_source_links WHERE id = ?',
        )
        .bind('rebuild-link')
        .first(),
    ).resolves.toMatchObject({
      card_id: 'rebuild-card',
      provider: 'ufc',
      url: 'https://www.ufc.com/event/pre-rebuild',
    })

    await db
      .prepare(
        `INSERT INTO card_source_links (
           id, card_id, provider, url, last_checked_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(
        'betmma-link',
        'rebuild-card',
        'betmma',
        'https://www.betmma.tips/next_ufc_event.php',
        '2026-07-22T00:00:00.000Z',
        '2026-07-22T00:00:00.000Z',
      )
      .run()

    // The rebuilt table must still reject unknown providers and duplicate
    // provider rows for one card.
    await expect(
      db
        .prepare(
          `INSERT INTO card_source_links (
             id, card_id, provider, url, last_checked_at, created_at, updated_at
           ) VALUES ('bad-provider', 'rebuild-card', 'sherdog', 'https://www.sherdog.com/x', NULL, ?, ?)`,
        )
        .bind('2026-07-22T00:00:00.000Z', '2026-07-22T00:00:00.000Z')
        .run(),
    ).rejects.toThrow()
    await expect(
      db
        .prepare(
          `INSERT INTO card_source_links (
             id, card_id, provider, url, last_checked_at, created_at, updated_at
           ) VALUES ('duplicate-link', 'rebuild-card', 'betmma', 'https://www.betmma.tips/next_ufc_event.php', NULL, ?, ?)`,
        )
        .bind('2026-07-22T00:00:00.000Z', '2026-07-22T00:00:00.000Z')
        .run(),
    ).rejects.toThrow()
  })
})

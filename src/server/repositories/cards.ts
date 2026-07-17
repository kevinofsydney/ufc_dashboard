import type { Bindings } from '../env'

export interface CardRecord {
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

interface CardRow {
  id: string
  name: string
  event_starts_at_utc: string | null
  display_timezone: string
  budget_units: number
  unit_value_cents: number
  currency: string
  lifecycle: CardRecord['lifecycle']
  created_at: string
  updated_at: string
}

function mapCard(row: CardRow): CardRecord {
  return {
    id: row.id,
    name: row.name,
    eventStartsAtUtc: row.event_starts_at_utc,
    displayTimezone: row.display_timezone,
    budgetUnits: row.budget_units,
    unitValueCents: row.unit_value_cents,
    currency: row.currency,
    lifecycle: row.lifecycle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCards(db: Bindings['DB']): Promise<CardRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, name, event_starts_at_utc, display_timezone, budget_units,
              unit_value_cents, currency, lifecycle, created_at, updated_at
       FROM cards
       ORDER BY COALESCE(event_starts_at_utc, created_at) DESC`,
    )
    .all<CardRow>()

  return result.results.map(mapCard)
}

export async function createCard(
  db: Bindings['DB'],
  input: {
    name: string
    eventStartsAtUtc?: string | null
    budgetUnits?: number
    unitValueCents?: number
  },
): Promise<CardRecord> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO cards (
         id, name, event_starts_at_utc, budget_units, unit_value_cents,
         display_timezone, currency, lifecycle, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'Australia/Sydney', 'AUD', 'draft', ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.eventStartsAtUtc ?? null,
      input.budgetUnits ?? 30,
      input.unitValueCents ?? 1000,
      now,
      now,
    )
    .run()

  return {
    id,
    name: input.name,
    eventStartsAtUtc: input.eventStartsAtUtc ?? null,
    displayTimezone: 'Australia/Sydney',
    budgetUnits: input.budgetUnits ?? 30,
    unitValueCents: input.unitValueCents ?? 1000,
    currency: 'AUD',
    lifecycle: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

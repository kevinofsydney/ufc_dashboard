import type { Bindings } from '../env'

export interface CapperRecord {
  id: string
  name: string
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

interface CapperRow {
  id: string
  name: string
  notes: string | null
  active: number
  created_at: string
  updated_at: string
}

function mapCapper(row: CapperRow): CapperRecord {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCappers(db: Bindings['DB']): Promise<CapperRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, name, notes, active, created_at, updated_at
       FROM cappers
       ORDER BY name COLLATE NOCASE`,
    )
    .all<CapperRow>()

  return result.results.map(mapCapper)
}

export async function createCapper(
  db: Bindings['DB'],
  input: { name: string; notes?: string | null },
): Promise<CapperRecord> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO cappers (id, name, notes, active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, input.name, input.notes ?? null, now, now)
    .run()

  return {
    id,
    name: input.name,
    notes: input.notes ?? null,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateCapper(
  db: Bindings['DB'],
  capperId: string,
  input: { name: string; notes: string | null; active: boolean },
): Promise<CapperRecord> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `UPDATE cappers SET name = ?, notes = ?, active = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.name, input.notes, input.active ? 1 : 0, now, capperId)
    .run()
  const row = await db
    .prepare(
      `SELECT id, name, notes, active, created_at, updated_at
       FROM cappers WHERE id = ?`,
    )
    .bind(capperId)
    .first<CapperRow>()
  if (!row) throw new Error('Capper not found')
  return mapCapper(row)
}

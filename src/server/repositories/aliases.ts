import type { Bindings } from '../env'
import { normalizeAlias } from '../text'

export interface AliasRecord {
  id: string
  entityId: string
  entityName: string
  aliasDisplay: string
  aliasNormalized: string
}

export async function listFighterAliases(
  db: Bindings['DB'],
): Promise<AliasRecord[]> {
  const result = await db
    .prepare(
      `SELECT fighter_aliases.id, fighter_aliases.fighter_id AS entity_id,
              fighters.canonical_name AS entity_name,
              fighter_aliases.alias_display, fighter_aliases.alias_normalized
       FROM fighter_aliases
       INNER JOIN fighters ON fighters.id = fighter_aliases.fighter_id
       ORDER BY fighters.canonical_name, fighter_aliases.alias_display`,
    )
    .all<{
      id: string
      entity_id: string
      entity_name: string
      alias_display: string
      alias_normalized: string
    }>()
  return result.results.map((row) => ({
    id: row.id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    aliasDisplay: row.alias_display,
    aliasNormalized: row.alias_normalized,
  }))
}

export async function createFighterAlias(
  db: Bindings['DB'],
  fighterId: string,
  aliasDisplay: string,
): Promise<AliasRecord> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const aliasNormalized = normalizeAlias(aliasDisplay)
  if (!aliasNormalized) throw new Error('Alias is empty after normalisation')
  await db
    .prepare(
      `INSERT INTO fighter_aliases (
         id, fighter_id, alias_normalized, alias_display, source, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'reviewed', ?, ?)`,
    )
    .bind(id, fighterId, aliasNormalized, aliasDisplay, now, now)
    .run()
  const fighter = await db
    .prepare('SELECT canonical_name FROM fighters WHERE id = ?')
    .bind(fighterId)
    .first<{ canonical_name: string }>()
  if (!fighter) throw new Error('Fighter not found')
  return {
    id,
    entityId: fighterId,
    entityName: fighter.canonical_name,
    aliasDisplay,
    aliasNormalized,
  }
}

export async function listCapperAliases(
  db: Bindings['DB'],
): Promise<AliasRecord[]> {
  const result = await db
    .prepare(
      `SELECT capper_aliases.id, capper_aliases.capper_id AS entity_id,
              cappers.name AS entity_name, capper_aliases.alias_display,
              capper_aliases.alias_normalized
       FROM capper_aliases
       INNER JOIN cappers ON cappers.id = capper_aliases.capper_id
       ORDER BY cappers.name, capper_aliases.alias_display`,
    )
    .all<{
      id: string
      entity_id: string
      entity_name: string
      alias_display: string
      alias_normalized: string
    }>()
  return result.results.map((row) => ({
    id: row.id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    aliasDisplay: row.alias_display,
    aliasNormalized: row.alias_normalized,
  }))
}

export async function createCapperAlias(
  db: Bindings['DB'],
  capperId: string,
  aliasDisplay: string,
): Promise<AliasRecord> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const aliasNormalized = normalizeAlias(aliasDisplay)
  if (!aliasNormalized) throw new Error('Alias is empty after normalisation')
  await db
    .prepare(
      `INSERT INTO capper_aliases (
         id, capper_id, alias_normalized, alias_display, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, capperId, aliasNormalized, aliasDisplay, now, now)
    .run()
  const capper = await db
    .prepare('SELECT name FROM cappers WHERE id = ?')
    .bind(capperId)
    .first<{ name: string }>()
  if (!capper) throw new Error('Capper not found')
  return {
    id,
    entityId: capperId,
    entityName: capper.name,
    aliasDisplay,
    aliasNormalized,
  }
}

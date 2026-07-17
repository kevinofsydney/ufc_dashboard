import type { Bindings } from '../env'

export interface FightRecord {
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

interface FightRow {
  id: string
  card_id: string
  fighter_a_id: string
  fighter_a_name: string
  fighter_b_id: string
  fighter_b_name: string
  weight_class: string | null
  bout_order: number | null
  is_main_event: number
  status: FightRecord['status']
  created_at: string
  updated_at: string
}

function mapFight(row: FightRow): FightRecord {
  return {
    id: row.id,
    cardId: row.card_id,
    fighterA: { id: row.fighter_a_id, name: row.fighter_a_name },
    fighterB: { id: row.fighter_b_id, name: row.fighter_b_name },
    weightClass: row.weight_class,
    boutOrder: row.bout_order,
    isMainEvent: row.is_main_event === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function findOrCreateFighter(
  db: Bindings['DB'],
  name: string,
): Promise<string> {
  const existing = await db
    .prepare(
      'SELECT id FROM fighters WHERE canonical_name = ? COLLATE NOCASE LIMIT 1',
    )
    .bind(name)
    .first<{ id: string }>()

  if (existing) return existing.id

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO fighters (id, canonical_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, name, now, now)
    .run()
  return id
}

export async function listFights(
  db: Bindings['DB'],
  cardId: string,
): Promise<FightRecord[]> {
  const result = await db
    .prepare(
      `SELECT fights.id, fights.card_id, fights.weight_class, fights.bout_order,
              fights.is_main_event, fights.status, fights.created_at, fights.updated_at,
              participant_a.fighter_id AS fighter_a_id,
              participant_a.display_name_snapshot AS fighter_a_name,
              participant_b.fighter_id AS fighter_b_id,
              participant_b.display_name_snapshot AS fighter_b_name
       FROM fights
       INNER JOIN fight_participants AS participant_a
         ON participant_a.fight_id = fights.id AND participant_a.side = 'a'
       INNER JOIN fight_participants AS participant_b
         ON participant_b.fight_id = fights.id AND participant_b.side = 'b'
       WHERE fights.card_id = ? AND fights.deleted_at IS NULL
       ORDER BY fights.bout_order ASC, fights.created_at ASC`,
    )
    .bind(cardId)
    .all<FightRow>()

  return result.results.map(mapFight)
}

export async function createFight(
  db: Bindings['DB'],
  input: {
    cardId: string
    fighterAName: string
    fighterBName: string
    weightClass?: string | null
    boutOrder?: number | null
    isMainEvent?: boolean
  },
): Promise<FightRecord> {
  const fighterAId = await findOrCreateFighter(db, input.fighterAName)
  const fighterBId = await findOrCreateFighter(db, input.fighterBName)
  if (fighterAId === fighterBId)
    throw new Error('A fight requires two different fighters')

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.batch([
    db
      .prepare(
        `INSERT INTO fights (
           id, card_id, weight_class, bout_order, is_main_event, status,
           external_reference, deleted_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'scheduled', NULL, NULL, ?, ?)`,
      )
      .bind(
        id,
        input.cardId,
        input.weightClass ?? null,
        input.boutOrder ?? null,
        input.isMainEvent ? 1 : 0,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO fight_participants (
           fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
         ) VALUES (?, ?, 'a', ?, ?, ?)`,
      )
      .bind(id, fighterAId, input.fighterAName, now, now),
    db
      .prepare(
        `INSERT INTO fight_participants (
           fight_id, fighter_id, side, display_name_snapshot, created_at, updated_at
         ) VALUES (?, ?, 'b', ?, ?, ?)`,
      )
      .bind(id, fighterBId, input.fighterBName, now, now),
  ])

  return {
    id,
    cardId: input.cardId,
    fighterA: { id: fighterAId, name: input.fighterAName },
    fighterB: { id: fighterBId, name: input.fighterBName },
    weightClass: input.weightClass ?? null,
    boutOrder: input.boutOrder ?? null,
    isMainEvent: input.isMainEvent ?? false,
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateFight(
  db: Bindings['DB'],
  fightId: string,
  input: {
    fighterAName: string
    fighterBName: string
    weightClass: string | null
    boutOrder: number | null
    isMainEvent: boolean
    status: FightRecord['status']
  },
  actorEmail: string,
): Promise<FightRecord> {
  const existing = await db
    .prepare(
      `SELECT participant_a.fighter_id AS fighter_a_id,
              participant_b.fighter_id AS fighter_b_id
       FROM fights
       INNER JOIN fight_participants participant_a
         ON participant_a.fight_id = fights.id AND participant_a.side = 'a'
       INNER JOIN fight_participants participant_b
         ON participant_b.fight_id = fights.id AND participant_b.side = 'b'
       WHERE fights.id = ? AND fights.deleted_at IS NULL`,
    )
    .bind(fightId)
    .first<{ fighter_a_id: string; fighter_b_id: string }>()
  if (!existing) throw new Error('Fight not found')
  const fighterAId = await findOrCreateFighter(db, input.fighterAName)
  const fighterBId = await findOrCreateFighter(db, input.fighterBName)
  if (fighterAId === fighterBId)
    throw new Error('A fight requires two different fighters')
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE fights SET weight_class = ?, bout_order = ?, is_main_event = ?,
                           status = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        input.weightClass,
        input.boutOrder,
        input.isMainEvent ? 1 : 0,
        input.status,
        now,
        fightId,
      ),
    db
      .prepare(
        `UPDATE fight_participants
         SET fighter_id = ?, display_name_snapshot = ?, updated_at = ?
         WHERE fight_id = ? AND side = 'a'`,
      )
      .bind(fighterAId, input.fighterAName, now, fightId),
    db
      .prepare(
        `UPDATE fight_participants
         SET fighter_id = ?, display_name_snapshot = ?, updated_at = ?
         WHERE fight_id = ? AND side = 'b'`,
      )
      .bind(fighterBId, input.fighterBName, now, fightId),
    db
      .prepare(
        `INSERT INTO audit_events (
           id, entity_type, entity_id, action, actor_email, details_json, created_at
         ) VALUES (?, 'fight', ?, 'updated', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        fightId,
        actorEmail,
        JSON.stringify({
          ...input,
          previousFighterAId: existing.fighter_a_id,
          previousFighterBId: existing.fighter_b_id,
          fighterAId,
          fighterBId,
        }),
        now,
      ),
  ])
  const card = await db
    .prepare('SELECT card_id FROM fights WHERE id = ?')
    .bind(fightId)
    .first<{ card_id: string }>()
  const updated = card
    ? (await listFights(db, card.card_id)).find((fight) => fight.id === fightId)
    : null
  if (!updated) throw new Error('Fight could not be reloaded')
  return updated
}

export async function softDeleteFight(
  db: Bindings['DB'],
  fightId: string,
  actorEmail: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE fights SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(now, now, fightId),
    db
      .prepare(
        `INSERT INTO audit_events (
           id, entity_type, entity_id, action, actor_email, details_json, created_at
         ) VALUES (?, 'fight', ?, 'soft_deleted', ?, NULL, ?)`,
      )
      .bind(crypto.randomUUID(), fightId, actorEmail, now),
  ])
}

import type { EventProvider } from '../../shared/providers'
import type { Bindings } from '../env'
import { auditEvent } from './audit'

export interface CardSourceLinkRecord {
  id: string
  cardId: string
  provider: EventProvider
  url: string
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

interface CardSourceLinkRow {
  id: string
  card_id: string
  provider: EventProvider
  url: string
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

function mapLink(row: CardSourceLinkRow): CardSourceLinkRecord {
  return {
    id: row.id,
    cardId: row.card_id,
    provider: row.provider,
    url: row.url,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCardSourceLinks(
  db: Bindings['DB'],
  cardId: string,
): Promise<CardSourceLinkRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, card_id, provider, url, last_checked_at, created_at, updated_at
       FROM card_source_links WHERE card_id = ? ORDER BY provider`,
    )
    .bind(cardId)
    .all<CardSourceLinkRow>()
  return result.results.map(mapLink)
}

export async function putCardSourceLink(
  db: Bindings['DB'],
  cardId: string,
  provider: EventProvider,
  url: string,
  actorEmail: string,
): Promise<CardSourceLinkRecord> {
  const now = new Date().toISOString()
  const existing = await db
    .prepare(
      `SELECT id FROM card_source_links WHERE card_id = ? AND provider = ?`,
    )
    .bind(cardId, provider)
    .first<{ id: string }>()
  const id = existing?.id ?? crypto.randomUUID()
  await db.batch([
    db
      .prepare(
        `INSERT INTO card_source_links (
           id, card_id, provider, url, last_checked_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT(card_id, provider) DO UPDATE SET
           url = excluded.url, updated_at = excluded.updated_at`,
      )
      .bind(id, cardId, provider, url, now, now),
    auditEvent(db, {
      entityType: 'card',
      entityId: cardId,
      action: 'source_link_saved',
      actorEmail,
      details: { provider, url },
      now,
    }),
  ])
  const saved = await db
    .prepare(
      `SELECT id, card_id, provider, url, last_checked_at, created_at, updated_at
       FROM card_source_links WHERE card_id = ? AND provider = ?`,
    )
    .bind(cardId, provider)
    .first<CardSourceLinkRow>()
  if (!saved) throw new Error('Event source link could not be reloaded')
  return mapLink(saved)
}

export async function markCardSourceChecked(
  db: Bindings['DB'],
  cardId: string,
  provider: EventProvider,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `UPDATE card_source_links SET last_checked_at = ?, updated_at = ?
       WHERE card_id = ? AND provider = ?`,
    )
    .bind(now, now, cardId, provider)
    .run()
}

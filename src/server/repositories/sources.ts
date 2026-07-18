import type { Bindings } from '../env'
import { auditEvent } from './audit'

export type SourceMedium =
  'youtube' | 'patreon' | 'pasted_text' | 'webpage' | 'other'
export type ExtractionMode = 'individual' | 'aggregator' | 'stats_tracker'

export interface SourceRecord {
  id: string
  cardId: string
  primaryCapperId: string | null
  primaryCapperName: string | null
  medium: SourceMedium
  extractionMode: ExtractionMode
  sourceUrl: string | null
  title: string | null
  rawText: string
  addedAt: string
  createdAt: string
  updatedAt: string
}

interface SourceRow {
  id: string
  card_id: string
  primary_capper_id: string | null
  primary_capper_name: string | null
  medium: SourceMedium
  extraction_mode: ExtractionMode
  source_url: string | null
  title: string | null
  raw_text: string
  added_at: string
  created_at: string
  updated_at: string
}

function mapSource(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    cardId: row.card_id,
    primaryCapperId: row.primary_capper_id,
    primaryCapperName: row.primary_capper_name,
    medium: row.medium,
    extractionMode: row.extraction_mode,
    sourceUrl: row.source_url,
    title: row.title,
    rawText: row.raw_text,
    addedAt: row.added_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const selectSources = `
  SELECT sources.id, sources.card_id, sources.primary_capper_id,
         cappers.name AS primary_capper_name, sources.medium,
         sources.extraction_mode, sources.source_url, sources.title,
         sources.raw_text, sources.added_at, sources.created_at,
         sources.updated_at
  FROM sources
  LEFT JOIN cappers ON cappers.id = sources.primary_capper_id
`

export async function listSources(
  db: Bindings['DB'],
  cardId: string,
): Promise<SourceRecord[]> {
  const result = await db
    .prepare(
      `${selectSources}
       WHERE sources.card_id = ?
       ORDER BY sources.added_at DESC`,
    )
    .bind(cardId)
    .all<SourceRow>()

  return result.results.map(mapSource)
}

export async function getSource(
  db: Bindings['DB'],
  sourceId: string,
): Promise<SourceRecord | null> {
  const row = await db
    .prepare(`${selectSources} WHERE sources.id = ?`)
    .bind(sourceId)
    .first<SourceRow>()
  return row ? mapSource(row) : null
}

export async function createSource(
  db: Bindings['DB'],
  input: {
    cardId: string
    primaryCapperId?: string | null
    medium: SourceMedium
    extractionMode: ExtractionMode
    sourceUrl?: string | null
    title?: string | null
    rawText: string
  },
): Promise<SourceRecord> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO sources (
         id, card_id, primary_capper_id, medium, extraction_mode,
         source_url, title, raw_text, added_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.cardId,
      input.primaryCapperId ?? null,
      input.medium,
      input.extractionMode,
      input.sourceUrl ?? null,
      input.title ?? null,
      input.rawText,
      now,
      now,
      now,
    )
    .run()

  return {
    id,
    cardId: input.cardId,
    primaryCapperId: input.primaryCapperId ?? null,
    primaryCapperName: null,
    medium: input.medium,
    extractionMode: input.extractionMode,
    sourceUrl: input.sourceUrl ?? null,
    title: input.title ?? null,
    rawText: input.rawText,
    addedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateSource(
  db: Bindings['DB'],
  sourceId: string,
  input: {
    primaryCapperId: string | null
    medium: SourceMedium
    extractionMode: ExtractionMode
    sourceUrl: string | null
    title: string | null
    rawText: string
  },
  actorEmail: string,
): Promise<SourceRecord> {
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE sources
         SET primary_capper_id = ?, medium = ?, extraction_mode = ?,
             source_url = ?, title = ?, raw_text = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.primaryCapperId,
        input.medium,
        input.extractionMode,
        input.sourceUrl,
        input.title,
        input.rawText,
        now,
        sourceId,
      ),
    auditEvent(db, {
      entityType: 'source',
      entityId: sourceId,
      action: 'updated',
      actorEmail,
      details: {
        ...input,
        rawText: `[${input.rawText.length} characters]`,
      },
      now,
    }),
  ])
  const updated = await getSource(db, sourceId)
  if (!updated) throw new Error('Source not found')
  return updated
}

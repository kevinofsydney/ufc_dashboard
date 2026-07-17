import type { Bindings } from '../env'

export type ExtractionRunStatus =
  'pending' | 'running' | 'needs_review' | 'accepted' | 'failed'

export interface ExtractionRunRecord {
  id: string
  sourceId: string
  sourceTitle: string | null
  status: ExtractionRunStatus
  provider: string
  model: string
  promptVersion: string
  sourceHash: string
  rawResponse: string | null
  reviewedResponse: string | null
  validationErrors: string | null
  tokenUsage: { input: number | null; output: number | null } | null
  estimatedCostMicros: number | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ExtractionRunRow {
  id: string
  source_id: string
  source_title: string | null
  status: ExtractionRunStatus
  provider: string
  model: string
  prompt_version: string
  source_hash: string
  raw_response: string | null
  reviewed_response: string | null
  validation_errors: string | null
  token_usage_json: string | null
  estimated_cost_micros: number | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

function mapRun(row: ExtractionRunRow): ExtractionRunRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    status: row.status,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    sourceHash: row.source_hash,
    rawResponse: row.raw_response,
    reviewedResponse: row.reviewed_response,
    validationErrors: row.validation_errors,
    tokenUsage: row.token_usage_json
      ? (JSON.parse(row.token_usage_json) as ExtractionRunRecord['tokenUsage'])
      : null,
    estimatedCostMicros: row.estimated_cost_micros,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const selectRuns = `
  SELECT extraction_runs.id, extraction_runs.source_id,
         COALESCE(sources.title, cappers.name) AS source_title,
         extraction_runs.status, extraction_runs.provider,
         extraction_runs.model, extraction_runs.prompt_version,
         extraction_runs.source_hash, extraction_runs.raw_response,
         extraction_runs.reviewed_response,
         extraction_runs.validation_errors, extraction_runs.token_usage_json,
         extraction_runs.estimated_cost_micros, extraction_runs.completed_at,
         extraction_runs.created_at, extraction_runs.updated_at
  FROM extraction_runs
  INNER JOIN sources ON sources.id = extraction_runs.source_id
  LEFT JOIN cappers ON cappers.id = sources.primary_capper_id
`

export async function listExtractionRuns(
  db: Bindings['DB'],
  cardId: string,
): Promise<ExtractionRunRecord[]> {
  const result = await db
    .prepare(
      `${selectRuns}
       WHERE sources.card_id = ?
       ORDER BY extraction_runs.created_at DESC`,
    )
    .bind(cardId)
    .all<ExtractionRunRow>()
  return result.results.map(mapRun)
}

export async function getExtractionRun(
  db: Bindings['DB'],
  runId: string,
): Promise<ExtractionRunRecord | null> {
  const row = await db
    .prepare(`${selectRuns} WHERE extraction_runs.id = ?`)
    .bind(runId)
    .first<ExtractionRunRow>()
  return row ? mapRun(row) : null
}

export async function createExtractionRun(
  db: Bindings['DB'],
  input: {
    sourceId: string
    provider: string
    model: string
    promptVersion: string
    sourceHash: string
  },
): Promise<ExtractionRunRecord> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO extraction_runs (
         id, source_id, status, provider, model, prompt_version, source_hash,
         raw_response, validation_errors, token_usage_json,
         estimated_cost_micros, completed_at, created_at, updated_at
       ) VALUES (?, ?, 'running', ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    )
    .bind(
      id,
      input.sourceId,
      input.provider,
      input.model,
      input.promptVersion,
      input.sourceHash,
      now,
      now,
    )
    .run()

  return {
    id,
    sourceId: input.sourceId,
    sourceTitle: null,
    status: 'running',
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    sourceHash: input.sourceHash,
    rawResponse: null,
    reviewedResponse: null,
    validationErrors: null,
    tokenUsage: null,
    estimatedCostMicros: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function completeExtractionRun(
  db: Bindings['DB'],
  runId: string,
  input: {
    rawResponse: string
    inputTokens: number | null
    outputTokens: number | null
    estimatedCostMicros: number | null
  },
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `UPDATE extraction_runs
       SET status = 'needs_review', raw_response = ?, token_usage_json = ?,
           estimated_cost_micros = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.rawResponse,
      JSON.stringify({ input: input.inputTokens, output: input.outputTokens }),
      input.estimatedCostMicros,
      now,
      now,
      runId,
    )
    .run()
}

export async function failExtractionRun(
  db: Bindings['DB'],
  runId: string,
  errorMessage: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `UPDATE extraction_runs
       SET status = 'failed', validation_errors = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(errorMessage.slice(0, 4_000), now, now, runId)
    .run()
}

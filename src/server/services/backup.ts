import type { Bindings } from '../env'

const backupTables = [
  'app_settings',
  'cards',
  'fighters',
  'fighter_aliases',
  'fights',
  'fight_participants',
  'cappers',
  'capper_aliases',
  'sources',
  'audit_events',
  'extraction_runs',
  'fight_opinions',
  'capper_tips',
  'fight_stats',
  // extraction_review_items is unused by the application but stays listed for
  // backup/restore compatibility with existing databases.
  'extraction_review_items',
  'market_prices',
  'synthesis_runs',
  'fight_summaries',
  'bets',
  'bet_legs',
  'bet_support',
  'fight_outcomes',
] as const

type BackupTable = (typeof backupTables)[number]
type BackupRow = Record<string, string | number | null>

export interface ApplicationBackup {
  format: 'ufc-bet-synthesiser-backup'
  version: 2
  exportedAt: string
  tables: Record<BackupTable, BackupRow[]>
}

export async function exportApplicationBackup(
  db: Bindings['DB'],
): Promise<ApplicationBackup> {
  const tables = {} as ApplicationBackup['tables']
  for (const table of backupTables) {
    const result = await db.prepare(`SELECT * FROM ${table}`).all<BackupRow>()
    tables[table] = result.results
  }
  return {
    format: 'ufc-bet-synthesiser-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    tables,
  }
}

function isBackupRow(value: unknown): value is BackupRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (item) =>
        item === null || typeof item === 'string' || typeof item === 'number',
    )
  )
}

export function validateApplicationBackup(value: unknown): ApplicationBackup {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Backup must be a JSON object')
  const candidate = value as Omit<
    Partial<ApplicationBackup>,
    'version' | 'tables'
  > & {
    version?: number
    tables?: Record<string, unknown>
  }
  if (
    candidate.format !== 'ufc-bet-synthesiser-backup' ||
    (candidate.version !== 1 && candidate.version !== 2) ||
    typeof candidate.exportedAt !== 'string' ||
    typeof candidate.tables !== 'object' ||
    candidate.tables === null
  ) {
    throw new Error('Unsupported backup format')
  }
  const candidateTables = candidate.tables as Record<string, unknown>
  for (const table of backupTables) {
    const rows =
      candidate.version === 1 && table === 'app_settings'
        ? []
        : candidateTables[table]
    if (!Array.isArray(rows) || !rows.every(isBackupRow))
      throw new Error(`Backup table ${table} is invalid`)
  }
  return {
    format: 'ufc-bet-synthesiser-backup',
    version: 2,
    exportedAt: candidate.exportedAt,
    tables: {
      ...candidateTables,
      app_settings: candidate.version === 1 ? [] : candidateTables.app_settings,
    } as ApplicationBackup['tables'],
  }
}

async function tableColumns(
  db: Bindings['DB'],
  table: BackupTable,
): Promise<Set<string>> {
  const result = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string }>()
  return new Set(result.results.map((column) => column.name))
}

export async function restoreApplicationBackup(
  db: Bindings['DB'],
  rawBackup: unknown,
): Promise<{ restoredRows: number }> {
  const backup = validateApplicationBackup(rawBackup)
  const counts = await db.batch(
    backupTables.map((table) =>
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`),
    ),
  )
  if (
    counts.some(
      (result, index) =>
        backupTables[index] !== 'cappers' &&
        backupTables[index] !== 'app_settings' &&
        Number((result.results[0] as { count?: number })?.count) > 0,
    )
  ) {
    throw new Error('Restore is allowed only into a completely empty database')
  }
  const existingCappers = await db
    .prepare('SELECT id FROM cappers')
    .all<{ id: string }>()
  const backupCapperIds = new Set(backup.tables.cappers.map((row) => row.id))
  if (existingCappers.results.some((capper) => !backupCapperIds.has(capper.id)))
    throw new Error('The target database contains non-backup capper data')

  const statements: D1PreparedStatement[] = []
  const sourcePointers: Array<{ id: string; runId: string }> = []
  let restoredRows = 0
  for (const table of backupTables) {
    const allowedColumns = await tableColumns(db, table)
    for (const originalRow of backup.tables[table]) {
      const row = { ...originalRow }
      if (
        table === 'sources' &&
        typeof row.active_extraction_run_id === 'string'
      ) {
        sourcePointers.push({
          id: String(row.id),
          runId: row.active_extraction_run_id,
        })
        row.active_extraction_run_id = null
      }
      const columns = Object.keys(row)
      if (
        columns.length === 0 ||
        columns.some((column) => !allowedColumns.has(column))
      ) {
        throw new Error(`Backup columns for ${table} do not match this schema`)
      }
      statements.push(
        db
          .prepare(
            `${table === 'cappers' || table === 'app_settings' ? 'INSERT OR REPLACE' : 'INSERT'} INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          )
          .bind(...columns.map((column) => row[column])),
      )
      restoredRows += 1
    }
  }
  for (const pointer of sourcePointers) {
    statements.push(
      db
        .prepare('UPDATE sources SET active_extraction_run_id = ? WHERE id = ?')
        .bind(pointer.runId, pointer.id),
    )
  }
  if (statements.length > 0) await db.batch(statements)
  return { restoredRows }
}

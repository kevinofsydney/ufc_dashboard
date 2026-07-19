import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(resolve('migrations'))
  return entries.filter((name) => name.endsWith('.sql')).sort()
}

export async function applyMigrations(
  databases: D1Database[],
  filenames?: string[],
): Promise<void> {
  for (const filename of filenames ?? (await listMigrationFiles())) {
    const sql = (await readFile(resolve('migrations', filename), 'utf8'))
      .replace(/^PRAGMA foreign_keys = ON;\s*/u, '')
      .split(';')
      .map((statement) => statement.replace(/\s+/gu, ' ').trim())
      .filter(Boolean)
      .map((statement) => `${statement};`)
      .join('\n')
    for (const database of databases) {
      await database.exec(sql)
    }
  }
}

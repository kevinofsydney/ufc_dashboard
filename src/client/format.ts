export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function formatCardTimestamp(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(
    'en-AU',
    timeZone ? { timeZone } : undefined,
  )
}

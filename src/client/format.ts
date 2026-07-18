export function formatCardTimestamp(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(
    'en-AU',
    timeZone ? { timeZone } : undefined,
  )
}

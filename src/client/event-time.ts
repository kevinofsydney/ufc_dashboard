import type { EventProvider } from '../shared/providers'

export const EVENT_DISPLAY_TIME_ZONE = 'Australia/Melbourne'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

interface DateTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const melbourneFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT_DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function partsInMelbourne(date: Date): DateTimeParts & { second: number } {
  const parts = Object.fromEntries(
    melbourneFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

function melbourneOffsetMilliseconds(utcMilliseconds: number): number {
  const parts = partsInMelbourne(new Date(utcMilliseconds))
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - utcMilliseconds
  )
}

export function needsMelbourneStartConfirmation(
  eventStartsAtRaw: string | null,
  provider?: EventProvider,
): boolean {
  return (
    provider === 'betmma' ||
    (eventStartsAtRaw !== null && DATE_ONLY.test(eventStartsAtRaw))
  )
}

/**
 * Converts an explicitly confirmed Melbourne wall-clock value to a UTC instant.
 * Iterating the offset handles the AEST/AEDT boundary without assuming a fixed
 * numeric offset. The final comparison rejects impossible DST-gap times.
 */
export function melbourneLocalDateTimeToUtc(value: string): string {
  const match = value.match(LOCAL_DATE_TIME)
  if (!match) throw new Error('Enter a Melbourne event date and time')
  const requested: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }
  const wallClockAsUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
  )
  let utcMilliseconds = wallClockAsUtc
  for (let attempt = 0; attempt < 3; attempt += 1) {
    utcMilliseconds =
      wallClockAsUtc - melbourneOffsetMilliseconds(utcMilliseconds)
  }
  const resolved = new Date(utcMilliseconds)
  const confirmed = partsInMelbourne(resolved)
  if (
    !Number.isFinite(resolved.getTime()) ||
    confirmed.year !== requested.year ||
    confirmed.month !== requested.month ||
    confirmed.day !== requested.day ||
    confirmed.hour !== requested.hour ||
    confirmed.minute !== requested.minute
  ) {
    throw new Error(
      'That Melbourne time does not exist because of daylight saving. Choose another time.',
    )
  }
  return resolved.toISOString()
}

export function previewEventStartsAtUtc(
  eventStartsAtRaw: string | null,
  confirmedMelbourneStart: string | undefined,
  provider?: EventProvider,
): string | null {
  if (needsMelbourneStartConfirmation(eventStartsAtRaw, provider)) {
    if (!confirmedMelbourneStart)
      throw new Error(
        'Confirm the event date and time in Melbourne before importing',
      )
    return melbourneLocalDateTimeToUtc(confirmedMelbourneStart)
  }
  if (!eventStartsAtRaw) return null
  const parsed = new Date(eventStartsAtRaw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

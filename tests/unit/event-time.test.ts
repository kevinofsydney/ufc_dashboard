import { describe, expect, it } from 'vitest'
import {
  melbourneLocalDateTimeToUtc,
  needsMelbourneStartConfirmation,
  previewEventStartsAtUtc,
} from '../../src/client/event-time'

describe('event preview time confirmation', () => {
  it('requires confirmation for date-only source values', () => {
    expect(needsMelbourneStartConfirmation('2026-07-25')).toBe(true)
    expect(needsMelbourneStartConfirmation('2026-07-25T16:00:00Z')).toBe(false)
    expect(needsMelbourneStartConfirmation(null)).toBe(false)
    expect(needsMelbourneStartConfirmation(null, 'betmma')).toBe(true)
    expect(() => previewEventStartsAtUtc('2026-07-25', undefined)).toThrow(
      /Confirm the event date and time in Melbourne/,
    )
  })

  it('converts confirmed winter AEST time to UTC', () => {
    expect(melbourneLocalDateTimeToUtc('2026-07-26T12:00')).toBe(
      '2026-07-26T02:00:00.000Z',
    )
  })

  it('converts confirmed summer AEDT time to UTC', () => {
    expect(melbourneLocalDateTimeToUtc('2026-12-06T12:00')).toBe(
      '2026-12-06T01:00:00.000Z',
    )
  })

  it('preserves provider timestamps that already include a time', () => {
    expect(previewEventStartsAtUtc('2026-07-25T16:00:00.000Z', undefined)).toBe(
      '2026-07-25T16:00:00.000Z',
    )
  })

  it('requires confirmation for BetMMA even when its date cannot be parsed', () => {
    expect(() => previewEventStartsAtUtc(null, undefined, 'betmma')).toThrow(
      /Confirm the event date and time in Melbourne/,
    )
  })
})

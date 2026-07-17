import { describe, expect, it } from 'vitest'
import {
  individualExtractionSchema,
  statsTrackerExtractionSchema,
  stripMarkdownFences,
} from '../../src/shared/schemas/extraction'

describe('extraction contract', () => {
  it('accepts null missing values and rejects unknown confidence', () => {
    const base = {
      opinions: [],
      tips: [],
      fights_not_covered: [],
      unmatched: [],
    }
    expect(individualExtractionSchema.safeParse(base).success).toBe(true)
    expect(
      individualExtractionSchema.safeParse({
        ...base,
        opinions: [
          {
            fight_id: 'fight-1',
            picked_fighter_id: 'fighter-1',
            method: null,
            round: null,
            confidence: 'certain',
            reasoning: 'Clear final pick.',
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('strips one defensive markdown fence', () => {
    expect(stripMarkdownFences('```json\n{"opinions": []}\n```')).toBe(
      '{"opinions": []}',
    )
  })

  it('accepts explicit tracker counts without deriving missing values', () => {
    const parsed = statsTrackerExtractionSchema.parse({
      stats: [
        {
          fight_id: 'fight-1',
          all_channels: {
            fighter_a_count: 7,
            fighter_b_count: null,
            total: null,
          },
          best_overall: null,
          best_favourite: null,
          best_underdog: null,
          mov_counts: null,
          best_mov: null,
          bookmaker_note: null,
        },
      ],
      unmatched: [],
    })

    expect(parsed.stats[0]?.all_channels?.fighter_b_count).toBeNull()
    expect(parsed.stats[0]?.all_channels?.total).toBeNull()
  })
})

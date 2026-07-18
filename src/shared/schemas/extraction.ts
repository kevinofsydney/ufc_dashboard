import { z } from 'zod'

export const confidenceSchema = z.enum(['lean', 'solid', 'lock'])
export const methodSchema = z.enum(['ko_tko', 'submission', 'decision'])
export const roundSchema = z.enum(['1', '2', '3', '4', '5', 'distance'])
export const tipMarketSchema = z.enum([
  'moneyline',
  'method',
  'round',
  'round_and_method',
  'over_under',
  'prop',
  'parlay',
  'other',
])

const reasoningSchema = z.string().trim().min(1).max(220)

export const extractedOpinionSchema = z.object({
  fight_id: z.string().min(1),
  picked_fighter_id: z.string().min(1),
  method: methodSchema.nullable(),
  round: roundSchema.nullable(),
  confidence: confidenceSchema,
  reasoning: reasoningSchema,
  attributed_to_raw: z.string().trim().min(1).nullable().optional(),
  attributed_to_capper_id: z.string().trim().min(1).nullable().optional(),
})

export const extractedTipSchema = z.object({
  fight_id: z.string().min(1).nullable(),
  market_type: tipMarketSchema,
  selection_fighter_id: z.string().min(1).nullable(),
  method: methodSchema.nullable(),
  round: z.enum(['1', '2', '3', '4', '5']).nullable(),
  line_value: z.string().trim().max(120).nullable(),
  selection_text: z.string().trim().min(1).max(240),
  odds_mentioned_raw: z.string().trim().max(80).nullable(),
  stated_stake_units: z.number().min(0).max(1_000).nullable(),
  confidence: confidenceSchema,
  reasoning: reasoningSchema,
  attributed_to_raw: z.string().trim().min(1).nullable().optional(),
  attributed_to_capper_id: z.string().trim().min(1).nullable().optional(),
})

export const individualExtractionSchema = z.object({
  opinions: z.array(extractedOpinionSchema).max(100),
  tips: z.array(extractedTipSchema).max(100),
  fights_not_covered: z.array(z.string().min(1)).max(100),
  unmatched: z
    .array(
      z.object({
        raw_name: z.string().trim().min(1).max(160),
        context: z.string().trim().min(1).max(300),
        candidate_fight_ids: z.array(z.string().min(1)).max(20),
      }),
    )
    .max(100),
  unmatched_attribution: z
    .array(
      z.object({
        attributed_to_raw: z.string().trim().min(1).max(160),
        context: z.string().trim().min(1).max(300),
      }),
    )
    .max(100)
    .optional(),
})

export type IndividualExtraction = z.infer<typeof individualExtractionSchema>

const trackerSplitSchema = z
  .object({
    fighter_a_count: z.number().int().min(0).nullable(),
    fighter_b_count: z.number().int().min(0).nullable(),
    total: z.number().int().min(0).nullable(),
  })
  .nullable()

const trackerMovSchema = z
  .array(
    z.object({
      fighter_id: z.string().min(1),
      ko_tko: z.number().int().min(0).nullable(),
      submission: z.number().int().min(0).nullable(),
      decision: z.number().int().min(0).nullable(),
    }),
  )
  .max(2)
  .nullable()

export const statsTrackerExtractionSchema = z.object({
  stats: z
    .array(
      z.object({
        fight_id: z.string().min(1),
        all_channels: trackerSplitSchema,
        best_overall: trackerSplitSchema,
        best_favourite: trackerSplitSchema,
        best_underdog: trackerSplitSchema,
        mov_counts: trackerMovSchema,
        best_mov: trackerMovSchema,
        bookmaker_note: z.string().trim().max(500).nullable(),
      }),
    )
    .max(100),
  unmatched: individualExtractionSchema.shape.unmatched,
})

export type StatsTrackerExtraction = z.infer<
  typeof statsTrackerExtractionSchema
>

export function stripMarkdownFences(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match?.[1]?.trim() ?? trimmed
}

import { z } from 'zod'

export const cardFetchSchema = z.object({
  event_name: z.string().trim().min(1).max(200).nullable(),
  event_starts_at_raw: z.string().trim().max(200).nullable(),
  bouts: z
    .array(
      z.object({
        fighter_a: z.string().trim().min(1).max(160),
        fighter_b: z.string().trim().min(1).max(160),
        weight_class: z.string().trim().max(120).nullable(),
        bout_order: z.number().int().min(1).max(100).nullable(),
        is_main_event: z.boolean().nullable(),
      }),
    )
    .max(100),
})

export type CardFetchResult = z.infer<typeof cardFetchSchema>

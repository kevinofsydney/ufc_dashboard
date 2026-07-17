import { z } from 'zod'

export const reasoningEffortValues = [
  'default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const

export const reasoningEffortSchema = z.enum(reasoningEffortValues)

export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>

export const defaultSavedOpenRouterModels = [
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-pro',
  'z-ai/glm-5.2',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'tencent/hy3:free',
] as const

export function normalizeSavedOpenRouterModels(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))]
    .filter((model) => model.length <= 240 && model.includes('/'))
    .slice(0, 50)
}

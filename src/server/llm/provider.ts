import { z } from 'zod'

export type ModelTask =
  | 'individual_extraction'
  | 'aggregator_extraction'
  | 'stats_tracker_extraction'
  | 'fight_overviews'
  | 'slate_rationales'
  | 'card_fetch'

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ModelRequest<T> {
  task: ModelTask
  messages: ModelMessage[]
  schema: z.ZodType<T>
  temperature?: number
  metadata?: Record<string, string>
}

export interface ModelResult<T> {
  data: T
  rawText: string
  provider: 'anthropic' | 'openrouter'
  model: string
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostMicros: number | null
}

export interface ProviderConfiguration {
  provider: 'anthropic' | 'openrouter'
  model: string
  apiKey: string
  appOrigin?: string
}

export class ModelConfigurationError extends Error {}
export class ModelResponseError extends Error {}

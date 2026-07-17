import {
  reasoningEffortSchema,
  type ReasoningEffort,
} from '../shared/schemas/openrouter'

export interface OpenRouterSessionSettings {
  apiKey: string
  model: string
  reasoningEffort: ReasoningEffort
}

const STORAGE_KEY = 'fightfolio.openrouter.session.v1'

export function getOpenRouterSessionSettings(): OpenRouterSessionSettings | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const value = JSON.parse(stored) as Partial<OpenRouterSessionSettings>
    const reasoning = reasoningEffortSchema.safeParse(value.reasoningEffort)
    if (
      typeof value.apiKey !== 'string' ||
      typeof value.model !== 'string' ||
      !value.apiKey.trim() ||
      !value.model.trim()
    ) {
      return null
    }
    return {
      apiKey: value.apiKey,
      model: value.model,
      reasoningEffort: reasoning.success ? reasoning.data : 'default',
    }
  } catch {
    return null
  }
}

export function saveOpenRouterSessionSettings(
  settings: OpenRouterSessionSettings,
): void {
  const apiKey = settings.apiKey.trim()
  const model = settings.model.trim()
  if (!apiKey || !model) {
    throw new Error('Enter both an OpenRouter API key and model')
  }
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      apiKey,
      model,
      reasoningEffort: settings.reasoningEffort,
    }),
  )
}

export function clearOpenRouterSessionSettings(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // A locked-down browser may disable session storage; there is then nothing
    // durable for this tab to clear.
  }
}

export function openRouterHeaders(
  settings = getOpenRouterSessionSettings(),
): Record<string, string> {
  return settings
    ? {
        'X-OpenRouter-Api-Key': settings.apiKey,
        'X-OpenRouter-Model': settings.model,
        'X-OpenRouter-Reasoning-Effort': settings.reasoningEffort,
      }
    : {}
}

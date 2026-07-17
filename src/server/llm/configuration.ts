import type { Bindings } from '../env'
import type { ProviderConfiguration } from './provider'
import {
  reasoningEffortSchema,
  type ReasoningEffort,
} from '../../shared/schemas/openrouter'

export const OPENROUTER_KEY_HEADER = 'x-openrouter-api-key'
export const OPENROUTER_MODEL_HEADER = 'x-openrouter-model'
export const OPENROUTER_REASONING_HEADER = 'x-openrouter-reasoning-effort'

function nonEmptyHeader(
  request: Request,
  name: string,
  maximumLength: number,
): string | null {
  const value = request.headers.get(name)?.trim()
  if (!value) return null
  if (value.length > maximumLength) {
    throw new Error(`The ${name} header is too long`)
  }
  return value
}

export function providerConfigurationFromEnv(
  env: Bindings,
): ProviderConfiguration | null {
  const provider = env.LLM_PROVIDER
  const model = env.LLM_MODEL?.trim()
  const apiKey =
    provider === 'anthropic'
      ? env.ANTHROPIC_API_KEY
      : provider === 'openrouter'
        ? env.OPENROUTER_API_KEY
        : undefined

  return provider && model && apiKey
    ? { provider, model, apiKey, appOrigin: env.APP_ORIGIN }
    : null
}

export function providerConfigurationFromRequest(
  request: Request,
  env: Bindings,
): ProviderConfiguration | null {
  const apiKey = nonEmptyHeader(request, OPENROUTER_KEY_HEADER, 512)
  const model = nonEmptyHeader(request, OPENROUTER_MODEL_HEADER, 240)
  const reasoningValue = nonEmptyHeader(
    request,
    OPENROUTER_REASONING_HEADER,
    16,
  )
  const parsedReasoning = reasoningValue
    ? reasoningEffortSchema.safeParse(reasoningValue)
    : null

  if (parsedReasoning && !parsedReasoning.success) {
    throw new Error('The OpenRouter reasoning setting is invalid')
  }

  if (!apiKey && !model) return providerConfigurationFromEnv(env)
  if (!apiKey || !model) {
    throw new Error(
      'OpenRouter settings are incomplete. Enter both an API key and model in Settings.',
    )
  }

  return {
    provider: 'openrouter',
    model,
    apiKey,
    appOrigin: env.APP_ORIGIN,
    ...(parsedReasoning?.success
      ? { reasoningEffort: parsedReasoning.data }
      : {}),
  }
}

export function openRouterApiKeyFromRequest(request: Request): string | null {
  return nonEmptyHeader(request, OPENROUTER_KEY_HEADER, 512)
}

export interface OpenRouterConnectionSummary {
  keyLabel: string | null
  isFreeTier: boolean | null
  limitRemaining: number | null
  limitReset: string | null
  modelId: string
  modelName: string | null
}

export interface OpenRouterModelSummary {
  id: string
  name: string
  description: string | null
  contextLength: number | null
  promptPrice: string | null
  completionPrice: string | null
  reasoning: {
    supportedEfforts: Exclude<ReasoningEffort, 'default'>[] | null
    defaultEffort: Exclude<ReasoningEffort, 'default'> | null
    defaultEnabled: boolean | null
    supportsMaxTokens: boolean
    mandatory: boolean
  } | null
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseReasoningEfforts(
  value: unknown,
): Exclude<ReasoningEffort, 'default'>[] | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) return []
  return value.flatMap((effort) => {
    const parsed = reasoningEffortSchema.safeParse(effort)
    return parsed.success && parsed.data !== 'default' ? [parsed.data] : []
  })
}

export async function listOpenRouterModels(
  apiKey: string,
): Promise<OpenRouterModelSummary[]> {
  const response = await fetch(
    'https://openrouter.ai/api/v1/models?output_modalities=text&sort=most-popular',
    { headers: { Authorization: `Bearer ${apiKey}` } },
  )
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'OpenRouter rejected this API key'
        : `OpenRouter model catalogue failed with HTTP ${response.status}`,
    )
  }

  const envelope = recordValue(await response.json())
  const data = Array.isArray(envelope.data) ? envelope.data : []
  return data.flatMap((value) => {
    const model = recordValue(value)
    const id = optionalString(model.id)
    if (!id || !id.includes('/')) return []
    const pricing = recordValue(model.pricing)
    const reasoningData = recordValue(model.reasoning)
    const supportedParameters = Array.isArray(model.supported_parameters)
      ? model.supported_parameters
      : []
    const hasReasoning =
      Object.keys(reasoningData).length > 0 ||
      supportedParameters.includes('reasoning')
    const defaultEffort = reasoningEffortSchema.safeParse(
      reasoningData.default_effort,
    )

    return [
      {
        id,
        name: optionalString(model.name) ?? id,
        description: optionalString(model.description),
        contextLength: optionalNumber(model.context_length),
        promptPrice: optionalString(pricing.prompt),
        completionPrice: optionalString(pricing.completion),
        reasoning: hasReasoning
          ? {
              supportedEfforts: parseReasoningEfforts(
                reasoningData.supported_efforts,
              ),
              defaultEffort:
                defaultEffort.success && defaultEffort.data !== 'default'
                  ? defaultEffort.data
                  : null,
              defaultEnabled:
                typeof reasoningData.default_enabled === 'boolean'
                  ? reasoningData.default_enabled
                  : null,
              supportsMaxTokens: reasoningData.supports_max_tokens === true,
              mandatory: reasoningData.mandatory === true,
            }
          : null,
      },
    ]
  })
}

export async function testOpenRouterConfiguration(
  configuration: ProviderConfiguration,
): Promise<OpenRouterConnectionSummary> {
  if (configuration.provider !== 'openrouter') {
    throw new Error('The browser Settings page supports OpenRouter only')
  }
  if (!configuration.model.includes('/')) {
    throw new Error('Use an OpenRouter model ID in author/model format')
  }

  const headers = { Authorization: `Bearer ${configuration.apiKey}` }
  const modelPath = configuration.model
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  const [keyResponse, modelResponse] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/key', { headers }),
    fetch(`https://openrouter.ai/api/v1/model/${modelPath}`, { headers }),
  ])

  if (!keyResponse.ok) {
    throw new Error(
      keyResponse.status === 401
        ? 'OpenRouter rejected this API key'
        : `OpenRouter key check failed with HTTP ${keyResponse.status}`,
    )
  }
  if (!modelResponse.ok) {
    throw new Error(
      modelResponse.status === 404
        ? 'OpenRouter could not find that model ID'
        : `OpenRouter model check failed with HTTP ${modelResponse.status}`,
    )
  }

  const keyEnvelope = recordValue(await keyResponse.json())
  const modelEnvelope = recordValue(await modelResponse.json())
  const keyData = recordValue(keyEnvelope.data)
  const modelData = recordValue(modelEnvelope.data)

  return {
    keyLabel: typeof keyData.label === 'string' ? keyData.label : null,
    isFreeTier:
      typeof keyData.is_free_tier === 'boolean' ? keyData.is_free_tier : null,
    limitRemaining:
      typeof keyData.limit_remaining === 'number'
        ? keyData.limit_remaining
        : null,
    limitReset:
      typeof keyData.limit_reset === 'string' ? keyData.limit_reset : null,
    modelId:
      typeof modelData.id === 'string' ? modelData.id : configuration.model,
    modelName: typeof modelData.name === 'string' ? modelData.name : null,
  }
}

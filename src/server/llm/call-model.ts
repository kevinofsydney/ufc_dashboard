import { z } from 'zod'
import { stripMarkdownFences } from '../../shared/schemas/extraction'
import {
  ModelConfigurationError,
  ModelResponseError,
  type ModelRequest,
  type ModelResult,
  type ProviderConfiguration,
} from './provider'

function parseValidated<T>(rawText: string, schema: z.ZodType<T>): T {
  let decoded: unknown
  try {
    decoded = JSON.parse(stripMarkdownFences(rawText))
  } catch {
    throw new ModelResponseError('The model did not return valid JSON')
  }

  const parsed = schema.safeParse(decoded)
  if (!parsed.success) {
    throw new ModelResponseError(
      `The model response failed validation: ${z.prettifyError(parsed.error)}`,
    )
  }
  return parsed.data
}

async function callAnthropic<T>(
  request: ModelRequest<T>,
  configuration: ProviderConfiguration,
): Promise<ModelResult<T>> {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const messages = request.messages
    .filter((message) => message.role !== 'system')
    .map(({ role, content }) => ({ role, content }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': configuration.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: configuration.model,
      max_tokens: 8_192,
      system,
      messages,
      temperature: request.temperature ?? 0,
      output_config: {
        format: {
          type: 'json_schema',
          schema: z.toJSONSchema(request.schema),
        },
      },
    }),
  })

  if (!response.ok) {
    throw new ModelResponseError(`Anthropic returned HTTP ${response.status}`)
  }

  const body = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const rawText = body.content?.find((block) => block.type === 'text')?.text
  if (!rawText) throw new ModelResponseError('Anthropic returned no text')

  return {
    data: parseValidated(rawText, request.schema),
    rawText,
    provider: 'anthropic',
    model: configuration.model,
    inputTokens: body.usage?.input_tokens ?? null,
    outputTokens: body.usage?.output_tokens ?? null,
    estimatedCostMicros: null,
  }
}

async function callOpenRouter<T>(
  request: ModelRequest<T>,
  configuration: ProviderConfiguration,
): Promise<ModelResult<T>> {
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${configuration.apiKey}`,
        ...(configuration.appOrigin
          ? { 'HTTP-Referer': configuration.appOrigin }
          : {}),
        'X-OpenRouter-Title': 'UFC Bet Synthesiser',
      },
      body: JSON.stringify({
        model: configuration.model,
        messages: request.messages,
        temperature: request.temperature ?? 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.task,
            strict: true,
            schema: z.toJSONSchema(request.schema),
          },
        },
      }),
    },
  )

  if (!response.ok) {
    throw new ModelResponseError(`OpenRouter returned HTTP ${response.status}`)
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      cost?: number
    }
  }
  const rawText = body.choices?.[0]?.message?.content
  if (!rawText) throw new ModelResponseError('OpenRouter returned no text')

  return {
    data: parseValidated(rawText, request.schema),
    rawText,
    provider: 'openrouter',
    model: configuration.model,
    inputTokens: body.usage?.prompt_tokens ?? null,
    outputTokens: body.usage?.completion_tokens ?? null,
    estimatedCostMicros:
      body.usage?.cost === undefined
        ? null
        : Math.round(body.usage.cost * 1_000_000),
  }
}

export async function callModel<T>(
  request: ModelRequest<T>,
  configuration: ProviderConfiguration,
): Promise<ModelResult<T>> {
  if (!configuration.apiKey || !configuration.model) {
    throw new ModelConfigurationError(
      'An LLM provider, model, and API key must be configured',
    )
  }

  const invoke = (nextRequest: ModelRequest<T>) =>
    configuration.provider === 'anthropic'
      ? callAnthropic(nextRequest, configuration)
      : callOpenRouter(nextRequest, configuration)

  try {
    return await invoke(request)
  } catch (error) {
    if (!(error instanceof ModelResponseError)) throw error
    return invoke({
      ...request,
      messages: [
        ...request.messages,
        {
          role: 'user',
          content:
            'The previous response failed validation. Return only valid JSON matching the supplied schema. Do not add markdown or commentary.',
        },
      ],
    })
  }
}

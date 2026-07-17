import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bindings } from '../../src/server/env'
import {
  listOpenRouterModels,
  providerConfigurationFromRequest,
  testOpenRouterConfiguration,
} from '../../src/server/llm/configuration'

const emptyEnv = { DB: {} as D1Database } satisfies Bindings

describe('LLM request configuration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses a complete tab-scoped OpenRouter configuration', () => {
    const request = new Request('https://example.com/api/test', {
      headers: {
        'X-OpenRouter-Api-Key': 'secret-key',
        'X-OpenRouter-Model': 'author/model',
        'X-OpenRouter-Reasoning-Effort': 'high',
      },
    })

    expect(providerConfigurationFromRequest(request, emptyEnv)).toEqual({
      provider: 'openrouter',
      model: 'author/model',
      apiKey: 'secret-key',
      appOrigin: undefined,
      reasoningEffort: 'high',
    })
  })

  it('falls back to Worker configuration when the tab sends no override', () => {
    const request = new Request('https://example.com/api/test')

    expect(
      providerConfigurationFromRequest(request, {
        ...emptyEnv,
        LLM_PROVIDER: 'anthropic',
        LLM_MODEL: 'claude-model',
        ANTHROPIC_API_KEY: 'worker-secret',
      }),
    ).toMatchObject({
      provider: 'anthropic',
      model: 'claude-model',
      apiKey: 'worker-secret',
    })
  })

  it('rejects a partial browser override instead of mixing credentials', () => {
    const request = new Request('https://example.com/api/test', {
      headers: { 'X-OpenRouter-Api-Key': 'secret-key' },
    })

    expect(() => providerConfigurationFromRequest(request, emptyEnv)).toThrow(
      'OpenRouter settings are incomplete',
    )
  })

  it('checks the key and model without making a completion request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              label: 'sk-or-v1-ab…xyz',
              is_free_tier: false,
              limit_remaining: 12.5,
              limit_reset: 'monthly',
              creator_user_id: 'must-not-be-returned',
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { id: 'author/model', name: 'Model name' } }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testOpenRouterConfiguration({
      provider: 'openrouter',
      model: 'author/model',
      apiKey: 'secret-key',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://openrouter.ai/api/v1/key',
      'https://openrouter.ai/api/v1/model/author/model',
    ])
    expect(result).toEqual({
      keyLabel: 'sk-or-v1-ab…xyz',
      isFreeTier: false,
      limitRemaining: 12.5,
      limitReset: 'monthly',
      modelId: 'author/model',
      modelName: 'Model name',
    })
    expect(JSON.stringify(result)).not.toContain('must-not-be-returned')
    expect(JSON.stringify(result)).not.toContain('secret-key')
  })

  it('loads the model catalogue and exposes reasoning capabilities', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'author/reasoner',
              name: 'Reasoner',
              description: 'A reasoning model',
              context_length: 128000,
              pricing: { prompt: '0.000001', completion: '0.000002' },
              supported_parameters: ['reasoning'],
              reasoning: {
                supported_efforts: ['high', 'medium', 'low'],
                default_effort: 'medium',
                default_enabled: true,
                supports_max_tokens: true,
                mandatory: false,
              },
            },
            { id: 'invalid-model-without-author' },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listOpenRouterModels('secret-key')).resolves.toEqual([
      {
        id: 'author/reasoner',
        name: 'Reasoner',
        description: 'A reasoning model',
        contextLength: 128000,
        promptPrice: '0.000001',
        completionPrice: '0.000002',
        reasoning: {
          supportedEfforts: ['high', 'medium', 'low'],
          defaultEffort: 'medium',
          defaultEnabled: true,
          supportsMaxTokens: true,
          mandatory: false,
        },
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?output_modalities=text&sort=most-popular',
      { headers: { Authorization: 'Bearer secret-key' } },
    )
  })
})

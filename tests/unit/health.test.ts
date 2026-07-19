import { describe, expect, it } from 'vitest'
import app from '../../worker/index'

describe('health endpoint', () => {
  it('returns a minimal public status', async () => {
    const response = await app.request('http://localhost/health', undefined, {
      DB: {} as D1Database,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'ok',
      service: 'ufc-bet-synthesiser',
    })
  })

  it('protects data routes outside local development', async () => {
    const response = await app.request(
      'https://example.com/api/status',
      undefined,
      {
        DB: {} as D1Database,
      },
    )

    expect(response.status).toBe(401)
  })

  it.each([
    ['PATCH', '/api/settings'],
    ['POST', '/api/settings/openrouter/test'],
    ['POST', '/api/settings/openrouter/models'],
    ['POST', '/api/backup/restore'],
    ['POST', '/api/cards/fetch-preview'],
    ['POST', '/api/cards'],
    ['PATCH', '/api/cards/card-id'],
    ['DELETE', '/api/cards/card-id'],
    ['POST', '/api/fights'],
    ['PATCH', '/api/fights/fight-id'],
    ['DELETE', '/api/fights/fight-id'],
    ['PUT', '/api/fights/fight-id/outcome'],
    ['POST', '/api/cappers'],
    ['PATCH', '/api/cappers/capper-id'],
    ['POST', '/api/fighter-aliases'],
    ['POST', '/api/capper-aliases'],
    ['POST', '/api/sources'],
    ['PATCH', '/api/sources/source-id'],
    ['POST', '/api/sources/source-id/parse'],
    ['POST', '/api/extractions/run-id/accept'],
    ['POST', '/api/market-prices'],
    ['DELETE', '/api/market-prices/price-id'],
    ['POST', '/api/cards/card-id/syntheses'],
    ['POST', '/api/syntheses/run-id/accept'],
    ['POST', '/api/bets'],
    ['PATCH', '/api/bets/bet-id'],
  ] as const)(
    'rejects unauthenticated %s %s before mutation logic',
    async (method, path) => {
      const response = await app.request(
        `https://example.com${path}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'DELETE' ? undefined : '{}',
        },
        { DB: {} as D1Database },
      )
      expect(response.status).toBe(401)
    },
  )

  it.each([
    ['PATCH', '/api/settings'],
    ['POST', '/api/cards/fetch-preview'],
    ['POST', '/api/cards'],
    ['PATCH', '/api/cards/card-id'],
    ['POST', '/api/fights'],
    ['PATCH', '/api/fights/fight-id'],
    ['PUT', '/api/fights/fight-id/outcome'],
    ['POST', '/api/cappers'],
    ['PATCH', '/api/cappers/capper-id'],
    ['POST', '/api/fighter-aliases'],
    ['POST', '/api/capper-aliases'],
    ['POST', '/api/sources'],
    ['PATCH', '/api/sources/source-id'],
    ['POST', '/api/extractions/run-id/accept'],
    ['POST', '/api/market-prices'],
    ['POST', '/api/bets'],
    ['PATCH', '/api/bets/bet-id'],
  ] as const)(
    'rejects invalid local mutation input for %s %s',
    async (method, path) => {
      const response = await app.request(
        `http://localhost${path}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
        { DB: {} as D1Database },
      )
      expect(response.status).toBe(400)
    },
  )

  it('does not trust spoofed Cloudflare Access headers', async () => {
    const response = await app.request(
      'https://example.com/api/status',
      {
        headers: {
          'cf-access-jwt-assertion': 'not-a-signed-token',
          'cf-access-authenticated-user-email': 'attacker@example.com',
        },
      },
      {
        DB: {} as D1Database,
        CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
        CF_ACCESS_AUD: 'expected-audience',
      },
    )

    expect(response.status).toBe(401)
  })

  it('allows local development data routes', async () => {
    const response = await app.request(
      'http://localhost/api/status',
      undefined,
      {
        DB: {} as D1Database,
      },
    )

    expect(response.status).toBe(200)
  })

  it('returns a readable 429 before an API request reaches route logic', async () => {
    const response = await app.request(
      'http://localhost/api/status',
      undefined,
      {
        DB: {} as D1Database,
        API_RATE_LIMITER: {
          limit: async () => ({ success: false }),
        } as RateLimit,
      },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(await response.json()).toEqual({
      error:
        'Too many requests. Wait one minute before trying this action again.',
    })
  })

  it('applies the lower model-backed limit only to model operations', async () => {
    let modelChecks = 0
    const response = await app.request(
      'http://localhost/api/settings/openrouter/models',
      { method: 'POST' },
      {
        DB: {} as D1Database,
        API_RATE_LIMITER: {
          limit: async () => ({ success: true }),
        } as RateLimit,
        MODEL_RATE_LIMITER: {
          limit: async () => {
            modelChecks += 1
            return { success: false }
          },
        } as RateLimit,
      },
    )

    expect(modelChecks).toBe(1)
    expect(response.status).toBe(429)
  })

  it('requires complete OpenRouter settings for a connection check', async () => {
    const response = await app.request(
      'http://localhost/api/settings/openrouter/test',
      { method: 'POST' },
      { DB: {} as D1Database },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'Enter an OpenRouter API key and model in Settings',
    })
  })

  it('requires an OpenRouter key before loading models', async () => {
    const response = await app.request(
      'http://localhost/api/settings/openrouter/models',
      { method: 'POST' },
      { DB: {} as D1Database },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'Enter an OpenRouter API key before loading models',
    })
  })

  it('rejects a fight with the same participant on both sides before persistence', async () => {
    const response = await app.request(
      'http://localhost/api/fights',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: 'card-one',
          fighterAName: 'Same Fighter',
          fighterBName: 'same fighter',
          boutOrder: 1,
        }),
      },
      { DB: {} as D1Database },
    )

    expect(response.status).toBe(400)
  })

  it('returns a useful conflict when a capper name already exists', async () => {
    const response = await app.request(
      'http://localhost/api/cappers',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Existing capper' }),
      },
      {
        DB: {
          prepare: () => ({
            bind: () => ({
              run: async () => {
                throw new Error(
                  'D1_ERROR: UNIQUE constraint failed: cappers.name',
                )
              },
            }),
          }),
        } as unknown as D1Database,
      },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'A capper with that name already exists',
    })
  })
})

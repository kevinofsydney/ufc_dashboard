import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface D1Binding {
  binding: string
  database_name: string
  database_id: string
}

interface RateLimitBinding {
  name: string
  namespace_id: string
  simple: { limit: number; period: number }
}

interface WranglerConfiguration {
  name: string
  d1_databases: D1Binding[]
  ratelimits: RateLimitBinding[]
  env: {
    preview: {
      name: string
      d1_databases: D1Binding[]
      ratelimits: RateLimitBinding[]
    }
  }
}

async function wranglerConfiguration(): Promise<WranglerConfiguration> {
  const jsonc = await readFile(resolve('wrangler.jsonc'), 'utf8')
  return JSON.parse(
    jsonc.replace(/,\s*([}\]])/g, '$1'),
  ) as WranglerConfiguration
}

describe('deployment isolation', () => {
  it('uses distinct production and preview Worker and D1 identities', async () => {
    const configuration = await wranglerConfiguration()
    const production = configuration.d1_databases[0]
    const preview = configuration.env.preview.d1_databases[0]

    expect(configuration.env.preview.name).not.toBe(configuration.name)
    expect(production?.binding).toBe('DB')
    expect(preview?.binding).toBe('DB')
    expect(preview?.database_name).not.toBe(production?.database_name)
    expect(preview?.database_id).not.toBe(production?.database_id)
  })

  it('uses isolated rate-limit namespaces with the documented limits', async () => {
    const configuration = await wranglerConfiguration()
    const production = configuration.ratelimits
    const preview = configuration.env.preview.ratelimits

    expect(production).toEqual([
      {
        name: 'API_RATE_LIMITER',
        namespace_id: '1001',
        simple: { limit: 600, period: 60 },
      },
      {
        name: 'MODEL_RATE_LIMITER',
        namespace_id: '1002',
        simple: { limit: 20, period: 60 },
      },
    ])
    expect(preview.map(({ name }) => name)).toEqual(
      production.map(({ name }) => name),
    )
    expect(preview.map(({ namespace_id }) => namespace_id)).not.toEqual(
      production.map(({ namespace_id }) => namespace_id),
    )
  })
})

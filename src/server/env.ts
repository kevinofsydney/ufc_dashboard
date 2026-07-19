import type { JWTVerifyGetKey } from 'jose'

export interface Bindings {
  DB: D1Database
  CF_VERSION_METADATA?: WorkerVersionMetadata
  LLM_PROVIDER?: 'anthropic' | 'openrouter'
  LLM_MODEL?: string
  ANTHROPIC_API_KEY?: string
  OPENROUTER_API_KEY?: string
  APP_ORIGIN?: string
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  API_RATE_LIMITER?: RateLimit
  MODEL_RATE_LIMITER?: RateLimit
}

export interface AccessIdentity {
  email: string
}

const accessKeySets = new Map<string, JWTVerifyGetKey>()

async function getAccessKeySet(teamDomain: string): Promise<JWTVerifyGetKey> {
  const existing = accessKeySets.get(teamDomain)
  if (existing) return existing

  const { createRemoteJWKSet } = await import('jose')
  const keySet = createRemoteJWKSet(
    new URL('/cdn-cgi/access/certs', teamDomain),
  )
  accessKeySets.set(teamDomain, keySet)
  return keySet
}

export async function getAccessIdentity(
  request: Request,
  env: Bindings,
): Promise<AccessIdentity | null> {
  const url = new URL(request.url)
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (isLocal) return { email: 'local-development' }

  const assertion = request.headers.get('cf-access-jwt-assertion')
  if (!assertion || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    return null
  }

  try {
    const { jwtVerify } = await import('jose')
    const teamDomain = new URL(env.CF_ACCESS_TEAM_DOMAIN).origin
    const { payload } = await jwtVerify(
      assertion,
      await getAccessKeySet(teamDomain),
      {
        issuer: teamDomain,
        audience: env.CF_ACCESS_AUD,
      },
    )
    return typeof payload.email === 'string' && payload.email.length > 0
      ? { email: payload.email }
      : null
  } catch {
    return null
  }
}

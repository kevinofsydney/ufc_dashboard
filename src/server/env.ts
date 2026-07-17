export interface Bindings {
  DB: D1Database
  CF_VERSION_METADATA?: WorkerVersionMetadata
}

export interface AccessIdentity {
  email: string
}

export function getAccessIdentity(request: Request): AccessIdentity | null {
  const url = new URL(request.url)
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (isLocal) return { email: 'local-development' }

  const assertion = request.headers.get('cf-access-jwt-assertion')
  const email = request.headers.get('cf-access-authenticated-user-email')
  if (!assertion || !email) return null

  return { email }
}

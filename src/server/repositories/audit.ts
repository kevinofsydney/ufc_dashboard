import type { Bindings } from '../env'

export function auditEvent(
  db: Bindings['DB'],
  input: {
    entityType: string
    entityId: string
    action: string
    actorEmail: string
    details?: unknown
    now: string
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_events (
         id, entity_type, entity_id, action, actor_email, details_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.entityType,
      input.entityId,
      input.action,
      input.actorEmail,
      input.details === undefined ? null : JSON.stringify(input.details),
      input.now,
    )
}

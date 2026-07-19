import type { Bindings } from '../env'

interface AuditEventInput {
  entityType: string
  entityId: string
  action: string
  actorEmail: string
  details?: unknown
  now: string
}

function prepareAuditEvent(
  db: Bindings['DB'],
  input: AuditEventInput,
  onlyWhenPreviousStatementChanged: boolean,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_events (
         id, entity_type, entity_id, action, actor_email, details_json, created_at
       ) ${
         onlyWhenPreviousStatementChanged
           ? 'SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1'
           : 'VALUES (?, ?, ?, ?, ?, ?, ?)'
       }`,
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

export function auditEvent(
  db: Bindings['DB'],
  input: AuditEventInput,
): D1PreparedStatement {
  return prepareAuditEvent(db, input, false)
}

export function auditEventWhenPreviousStatementChanged(
  db: Bindings['DB'],
  input: AuditEventInput,
): D1PreparedStatement {
  return prepareAuditEvent(db, input, true)
}

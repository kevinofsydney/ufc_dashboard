import type { Bindings } from '../env'
import { auditEvent } from './audit'
import {
  defaultSavedOpenRouterModels,
  normalizeSavedOpenRouterModels,
  reasoningEffortSchema,
  type ReasoningEffort,
} from '../../shared/schemas/openrouter'

export interface ApplicationSettingsRecord {
  currentBankrollCents: number
  defaultUnitValueCents: number
  preferredOpenRouterModel: string | null
  savedOpenRouterModels: string[]
  openRouterReasoningEffort: ReasoningEffort
  updatedAt: string
}

interface ApplicationSettingsRow {
  current_bankroll_cents: number
  default_unit_value_cents: number
  preferred_openrouter_model: string | null
  saved_openrouter_models_json: string
  openrouter_reasoning_effort: string
  updated_at: string
}

function parseSavedModels(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => typeof item === 'string')
    )
      return [...defaultSavedOpenRouterModels]
    return normalizeSavedOpenRouterModels(parsed)
  } catch {
    return [...defaultSavedOpenRouterModels]
  }
}

function mapSettings(row: ApplicationSettingsRow): ApplicationSettingsRecord {
  return {
    currentBankrollCents: row.current_bankroll_cents,
    defaultUnitValueCents: row.default_unit_value_cents,
    preferredOpenRouterModel: row.preferred_openrouter_model,
    savedOpenRouterModels: parseSavedModels(row.saved_openrouter_models_json),
    openRouterReasoningEffort:
      reasoningEffortSchema.safeParse(row.openrouter_reasoning_effort).data ??
      'default',
    updatedAt: row.updated_at,
  }
}

export async function getApplicationSettings(
  db: Bindings['DB'],
): Promise<ApplicationSettingsRecord> {
  const row = await db
    .prepare(
      `SELECT current_bankroll_cents, default_unit_value_cents,
              preferred_openrouter_model, saved_openrouter_models_json,
              openrouter_reasoning_effort, updated_at
       FROM app_settings WHERE id = 1`,
    )
    .first<ApplicationSettingsRow>()
  if (!row) throw new Error('Application settings are unavailable')
  return mapSettings(row)
}

export async function updateApplicationSettings(
  db: Bindings['DB'],
  input: Partial<
    Pick<
      ApplicationSettingsRecord,
      | 'currentBankrollCents'
      | 'defaultUnitValueCents'
      | 'preferredOpenRouterModel'
      | 'savedOpenRouterModels'
      | 'openRouterReasoningEffort'
    >
  >,
  actorEmail: string,
): Promise<ApplicationSettingsRecord> {
  const now = new Date().toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE app_settings
         SET current_bankroll_cents = COALESCE(?, current_bankroll_cents),
             default_unit_value_cents = COALESCE(?, default_unit_value_cents),
             preferred_openrouter_model = CASE WHEN ? THEN ? ELSE preferred_openrouter_model END,
             saved_openrouter_models_json = COALESCE(?, saved_openrouter_models_json),
             openrouter_reasoning_effort = COALESCE(?, openrouter_reasoning_effort),
             updated_at = ?
         WHERE id = 1`,
      )
      .bind(
        input.currentBankrollCents ?? null,
        input.defaultUnitValueCents ?? null,
        Object.hasOwn(input, 'preferredOpenRouterModel') ? 1 : 0,
        input.preferredOpenRouterModel ?? null,
        input.savedOpenRouterModels
          ? JSON.stringify(
              normalizeSavedOpenRouterModels(input.savedOpenRouterModels),
            )
          : null,
        input.openRouterReasoningEffort ?? null,
        now,
      ),
    auditEvent(db, {
      entityType: 'app_settings',
      entityId: '1',
      action: 'updated',
      actorEmail,
      details: input,
      now,
    }),
  ])
  return getApplicationSettings(db)
}

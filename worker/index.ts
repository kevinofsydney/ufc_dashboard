import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { z } from 'zod'
import {
  EVENT_PROVIDERS,
  PROVIDER_LABELS,
  RESULTS_PROVIDERS,
  providerForUrl,
} from '../src/shared/providers'
import {
  getAccessIdentity,
  type AccessIdentity,
  type Bindings,
} from '../src/server/env'
import {
  createCapper,
  listCappers,
  updateCapper,
} from '../src/server/repositories/cappers'
import {
  createCard,
  listCards,
  softDeleteCard,
  updateCard,
} from '../src/server/repositories/cards'
import {
  listCardSourceLinks,
  putCardSourceLink,
} from '../src/server/repositories/card-source-links'
import {
  createManualBet,
  listAnalyticsBets,
  listBets,
  placeBet,
  settleBet,
  skipBet,
  unsettleBet,
} from '../src/server/repositories/bets'
import {
  createFight,
  listFights,
  softDeleteFight,
  updateFight,
} from '../src/server/repositories/fights'
import { listExtractionRuns } from '../src/server/repositories/extractions'
import {
  createMarketPrice,
  hideMarketPrice,
  listMarketPrices,
} from '../src/server/repositories/market-prices'
import {
  listCapperGrades,
  listFightOutcomes,
  recordFightOutcome,
} from '../src/server/repositories/outcomes'
import {
  createSource,
  listSources,
  updateSource,
} from '../src/server/repositories/sources'
import {
  createCapperAlias,
  createFighterAlias,
  listCapperAliases,
  listFighterAliases,
} from '../src/server/repositories/aliases'
import {
  acceptSynthesis,
  getCurrentSynthesis,
} from '../src/server/repositories/syntheses'
import { acceptExtraction } from '../src/server/services/accept-extraction'
import { parseSource } from '../src/server/services/parse-source'
import { synthesiseCard } from '../src/server/services/synthesise-card'
import {
  discoverNextCardPreview,
  fetchCardPreview,
} from '../src/server/services/fetch-card'
import { getWorkflowStatus } from '../src/server/services/workflow-status'
import {
  importTipCsv,
  previewTipCsv,
} from '../src/server/services/import-tip-csv'
import { fetchResultsPreview } from '../src/server/services/fetch-results'
import { applyResultsReview } from '../src/server/services/apply-results'
import {
  exportApplicationBackup,
  restoreApplicationBackup,
} from '../src/server/services/backup'
import { parseOdds } from '../src/shared/maths/odds'
import {
  listOpenRouterModels,
  openRouterApiKeyFromRequest,
  providerConfigurationFromRequest,
  testOpenRouterConfiguration,
} from '../src/server/llm/configuration'
import {
  normalizeSavedOpenRouterModels,
  reasoningEffortSchema,
} from '../src/shared/schemas/openrouter'
import {
  getApplicationSettings,
  updateApplicationSettings,
} from '../src/server/repositories/settings'

const app = new Hono<{
  Bindings: Bindings
  Variables: { accessIdentity: AccessIdentity }
}>()

const isUniqueConstraintError = (error: unknown) =>
  error instanceof Error && /unique constraint failed/i.test(error.message)

const isForeignKeyConstraintError = (error: unknown) =>
  error instanceof Error && /foreign key constraint failed/i.test(error.message)

app.use('/api/*', logger())

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'ufc-bet-synthesiser',
    version: c.env.CF_VERSION_METADATA?.id ?? 'local',
  }),
)

app.use('/api/*', async (c, next) => {
  const identity = await getAccessIdentity(c.req.raw, c.env)
  if (!identity) {
    return c.json({ error: 'Authentication required' }, 401)
  }
  c.set('accessIdentity', identity)
  await next()
})

const modelBackedPath = (pathname: string) =>
  pathname === '/api/cards/fetch-preview' ||
  pathname === '/api/settings/openrouter/test' ||
  pathname === '/api/settings/openrouter/models' ||
  /\/api\/sources\/[^/]+\/parse$/u.test(pathname) ||
  /\/api\/cards\/[^/]+\/syntheses$/u.test(pathname)

app.use('/api/*', async (c, next) => {
  const identity = c.get('accessIdentity')
  const generalLimit = c.env.API_RATE_LIMITER
    ? await c.env.API_RATE_LIMITER.limit({ key: identity.email })
    : { success: true }
  const modelLimit =
    generalLimit.success &&
    modelBackedPath(new URL(c.req.url).pathname) &&
    c.env.MODEL_RATE_LIMITER
      ? await c.env.MODEL_RATE_LIMITER.limit({ key: identity.email })
      : { success: true }

  if (!generalLimit.success || !modelLimit.success) {
    c.header('Retry-After', '60')
    return c.json(
      {
        error:
          'Too many requests. Wait one minute before trying this action again.',
      },
      429,
    )
  }
  await next()
})

app.get('/api/status', (c) =>
  c.json({
    status: 'ready',
    persistence: 'd1',
    timezone: 'Australia/Sydney',
  }),
)

app.get('/api/settings', async (c) =>
  c.json({ settings: await getApplicationSettings(c.env.DB) }),
)

const applicationSettingsSchema = z
  .object({
    currentBankrollCents: z.number().int().min(0).max(1_000_000_000).optional(),
    defaultUnitValueCents: z.number().int().min(1).max(1_000_000).optional(),
    preferredOpenRouterModel: z.string().trim().max(240).nullable().optional(),
    savedOpenRouterModels: z
      .array(z.string().trim().min(1).max(240))
      .max(50)
      .transform(normalizeSavedOpenRouterModels)
      .optional(),
    openRouterReasoningEffort: reasoningEffortSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one setting is required',
  })

app.patch('/api/settings', async (c) => {
  const parsed = applicationSettingsSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid application settings',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }
  return c.json({
    settings: await updateApplicationSettings(
      c.env.DB,
      parsed.data,
      c.get('accessIdentity').email,
    ),
  })
})

app.post('/api/settings/openrouter/test', async (c) => {
  try {
    const configuration = providerConfigurationFromRequest(c.req.raw, c.env)
    if (!configuration) {
      return c.json(
        { error: 'Enter an OpenRouter API key and model in Settings' },
        400,
      )
    }
    return c.json({
      connection: await testOpenRouterConfiguration(configuration),
    })
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'OpenRouter connection check failed',
      },
      422,
    )
  }
})

app.post('/api/settings/openrouter/models', async (c) => {
  try {
    const apiKey = openRouterApiKeyFromRequest(c.req.raw)
    if (!apiKey) {
      return c.json(
        { error: 'Enter an OpenRouter API key before loading models' },
        400,
      )
    }
    return c.json({ models: await listOpenRouterModels(apiKey) })
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'OpenRouter models could not be loaded',
      },
      422,
    )
  }
})

app.get('/api/analytics/bets', async (c) =>
  c.json({ bets: await listAnalyticsBets(c.env.DB) }),
)

app.get('/api/backup', async (c) =>
  c.json(await exportApplicationBackup(c.env.DB), 200, {
    'Content-Disposition': `attachment; filename="ufc-bet-synthesiser-${new Date().toISOString().slice(0, 10)}.json"`,
  }),
)

app.post('/api/backup/restore', async (c) => {
  try {
    return c.json(await restoreApplicationBackup(c.env.DB, await c.req.json()))
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Restore failed' },
      409,
    )
  }
})

app.get('/api/cards', async (c) => c.json({ cards: await listCards(c.env.DB) }))

app.post('/api/cards/fetch-preview', async (c) => {
  const parsed = z
    .object({ url: z.string().url().max(2_000) })
    .safeParse(await c.req.json())
  if (!parsed.success)
    return c.json(
      { error: 'Enter a valid BetMMA, UFC.com or Tapology event URL' },
      400,
    )
  try {
    return c.json({
      preview: await fetchCardPreview(
        c.env,
        parsed.data.url,
        providerConfigurationFromRequest(c.req.raw, c.env),
      ),
    })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Card fetch failed' },
      422,
    )
  }
})

app.post('/api/cards/discover-preview', async (c) => {
  try {
    return c.json({
      preview: await discoverNextCardPreview(
        c.env,
        providerConfigurationFromRequest(c.req.raw, c.env),
      ),
    })
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : 'Event discovery failed',
      },
      422,
    )
  }
})

const createCardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  eventStartsAtUtc: z.string().datetime().nullable().optional(),
  budgetUnits: z.number().int().min(0).max(1_000).optional(),
  unitValueCents: z.number().int().min(1).max(1_000_000).optional(),
})

app.post('/api/cards', async (c) => {
  const parsed = createCardSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid card', details: parsed.error.flatten().fieldErrors },
      400,
    )
  }

  const card = await createCard(c.env.DB, parsed.data)
  return c.json({ card }, 201)
})

const updateCardSchema = createCardSchema.extend({
  eventStartsAtUtc: z.string().datetime().nullable(),
  budgetUnits: z.number().int().min(0).max(1_000),
  unitValueCents: z.number().int().min(1).max(1_000_000),
  lifecycle: z.enum([
    'draft',
    'ready',
    'in_progress',
    'completed',
    'cancelled',
  ]),
})

app.patch('/api/cards/:cardId', async (c) => {
  const parsed = updateCardSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid card update' }, 400)
  const card = await updateCard(
    c.env.DB,
    c.req.param('cardId'),
    parsed.data,
    c.get('accessIdentity').email,
  )
  return c.json({ card })
})

app.delete('/api/cards/:cardId', async (c) => {
  try {
    await softDeleteCard(
      c.env.DB,
      c.req.param('cardId'),
      c.get('accessIdentity').email,
    )
    return c.json({ deleted: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Card not found') {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
})

app.get('/api/cards/:cardId/source-links', async (c) =>
  c.json({
    links: await listCardSourceLinks(c.env.DB, c.req.param('cardId')),
  }),
)

app.put('/api/cards/:cardId/source-links/:provider', async (c) => {
  const parsed = z
    .object({ url: z.string().url().max(2_000) })
    .safeParse(await c.req.json())
  const provider = z.enum(EVENT_PROVIDERS).safeParse(c.req.param('provider'))
  if (!parsed.success || !provider.success)
    return c.json({ error: 'Invalid event source link' }, 400)
  try {
    const url = new URL(parsed.data.url)
    if (providerForUrl(url) !== provider.data)
      return c.json(
        { error: `Enter an HTTPS ${PROVIDER_LABELS[provider.data]} URL` },
        400,
      )
    return c.json({
      link: await putCardSourceLink(
        c.env.DB,
        c.req.param('cardId'),
        provider.data,
        url.toString(),
        c.get('accessIdentity').email,
      ),
    })
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Source link could not be saved',
      },
      422,
    )
  }
})

app.get('/api/cards/:cardId/workflow-status', async (c) => {
  try {
    return c.json({
      workflow: await getWorkflowStatus(c.env.DB, c.req.param('cardId')),
    })
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : 'Workflow status failed',
      },
      404,
    )
  }
})

const tipCsvSchema = z.object({
  csv: z.string().min(1).max(250_000),
})

app.post('/api/cards/:cardId/tip-csv/preview', async (c) => {
  const parsed = tipCsvSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid tip CSV' }, 400)
  try {
    return c.json({
      preview: await previewTipCsv(
        c.env.DB,
        c.req.param('cardId'),
        parsed.data.csv,
      ),
    })
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : 'Tip CSV preview failed',
      },
      422,
    )
  }
})

app.post('/api/cards/:cardId/tip-csv/import', async (c) => {
  const parsed = tipCsvSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid tip CSV' }, 400)
  try {
    return c.json(
      await importTipCsv(
        c.env,
        c.req.param('cardId'),
        parsed.data.csv,
        c.get('accessIdentity').email,
      ),
      201,
    )
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Tip CSV import failed',
      },
      422,
    )
  }
})

app.post('/api/cards/:cardId/results/fetch-preview', async (c) => {
  try {
    return c.json({
      preview: await fetchResultsPreview(c.env.DB, c.req.param('cardId')),
    })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Result fetch failed' },
      422,
    )
  }
})

const resultsApplySchema = z.object({
  provider: z.enum(RESULTS_PROVIDERS),
  sourceUrl: z.string().url().max(2_000),
  outcomes: z
    .array(
      z.object({
        fightId: z.string().min(1),
        status: z.enum([
          'winner',
          'draw',
          'no_contest',
          'overturned',
          'cancelled',
        ]),
        winnerFighterId: z.string().min(1).nullable(),
        method: z
          .enum([
            'ko_tko',
            'submission',
            'decision',
            'disqualification',
            'other',
          ])
          .nullable(),
        round: z.enum(['1', '2', '3', '4', '5']).nullable(),
        sourceProvider: z.enum(RESULTS_PROVIDERS).optional(),
        sourceUrl: z.string().url().max(2_000).optional(),
      }),
    )
    .max(100),
  settlements: z
    .array(
      z.object({
        betId: z.string().min(1),
        result: z.enum(['won', 'lost', 'push', 'void']),
        settlementOddsInput: z.string().trim().max(40).nullable().optional(),
        legs: z
          .array(
            z.object({
              legId: z.string().min(1),
              result: z.enum(['won', 'lost', 'push', 'void']),
            }),
          )
          .max(20)
          .optional(),
      }),
    )
    .max(200),
})

app.post('/api/cards/:cardId/results/apply', async (c) => {
  const parsed = resultsApplySchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid results review' }, 400)
  try {
    return c.json(
      await applyResultsReview(c.env.DB, {
        cardId: c.req.param('cardId'),
        ...parsed.data,
        actorEmail: c.get('accessIdentity').email,
      }),
    )
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Results could not be applied',
      },
      422,
    )
  }
})

app.get('/api/fights', async (c) => {
  const cardId = c.req.query('cardId')
  if (!cardId) return c.json({ error: 'cardId is required' }, 400)
  return c.json({ fights: await listFights(c.env.DB, cardId) })
})

const fightInputSchema = z.object({
  cardId: z.string().min(1).max(120),
  fighterAName: z.string().trim().min(1).max(120),
  fighterBName: z.string().trim().min(1).max(120),
  weightClass: z.string().trim().max(120).nullable().optional(),
  boutOrder: z.number().int().min(1).max(100).nullable().optional(),
  isMainEvent: z.boolean().optional(),
})

const differentFightParticipants = (input: {
  fighterAName: string
  fighterBName: string
}) =>
  input.fighterAName.toLocaleLowerCase() !==
  input.fighterBName.toLocaleLowerCase()

const createFightSchema = fightInputSchema.refine(differentFightParticipants, {
  message: 'A fight requires two different fighters',
  path: ['fighterBName'],
})

app.post('/api/fights', async (c) => {
  const parsed = createFightSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid fight', details: parsed.error.flatten().fieldErrors },
      400,
    )
  }

  try {
    const fight = await createFight(c.env.DB, parsed.data)
    return c.json({ fight }, 201)
  } catch (error) {
    return c.json(
      {
        error: isForeignKeyConstraintError(error)
          ? 'The selected card no longer exists'
          : error instanceof Error
            ? error.message
            : 'Fight creation failed',
      },
      422,
    )
  }
})

const updateFightSchema = fightInputSchema
  .omit({ cardId: true })
  .extend({
    weightClass: z.string().trim().max(120).nullable(),
    boutOrder: z.number().int().min(1).max(100).nullable(),
    isMainEvent: z.boolean(),
    status: z.enum(['scheduled', 'cancelled', 'completed']),
  })
  .refine(differentFightParticipants, {
    message: 'A fight requires two different fighters',
    path: ['fighterBName'],
  })

app.patch('/api/fights/:fightId', async (c) => {
  const parsed = updateFightSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid fight update' }, 400)
  try {
    const fight = await updateFight(
      c.env.DB,
      c.req.param('fightId'),
      parsed.data,
      c.get('accessIdentity').email,
    )
    return c.json({ fight })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Fight update failed' },
      422,
    )
  }
})

app.delete('/api/fights/:fightId', async (c) => {
  await softDeleteFight(
    c.env.DB,
    c.req.param('fightId'),
    c.get('accessIdentity').email,
  )
  return c.json({ hidden: true })
})

app.get('/api/fight-outcomes', async (c) => {
  const cardId = c.req.query('cardId')
  if (!cardId) return c.json({ error: 'cardId is required' }, 400)
  return c.json({ outcomes: await listFightOutcomes(c.env.DB, cardId) })
})

const fightOutcomeSchema = z
  .object({
    status: z.enum([
      'pending',
      'winner',
      'draw',
      'no_contest',
      'overturned',
      'cancelled',
    ]),
    winnerFighterId: z.string().min(1).max(120).nullable(),
    method: z
      .enum(['ko_tko', 'submission', 'decision', 'disqualification', 'other'])
      .nullable(),
    round: z.enum(['1', '2', '3', '4', '5']).nullable(),
  })
  .superRefine((input, context) => {
    if (input.status === 'winner' && !input.winnerFighterId) {
      context.addIssue({
        code: 'custom',
        message: 'Select the winning fighter',
        path: ['winnerFighterId'],
      })
    }
    if (input.status !== 'winner' && input.winnerFighterId) {
      context.addIssue({
        code: 'custom',
        message: 'Only a winner result can name a winner',
        path: ['winnerFighterId'],
      })
    }
  })

app.put('/api/fights/:fightId/outcome', async (c) => {
  const parsed = fightOutcomeSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid fight outcome', details: parsed.error.flatten() },
      400,
    )
  }
  try {
    const outcome = await recordFightOutcome(
      c.env.DB,
      c.req.param('fightId'),
      parsed.data,
      c.get('accessIdentity').email,
    )
    return c.json({ outcome })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Outcome failed' },
      422,
    )
  }
})

app.get('/api/cappers', async (c) =>
  c.json({ cappers: await listCappers(c.env.DB) }),
)

app.get('/api/capper-grades', async (c) =>
  c.json({ grades: await listCapperGrades(c.env.DB) }),
)

const createCapperSchema = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2_000).nullable().optional(),
})

app.post('/api/cappers', async (c) => {
  const parsed = createCapperSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid capper', details: parsed.error.flatten().fieldErrors },
      400,
    )
  }

  try {
    const capper = await createCapper(c.env.DB, parsed.data)
    return c.json({ capper }, 201)
  } catch (error) {
    return c.json(
      {
        error: isUniqueConstraintError(error)
          ? 'A capper with that name already exists'
          : 'Capper creation failed',
      },
      409,
    )
  }
})

app.patch('/api/cappers/:capperId', async (c) => {
  const parsed = createCapperSchema
    .extend({
      notes: z.string().trim().max(2_000).nullable(),
      active: z.boolean(),
    })
    .safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid capper update' }, 400)
  try {
    return c.json({
      capper: await updateCapper(
        c.env.DB,
        c.req.param('capperId'),
        parsed.data,
      ),
    })
  } catch (error) {
    return c.json(
      {
        error: isUniqueConstraintError(error)
          ? 'A capper with that name already exists'
          : error instanceof Error
            ? error.message
            : 'Capper update failed',
      },
      422,
    )
  }
})

const aliasSchema = z.object({
  entityId: z.string().min(1).max(120),
  aliasDisplay: z.string().trim().min(1).max(160),
})

app.get('/api/fighter-aliases', async (c) =>
  c.json({ aliases: await listFighterAliases(c.env.DB) }),
)
app.post('/api/fighter-aliases', async (c) => {
  const parsed = aliasSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid fighter alias' }, 400)
  try {
    return c.json(
      {
        alias: await createFighterAlias(
          c.env.DB,
          parsed.data.entityId,
          parsed.data.aliasDisplay,
        ),
      },
      201,
    )
  } catch (error) {
    return c.json(
      {
        error: isUniqueConstraintError(error)
          ? 'That transcript spelling is already saved for this fighter'
          : isForeignKeyConstraintError(error)
            ? 'The selected fighter no longer exists'
            : error instanceof Error
              ? error.message
              : 'Alias failed',
      },
      422,
    )
  }
})

app.get('/api/capper-aliases', async (c) =>
  c.json({ aliases: await listCapperAliases(c.env.DB) }),
)
app.post('/api/capper-aliases', async (c) => {
  const parsed = aliasSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid capper alias' }, 400)
  try {
    return c.json(
      {
        alias: await createCapperAlias(
          c.env.DB,
          parsed.data.entityId,
          parsed.data.aliasDisplay,
        ),
      },
      201,
    )
  } catch (error) {
    return c.json(
      {
        error: isUniqueConstraintError(error)
          ? 'That alternate name is already saved for this capper'
          : isForeignKeyConstraintError(error)
            ? 'The selected capper no longer exists'
            : error instanceof Error
              ? error.message
              : 'Alias failed',
      },
      422,
    )
  }
})

app.get('/api/sources', async (c) => {
  const cardId = c.req.query('cardId')
  if (!cardId) return c.json({ error: 'cardId is required' }, 400)
  return c.json({ sources: await listSources(c.env.DB, cardId) })
})

const createSourceSchema = z.object({
  cardId: z.string().min(1).max(120),
  primaryCapperId: z.string().min(1).max(120).nullable().optional(),
  medium: z.enum(['youtube', 'patreon', 'pasted_text', 'webpage', 'other']),
  extractionMode: z.enum(['individual', 'aggregator', 'stats_tracker']),
  sourceUrl: z.string().url().max(2_000).nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  rawText: z.string().trim().min(1).max(250_000),
})

app.post('/api/sources', async (c) => {
  const parsed = createSourceSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid source', details: parsed.error.flatten().fieldErrors },
      400,
    )
  }

  try {
    const source = await createSource(c.env.DB, parsed.data)
    return c.json({ source }, 201)
  } catch (error) {
    return c.json(
      {
        error: isForeignKeyConstraintError(error)
          ? 'The selected card or capper no longer exists'
          : 'Source creation failed',
      },
      422,
    )
  }
})

app.patch('/api/sources/:sourceId', async (c) => {
  const parsed = createSourceSchema
    .omit({ cardId: true })
    .safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid source update' }, 400)
  try {
    const source = await updateSource(
      c.env.DB,
      c.req.param('sourceId'),
      {
        ...parsed.data,
        primaryCapperId: parsed.data.primaryCapperId ?? null,
        sourceUrl: parsed.data.sourceUrl ?? null,
        title: parsed.data.title ?? null,
      },
      c.get('accessIdentity').email,
    )
    return c.json({ source })
  } catch (error) {
    return c.json(
      {
        error: isForeignKeyConstraintError(error)
          ? 'The selected capper no longer exists'
          : error instanceof Error
            ? error.message
            : 'Source update failed',
      },
      422,
    )
  }
})

app.get('/api/extractions', async (c) => {
  const cardId = c.req.query('cardId')
  if (!cardId) return c.json({ error: 'cardId is required' }, 400)
  return c.json({ runs: await listExtractionRuns(c.env.DB, cardId) })
})

app.post('/api/sources/:sourceId/parse', async (c) => {
  try {
    const run = await parseSource(
      c.env,
      c.req.param('sourceId'),
      providerConfigurationFromRequest(c.req.raw, c.env),
    )
    return c.json({ run }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed'
    const status = message.includes('not configured') ? 503 : 422
    return c.json({ error: message }, status)
  }
})

app.post('/api/extractions/:runId/accept', async (c) => {
  try {
    const body = await c.req.json()
    const parsed = z.object({ output: z.unknown() }).safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'The reviewed extraction is invalid' }, 400)
    }
    await acceptExtraction(
      c.env,
      c.req.param('runId'),
      c.get('accessIdentity').email,
      parsed.data.output,
    )
    return c.json({ accepted: true })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Acceptance failed' },
      422,
    )
  }
})

app.get('/api/market-prices', async (c) => {
  const cardId = c.req.query('cardId')
  if (!cardId) return c.json({ error: 'cardId is required' }, 400)
  return c.json({ prices: await listMarketPrices(c.env.DB, cardId) })
})

const createMarketPriceSchema = z.object({
  cardId: z.string().min(1).max(120),
  fightId: z.string().min(1).max(120),
  bookmaker: z.string().trim().max(120).nullable().optional(),
  marketType: z.enum([
    'moneyline',
    'method',
    'round',
    'round_and_method',
    'over_under',
    'prop',
    'other',
  ]),
  selectionFighterId: z.string().min(1).max(120),
  selectionText: z.string().trim().min(1).max(240),
  oddsInput: z.string().trim().min(1).max(40),
  capturedAt: z.string().datetime().optional(),
  sourceProvider: z.enum(EVENT_PROVIDERS).nullable().optional(),
  sourceUrl: z.string().url().max(2_000).nullable().optional(),
})

app.post('/api/market-prices', async (c) => {
  const parsed = createMarketPriceSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid market price',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  let decimalOdds: number
  try {
    decimalOdds = parseOdds(parsed.data.oddsInput)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Invalid odds' },
      400,
    )
  }

  if (parsed.data.sourceProvider || parsed.data.sourceUrl) {
    if (!parsed.data.sourceProvider || !parsed.data.sourceUrl) {
      return c.json(
        { error: 'Price provenance requires provider and URL' },
        400,
      )
    }
    const sourceUrl = new URL(parsed.data.sourceUrl)
    if (providerForUrl(sourceUrl) !== parsed.data.sourceProvider) {
      return c.json({ error: 'Invalid price provenance URL' }, 400)
    }
  }

  try {
    const price = await createMarketPrice(c.env.DB, {
      ...parsed.data,
      decimalOdds: decimalOdds.toFixed(4),
    })
    return c.json({ price }, 201)
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Price creation failed',
      },
      422,
    )
  }
})

app.delete('/api/market-prices/:priceId', async (c) => {
  try {
    await hideMarketPrice(
      c.env.DB,
      c.req.param('priceId'),
      c.get('accessIdentity').email,
    )
    return c.json({ hidden: true })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Price hide failed' },
      404,
    )
  }
})

app.post('/api/cards/:cardId/syntheses', async (c) => {
  try {
    const synthesis = await synthesiseCard(
      c.env,
      c.req.param('cardId'),
      providerConfigurationFromRequest(c.req.raw, c.env),
    )
    return c.json({ synthesis }, 201)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Synthesis failed' },
      422,
    )
  }
})

app.get('/api/cards/:cardId/synthesis', async (c) =>
  c.json({
    synthesis: await getCurrentSynthesis(c.env.DB, c.req.param('cardId')),
  }),
)

app.post('/api/syntheses/:runId/accept', async (c) => {
  try {
    await acceptSynthesis(
      c.env.DB,
      c.req.param('runId'),
      c.get('accessIdentity').email,
    )
    return c.json({ accepted: true })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Acceptance failed' },
      422,
    )
  }
})

app.get('/api/bets', async (c) => {
  const cardId = c.req.query('cardId')
  if (!cardId) return c.json({ error: 'cardId is required' }, 400)
  return c.json({ bets: await listBets(c.env.DB, cardId) })
})

const manualBetSchema = z
  .object({
    cardId: z.string().min(1).max(120),
    marketType: z.string().trim().min(1).max(80),
    selectionText: z.string().trim().min(1).max(240),
    oddsTakenInput: z.string().trim().min(1).max(40),
    stakeUnits: z.number().positive().max(1_000),
    notes: z.string().trim().max(2_000).nullable().optional(),
    legs: z
      .array(
        z.object({
          fightId: z.string().min(1).max(120),
          marketType: z.string().trim().min(1).max(80),
          selectionFighterId: z.string().min(1).max(120).nullable(),
          method: z
            .enum(['ko_tko', 'submission', 'decision'])
            .nullable()
            .optional(),
          round: z.enum(['1', '2', '3', '4', '5']).nullable().optional(),
          lineValue: z.string().trim().max(120).nullable().optional(),
          selectionText: z.string().trim().min(1).max(240),
        }),
      )
      .max(30)
      .optional(),
  })
  .superRefine((input, context) => {
    if (input.marketType === 'parlay' && (input.legs?.length ?? 0) < 2) {
      context.addIssue({
        code: 'custom',
        message: 'A parlay requires at least two structured legs',
        path: ['legs'],
      })
    }
    if (input.marketType !== 'parlay' && (input.legs?.length ?? 0) > 1) {
      context.addIssue({
        code: 'custom',
        message: 'A single bet may contain at most one structured leg',
        path: ['legs'],
      })
    }
  })

app.post('/api/bets', async (c) => {
  const parsed = manualBetSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid manual bet' }, 400)
  let odds: number
  try {
    odds = parseOdds(parsed.data.oddsTakenInput)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Invalid odds' },
      400,
    )
  }
  try {
    const bet = await createManualBet(c.env.DB, {
      ...parsed.data,
      oddsTaken: odds.toFixed(4),
      stakeUnits: parsed.data.stakeUnits.toFixed(2),
    })
    return c.json({ bet }, 201)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Bet creation failed' },
      422,
    )
  }
})

const betActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('place'),
    oddsTakenInput: z.string().trim().min(1).max(40),
    stakeUnits: z.number().positive().max(1_000),
  }),
  z.object({ action: z.literal('skip') }),
  z.object({
    action: z.literal('settle'),
    result: z.enum(['won', 'lost', 'push', 'void']),
    settlementOddsInput: z.string().trim().min(1).max(40).nullable().optional(),
  }),
  z.object({ action: z.literal('unsettle') }),
])

app.patch('/api/bets/:betId', async (c) => {
  const parsed = betActionSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid bet action' }, 400)
  try {
    let bet
    if (parsed.data.action === 'skip') {
      bet = await skipBet(c.env.DB, c.req.param('betId'))
    } else if (parsed.data.action === 'place') {
      const odds = parseOdds(parsed.data.oddsTakenInput)
      bet = await placeBet(c.env.DB, c.req.param('betId'), {
        oddsTaken: odds.toFixed(4),
        stakeUnits: parsed.data.stakeUnits.toFixed(2),
      })
    } else if (parsed.data.action === 'settle') {
      const settlementOdds = parsed.data.settlementOddsInput
        ? parseOdds(parsed.data.settlementOddsInput).toFixed(4)
        : null
      bet = await settleBet(c.env.DB, c.req.param('betId'), {
        result: parsed.data.result,
        settlementOdds,
        actorEmail: c.get('accessIdentity').email,
      })
    } else {
      bet = await unsettleBet(
        c.env.DB,
        c.req.param('betId'),
        c.get('accessIdentity').email,
      )
    }
    return c.json({ bet })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Bet update failed' },
      422,
    )
  }
})

app.onError((error, c) => {
  console.error('request_failed', { message: error.message })
  return c.json({ error: 'The request could not be completed' }, 500)
})

export default app

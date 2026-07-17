import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { z } from 'zod'
import {
  getAccessIdentity,
  type AccessIdentity,
  type Bindings,
} from '../src/server/env'
import { createCapper, listCappers } from '../src/server/repositories/cappers'
import { createCard, listCards } from '../src/server/repositories/cards'
import { createFight, listFights } from '../src/server/repositories/fights'
import { createSource, listSources } from '../src/server/repositories/sources'

const app = new Hono<{
  Bindings: Bindings
  Variables: { accessIdentity: AccessIdentity }
}>()

app.use('/api/*', logger())
app.use(
  '/api/*',
  cors({
    origin: (origin) => origin,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
  }),
)

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'ufc-bet-synthesiser',
    version: c.env.CF_VERSION_METADATA?.id ?? 'local',
  }),
)

app.use('/api/*', async (c, next) => {
  const identity = getAccessIdentity(c.req.raw)
  if (!identity) {
    return c.json({ error: 'Authentication required' }, 401)
  }
  c.set('accessIdentity', identity)
  await next()
})

app.get('/api/status', (c) =>
  c.json({
    status: 'ready',
    persistence: 'd1',
    timezone: 'Australia/Sydney',
  }),
)

app.get('/api/cards', async (c) => c.json({ cards: await listCards(c.env.DB) }))

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

app.get('/api/fights', async (c) => {
  const cardId = c.req.query('cardId')
  if (!cardId) return c.json({ error: 'cardId is required' }, 400)
  return c.json({ fights: await listFights(c.env.DB, cardId) })
})

const createFightSchema = z
  .object({
    cardId: z.string().min(1).max(120),
    fighterAName: z.string().trim().min(1).max(120),
    fighterBName: z.string().trim().min(1).max(120),
    weightClass: z.string().trim().max(120).nullable().optional(),
    boutOrder: z.number().int().min(1).max(100).nullable().optional(),
    isMainEvent: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.fighterAName.toLocaleLowerCase() !==
      input.fighterBName.toLocaleLowerCase(),
    {
      message: 'A fight requires two different fighters',
      path: ['fighterBName'],
    },
  )

app.post('/api/fights', async (c) => {
  const parsed = createFightSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid fight', details: parsed.error.flatten().fieldErrors },
      400,
    )
  }

  const fight = await createFight(c.env.DB, parsed.data)
  return c.json({ fight }, 201)
})

app.get('/api/cappers', async (c) =>
  c.json({ cappers: await listCappers(c.env.DB) }),
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

  const capper = await createCapper(c.env.DB, parsed.data)
  return c.json({ capper }, 201)
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

  const source = await createSource(c.env.DB, parsed.data)
  return c.json({ source }, 201)
})

app.onError((error, c) => {
  console.error('request_failed', { message: error.message })
  return c.json({ error: 'The request could not be completed' }, 500)
})

export default app

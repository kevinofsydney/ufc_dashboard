# UFC Bet Synthesiser

A single-owner web application that turns capper opinions, tips, and market
prices for a UFC card into a transparent, budget-capped draft betting slate,
then tracks placed bets, settlement, bankroll, and capper performance over
time. All betting maths is deterministic application code; LLMs are used only
to extract structured data from pasted sources and to write human-readable
summaries, never to pick bets or calculate returns.

**Primary locale:** Australia/Sydney, AUD

## Local development quick start

Prerequisites: Node.js 22 or newer. All project dependencies and caches stay inside this repository.

```powershell
npm.cmd ci
npm.cmd run dev
```

`npm.cmd run dev` applies any pending local-only D1 migrations before starting,
so new fields cannot silently run against an outdated local database. Open
[http://127.0.0.1:5173](http://127.0.0.1:5173). Localhost bypasses the production Cloudflare Access gate and uses Wrangler's local D1 database. No Cloudflare account or LLM key is required for cards, fights, sources, prices, deterministic synthesis, ledger, settlement, or bankroll testing.

Before pushing a change, run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

LLM extraction is optional during local development. The simplest interactive
path is **Settings → OpenRouter connection**: enter a spend-limited OpenRouter
key, choose a saved model or load OpenRouter's current text-model catalogue,
select a supported reasoning level, test it, then save the connection. Model
preferences are stored in D1; the key remains limited to the current browser
tab and is not stored in D1 or backups. For a server-managed default, copy
`.env.example` to the ignored `.dev.vars` file, choose `anthropic` or
`openrouter`, and provide the matching API key. Never commit that file. Remote
Cloudflare setup is documented in `docs/cloudflare-setup.md`.

## Architecture overview

- **Client:** Vite + React single-page app in `src/client`, organised as one
  workspace component per screen (`src/client/components`), with shared
  helpers for API access (`api.ts`), formatting, card selection, and stored
  UI preferences.
- **Server:** a Cloudflare Worker (`worker/index.ts`, Hono) exposing a JSON
  API, backed by Cloudflare D1. Data access lives in
  `src/server/repositories`, multi-step workflows in `src/server/services`,
  and the LLM provider boundary in `src/server/llm`.
- **Shared contracts:** deterministic betting maths (`src/shared/maths`),
  Zod schemas (`src/shared/schemas`), and the tunable synthesis
  configuration (`src/shared/config`) are imported by both sides.
- **Database:** additive, forward-only SQL migrations in `migrations/`;
  applied migrations are never edited in place.
- **Prompts:** versioned LLM prompt contracts in `prompts/*.md`; these are
  application inputs, not documentation.
- **Tests:** unit suites for the maths and services (`tests/unit`),
  isolated-D1 integration tests via Miniflare (`tests/integration`), and a
  Playwright browser journey (`tests/e2e`).
- **CI/CD:** `.github/workflows/ci.yml` runs the full check suite on every
  push; a guarded deploy job takes a pre-migration D1 export, applies
  production migrations, and deploys the Worker when enabled.

## Documentation map

- `docs/product-spec.md`: the product specification of record — domain
  model, calculation and prompt contracts, functional requirements, and
  acceptance criteria.
- `docs/implementation-status.md`: the single source of truth for
  completed, remaining, and post-MVP work.
- `docs/local-testing.md`: local startup, automated checks, data safety,
  and manual test paths.
- `docs/cloudflare-setup.md`: one-time preview/production release
  checklist.
- `AGENTS.md`: repository rules for coding agents.

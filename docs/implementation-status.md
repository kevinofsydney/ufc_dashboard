# Implementation status

Updated: 17 July 2026

## Executive status

The MVP feature set is implemented and runs locally. It is not yet production
released. Local checks are green, while several PRD acceptance tests, preview
deployment wiring, and credentialed Cloudflare/provider checks remain before the
MVP can be called production-ready.

Status terms used below:

- **Implemented:** product code and persistence are present.
- **Locally verified:** exercised by an automated test or recorded local visual check.
- **Release pending:** requires repository hardening or an external account/credential.
- **Post-MVP:** deliberately outside the MVP scope.

## Implemented

### Platform and data

- React 19, Vite, Tailwind CSS, Hono, and one Cloudflare Worker/static-assets build.
- Cloudflare D1 with ten additive, forward-only migrations.
- Cards, fighters, aliases, fights, participants, cappers, sources, extraction
  runs, opinions, tips, stats, prices, synthesis, bets, legs, outcomes, and audit
  persistence.
- Public minimal `/health`; all `/api/*` routes are protected outside localhost.
- Cloudflare Access JWT verification checks signature, issuer, and audience.

### Weekly product workflow

- Responsive How to, Card, Fight Board, Sources, Odds Board, Bet Ledger, Bankroll, and Settings workspaces.
- Reliable source/capper form completion after asynchronous saves, readable
  duplicate-name/alias conflicts, and automatic local migrations before the
  development server starts.
- Persistent light/dark themes and a collapsible desktop icon rail, with the
  charcoal-and-lime design system applied across workspaces and labelled mobile navigation preserved.
- Accessible contextual tooltips for every workspace and the main workflow sections.
- Persistent saved OpenRouter models, live text-model catalogue loading,
  model-aware reasoning effort selection, tab-scoped key entry, masked-key
  controls, non-billable connection validation, and server-secret fallback.
  Browser-entered keys are
  excluded from D1, backups, logs, application responses, and source control.
- D1-backed current-bankroll and default-unit settings, with the unit default
  applied to new cards and historical card values preserved.
- UFC event previews retain explicitly displayed raw moneyline odds and offer an
  opt-in import to the Odds Board with page provenance.
- Manual card/fight entry and UFC.com structured-data preview with LLM fallback.
- Confirmed card deletion through an audited soft delete that preserves related history.
- Non-destructive event-page merge, fight replacement/reordering/status, aliases,
  and audited soft hiding.
- Individual, aggregator, and stats-tracker parsing through Anthropic or OpenRouter.
- Versioned extraction runs, deterministic chunking/merge, schema validation,
  retry handling, attribution review, and immutable acceptance.
- Current manual prices with American/decimal normalization and staleness signals.
- Deterministic consensus, badges, method/round support, tiering, conflicts,
  allocation, budget enforcement, and optional generated parlay.
- Evidence-rich Fight Board with supporters, dissent, tracker divergence,
  missing-price explanations, and deterministic language fallbacks.
- Versioned draft/accepted synthesis; re-synthesis does not rewrite ledger bets.
- Generated/manual bets, structured parlay legs, actual exposure warnings,
  settlement locking, adjusted settlement odds, and audited unsettlement.
- Outcomes, bankroll units/AUD, gross/net/ROI, date filters, breakdowns, capper
  accuracy, and priced-tip ROI without inventing ROI for unpriced opinions.
- Authenticated versioned JSON backup and clean-database restore.

### Repository automation

- npm lockfile and repository-local dependency/cache policy.
- TypeScript, ESLint, Prettier, Vitest, Miniflare/D1, and Playwright tooling.
- GitHub Actions jobs for checks, guarded production migration/deployment, public
  health smoke testing, and authenticated `/api/status` smoke testing.
- Cloudflare observability enabled in `wrangler.jsonc`.
- One-time Cloudflare setup and local testing runbooks.

## Locally verified

The final local acceptance run on 17 July 2026 passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run format:check`
- `npm.cmd test`: 46/46 tests across 11 files
- `npm.cmd run test:e2e`: three Chromium checks
- `npm.cmd run build`: Worker and client production bundles

The existing automated coverage proves interface preference persistence,
phone-width layout containment, odds conversion, consensus/allocation
boundaries, model validation/retry contracts, card-fetch SSRF restrictions,
backup validation, an isolated-D1 synthesis transaction, priced-tip grading, a
complete backup/restore rehearsal, and a manual browser flow through card,
fight, source, capper, alias, odds, settlement-correction, bankroll, and backup
controls. Desktop and phone-sized local visual checks also passed without
console errors or horizontal overflow.

No tracked file was deleted during the build, and no live provider, production
database, paid service, or secret was used.

## Required before production release

### Repository and pipeline hardening

- Move the remote `wrangler d1 export` step out of the general `test` job and
  into the credentialed production deployment job immediately before migrations.
  In its current location it can make ordinary pushes and pull requests require
  Cloudflare credentials and does not guarantee the export is adjacent to deploy.
- Add the PRD-required committed-secret scan to CI; the current workflow does not run one.
- Add and verify an isolated preview deployment path. The current workflow has a
  guarded production deployment but does not deploy pull requests to a preview Worker.
- Decide and implement the production rate-limit layer (Cloudflare policy or an
  application mechanism) and document the chosen limits.

### Missing PRD acceptance coverage

- Add at least four realistic, de-identified messy extraction fixtures covering
  changed final picks, hedges, “no bet,” name ambiguity, aggregator attribution,
  missing stats, and prompt-injection-like source text.
- Add integration coverage for parse → review → accept, identical reparse,
  re-synthesis with placed bets, late fighter replacement, alias resolution,
  previous-schema migration upgrades, and authorization/validation of mutations.
- Add direct settlement tests for single bets, parlays, adjusted void-leg odds,
  push/void, ROI denominators, and overturned outcomes.
- Extend Playwright through the full generated workflow: source review, odds,
  synthesis, Fight Board, generated-bet placement, settlement, and analytics.
- Run a keyboard/accessibility scan and a deployed CPU/large-source profile.

These are verification and release-hardening gaps, not missing primary screens or
weekly workflow implementations.

### Owner/account setup

- Create separate production and preview D1 databases and replace the placeholder IDs.
- Configure separate preview and production Cloudflare Access applications/policies.
- Add `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` to both Worker environments.
- Add the least-privilege Cloudflare token, account ID, Access service-token
  values, and production URL to the GitHub environments described in the setup guide.
- Configure a production LLM provider/model Worker secret. The Settings page can
  be used as an interactive OpenRouter override, but does not replace a durable
  server default for operational smoke tests.
- Run controlled live Anthropic/OpenRouter and UFC.com event-page smoke tests.
- Deploy preview, prove it cannot access production D1, and complete mobile/manual review.
- Complete the first production deploy and authenticated smoke check.
- Rehearse production backup recovery and confirm retained pre-migration exports.
- Enable `CLOUDFLARE_DEPLOY_ENABLED=true` only after every item above passes.
- Configure free-plan usage alerts and confirm paid billing remains disabled.

## Post-MVP backlog

- YouTube caption fetching with manual-paste fallback.
- Automated odds snapshots, closing lines, and CLV.
- Bounded historical capper weights with no look-ahead.
- Calibration and extraction-quality/cost reporting.
- CSV export, shareable slate images, prompt-tuning UI, multi-event weekends, and optional PWA support.

## Release definition

The MVP becomes production-ready when all “Required before production release”
items are complete and the PRD acceptance criteria pass in the protected
production environment. Until then, describe it as **feature-complete and locally
verified**, not as deployed or production-proven.

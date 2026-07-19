# Implementation status

Updated: 18 July 2026

## Executive status

The MVP feature set is implemented and runs locally. It is not yet production
released. The repository now contains the full local release journey, acceptance
fixtures, accessibility checks, committed-secret scanning, isolated preview
wiring, and application rate limits. Credentialed Cloudflare/provider checks and
activation of the protected preview and production environments remain before
the MVP can be called production-ready.

Status terms used below:

- **Implemented:** product code and persistence are present.
- **Locally verified:** exercised by an automated test or recorded local visual check.
- **Release pending:** requires repository hardening or an external account/credential.
- **Post-MVP:** deliberately outside the MVP scope.

## Implemented

### Platform and data

- React 19, Vite, Tailwind CSS, Hono, and one Cloudflare Worker/static-assets build.
- Cloudflare D1 with a sequence of additive, forward-only migrations in `migrations/`.
- Cards, fighters, aliases, fights, participants, cappers, sources, extraction
  runs, opinions, tips, stats, prices, synthesis, bets, legs, outcomes, and audit
  persistence.
- Public minimal `/health`; all `/api/*` routes are protected outside localhost.
- Cloudflare Access JWT verification checks signature, issuer, and audience.
- Per-identity Cloudflare Worker rate limits allow 600 authenticated API requests
  per minute and 20 model-backed requests per minute, with readable `429` responses.

### Weekly product workflow

- Responsive How to, Card, Fight Board, Sources, Odds Board, Bet Ledger, Bankroll, and Settings workspaces.
- All workspaces use a single vertical reading order for major sections instead
  of side-by-side page panels, while compact controls and data rows remain usable.
- Workspace headings use explanatory subtitles without duplicating the same
  guidance in title hover tooltips.
- Sources is organised as a four-step vertical workflow: choose a card, manage
  capper identities, save source material, then parse/review/accept it.
- Reliable source/capper form completion after asynchronous saves, readable
  duplicate-name/alias conflicts, and automatic local migrations before the
  development server starts.
- Transcript CSV preview and import, including validated multipart-row ordering
  and recombination, per-video extraction modes, duplicate detection, and
  automatic capper creation for individual sources.
- Persistent light/dark themes and a collapsible desktop icon rail, with the
  charcoal-and-lime design system applied across workspaces and labelled mobile navigation preserved.
- Helpful workspace subtitles and contextual guidance for the main workflow sections.
- Persistent saved OpenRouter models, live text-model catalogue loading,
  model-aware reasoning effort selection, tab-scoped key entry, masked-key
  controls, non-billable connection validation, and server-secret fallback.
  OpenRouter requests use the selected model's exact provider ID rather than its
  display label. Browser-entered keys are excluded from D1, backups, logs,
  application responses, and source control.
- Settings content aligns with its page heading; model loading and reasoning
  controls use consistent field and icon alignment.
- D1-backed current-bankroll and default-unit settings, with the unit default
  applied to new cards and historical card values preserved.
- UFC event previews deterministically parse the official rendered bout markup,
  retain every explicitly displayed raw moneyline, report priced-bout coverage,
  warn about incomplete prices, and offer an opt-in import to the Odds Board
  with page provenance. JSON-LD and the bounded LLM path remain fallbacks.
- A single-column Cards workspace with expandable saved-card bout lists and one
  combined setup section for UFC import/merge, blank-card creation, and manual
  card/fight maintenance.
- Manual bout maintenance has explicit column titles, readable status labels,
  and widths that keep scheduled status and action controls visible.
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
- Ledger CSV preview/import for up to 200 validated singles, with exact selected-card
  fight/fighter matching, supported fighter markets, explicit fight-wide props,
  a downloadable card-aware template, and a copyable non-inventive screenshot prompt.
- Outcomes, bankroll units/AUD, gross/net/ROI, date filters, breakdowns, capper
  accuracy, and priced-tip ROI without inventing ROI for unpriced opinions.
- Authenticated versioned JSON backup and clean-database restore.

### Repository automation

- npm lockfile and repository-local dependency/cache policy.
- TypeScript, ESLint, Prettier, Vitest, Miniflare/D1, and Playwright tooling.
- Recorded UFC markup and mocked OpenRouter integration fixtures cover
  multi-bout odds extraction and the generated parse/review/accept/synthesis
  workflow without contacting paid or live services.
- GitHub Actions jobs for checks, guarded production migration/deployment, public
  health smoke testing, and authenticated `/api/status` smoke testing.
- Full-history Gitleaks scanning and an internal-PR-only, disabled-by-default
  preview deployment job with a separate Worker, D1 database, Access credentials,
  rate-limit namespaces, migrations, and smoke checks.
- Cloudflare observability enabled in `wrangler.jsonc`.
- One-time Cloudflare setup and local testing runbooks.

## Current local verification

The most recent local checks on 18 July 2026 produced:

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run format:check`: passed repository-wide.
- `npm.cmd test`: 116 tests across 18 unit and isolated-D1 integration files passed.
- `npm.cmd run test:e2e`: seven Chromium journeys passed.
- `npm.cmd run build`: Worker and client production and preview bundles passed.
- Wrangler production and preview deployment dry-runs resolved the intended
  assets, D1, and rate-limit bindings without uploading or contacting live data.

The automated coverage proves interface preference persistence, layout
containment, odds conversion, consensus/allocation boundaries, model
validation/retry contracts, card-fetch SSRF restrictions, deterministic
multi-bout UFC markup/odds extraction, backup validation, and generated
parse/review/accept/synthesis behavior. It also covers changed picks, hedges,
explicit no-bets, ambiguous names, aggregator attribution, missing tracker data,
prompt-injection-like source text, identical reparses, resynthesis after placing
a bet, late opponent replacement, previous-schema migrations, authenticated and
validated mutations, single/parlay/push/void/overturned settlement, adjusted
void-leg odds, ROI, and audited unsettlement.

The Chromium suite completes the weekly generated-bet journey from source review
through synthesis, Fight Board acceptance, placement, settlement, and bankroll
ROI. It also covers the manual workflow, Cards organisation, multipart CSV
import, keyboard skip navigation, serious/critical WCAG A/AA Axe checks on all
eight workspaces in both themes, and 200%-equivalent layout containment. No paid provider, live
UFC request, production database, secret, or production Cloudflare resource is
used by these local checks.

No tracked file was deleted during the build, and no live provider, production
database, paid service, or secret was used.

## Recommended next sequence

1. **Provision and activate the protected preview environment.** Replace the
   preview placeholders, configure its separate D1, Access application, secrets,
   URL, and GitHub environment, then enable the guarded preview workflow.
2. **Run credentialed release checks.** Prove preview isolation, exercise
   controlled live UFC/OpenRouter paths, verify deployed rate limiting, and run a
   deployed CPU/large-source profile.
3. **Rehearse recovery and release.** Restore a protected backup into a clean
   rehearsal database, review the deployed UI manually, then enable the guarded
   production workflow only after every owner/account item below passes.

## Required before production release

### Repository controls to verify remotely

- Make the Gitleaks scan and test job required checks in GitHub and confirm a
  deliberately seeded test secret is rejected without committing a real secret.
- Run the guarded preview workflow against the provisioned preview resources and
  prove its Worker, D1, Access audience, secrets, and rate-limit namespaces are
  isolated from production.
- Verify the deployed `429` behavior and profile Worker CPU and large-source
  handling within the selected Cloudflare plan.

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
- Enable `CLOUDFLARE_PREVIEW_DEPLOY_ENABLED=true`, deploy preview, prove it cannot
  access production D1, and complete mobile/manual review.
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

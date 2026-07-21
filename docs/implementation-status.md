# Implementation status

Updated: 21 July 2026

## Executive status

The MVP feature set, including the card-first weekly workflow, is implemented
and runs locally. It is not yet production released. The repository now contains
the full local release journey, acceptance fixtures, accessibility checks,
committed-secret scanning, isolated preview wiring, and application rate limits.
Credentialed Cloudflare/provider checks and activation of the protected preview
and production environments remain before the MVP can be called production-ready.

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
- Per-card UFC/Tapology source links and provenance, imported outcome provenance,
  and structured fight/fighter/method/round/line settlement targets on new bets
  and parlay legs are persisted through additive migration `0012_card_workflow.sql`.
- Public minimal `/health`; all `/api/*` routes are protected outside localhost.
- Cloudflare Access JWT verification checks signature, issuer, and audience.
- Per-identity Cloudflare Worker rate limits allow 600 authenticated API requests
  per minute and 20 model-backed requests per minute, with readable `429` responses.

### Weekly product workflow

- A card-first shell replaces the sidebar with a global app bar and five
  left-to-right, always-revisitable stages: Event, Tipper picks, Recommendations,
  My bets, and Results. Help, Performance/Bankroll, Settings, and theme controls
  are global utilities.
- The active event is shared across all stages, persisted locally, and
  synchronised with `card`, `step`, and utility-view query parameters. Direct
  links, reloads, and browser back/forward navigation retain the workflow context.
- A server-computed workflow-status contract supplies each stage's semantic
  state, concise counts, blockers, and recommendation staleness. Icons and text
  accompany every status, and incomplete prerequisites guide without locking
  later stages.
- Desktop uses a sticky horizontal workflow strip. Mobile uses a contained,
  internally scrollable snap-aligned strip, a visible step counter, and
  Previous/Next controls without page-level horizontal overflow.
- Stage navigation moves focus to the destination heading, maintains keyboard
  access and 44px touch targets, and preserves existing unsaved-change warnings.
- Event combines reviewed card/order management, aliases, event source settings,
  and Odds Board evidence. With no upcoming card it attempts a review-only UFC
  discovery in the Australia/Sydney context and falls back to Tapology; it never
  writes a discovered event silently.
- UFC/Tapology card previews carry provider, source URL, field provenance,
  conflicts, bout changes/order, and odds coverage. Fetches enforce exact HTTPS
  host allowlists, redirect revalidation, timeouts, and response-size limits.
- Website prices remain unconfirmed evidence until explicitly imported as a
  timestamped Odds Board snapshot.
- Tipper picks presents structured tip CSV, transcript CSV, and pasted/written
  sources together without another working-card selector.
- Structured tip CSV v1 validates the versioned schema and canonical markets,
  previews exact selected-card mappings and conflicts, stores the raw source,
  and creates an accepted deterministic non-LLM extraction run. Mentioned odds
  remain evidence only, and directional consensus counts at most one vote per
  capper and fight.
- Recommendations combines readiness, synthesis controls, Fight Board evidence,
  and draft acceptance. Changes to accepted evidence, fight data, or qualifying
  odds mark an older synthesis stale; deterministic allocation and budget maths
  remain unchanged.
- My bets combines recommendation place/skip decisions, manual singles, parlays,
  and ledger CSV import while retaining legacy unstructured bets for manual
  settlement.
- Results owns fight outcomes and provides saved-URL UFC-first/Tapology-fallback
  fetch previews, provenance/conflict review, deterministic structured market and
  parlay-leg grading, and one transactional reviewed apply with audit records.
  Ambiguous, free-text, incomplete, legacy, and void-price cases remain manual.
- All stage content keeps a single vertical reading order for major sections
  while compact controls and data rows remain usable.
- Reliable source/capper form completion after asynchronous saves, readable
  duplicate-name/alias conflicts, and automatic local migrations before the
  development server starts.
- Transcript CSV preview and import, including validated multipart-row ordering
  and recombination, per-video extraction modes, duplicate detection, and
  automatic capper creation for individual sources.
- Persistent light/dark themes, with the charcoal-and-lime design system applied
  across workflow stages and labelled global utilities.
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

The most recent local checks on 21 July 2026 produced:

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run format:check`: passed repository-wide.
- `npm.cmd test`: 145 tests across 21 unit and isolated-D1 integration files passed.
- `npm.cmd run test:e2e`: seven Chromium journeys passed.
- `npm.cmd run build`: Worker and client production bundles passed.

The automated coverage proves selected-event and theme persistence, direct stage
navigation, layout containment, odds conversion, consensus/allocation
boundaries, model validation/retry contracts, card-fetch SSRF restrictions,
deterministic UFC and Tapology markup extraction, structured-tip CSV validation
and evidence-only odds, exact card identity mapping, one-vote-per-capper
consensus, backup validation, and generated parse/review/accept/synthesis
behavior. It also covers changed picks, hedges, explicit no-bets, ambiguous
names, aggregator attribution, missing tracker data, prompt-injection-like source
text, identical reparses, resynthesis after placing a bet, late opponent
replacement, previous-schema migrations, authenticated mutations, transactional
result application with provenance/audits, structured single/parlay grading,
draw/no-contest/cancellation/overturned/manual fallbacks, void-leg confirmation,
ROI, and audited unsettlement.

The Chromium suite completes the weekly journey from reviewed card/odds through
structured tip CSV, synthesis, acceptance, placement, fetched-results review,
transactional settlement, and bankroll ROI. It also covers the manual workflow,
event persistence, multipart transcript CSV import, 390px mobile containment,
keyboard/focus navigation, serious/critical WCAG A/AA Axe checks across the five
stages and global utilities in both themes, and 200%-equivalent layout
containment. No paid provider, live UFC/Tapology request, production database,
secret, or production Cloudflare resource is used by these local checks.

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

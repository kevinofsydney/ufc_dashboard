# Implementation status

Updated: 17 July 2026

## Current checkpoint

The MVP is code-complete and locally verified. Eight forward-only D1 migrations,
all six responsive workspaces, versioned extraction/review, deterministic
synthesis, the ledger/settlement workflow, analytics, and backup/restore are
implemented. Existing local D1 records were preserved; verification only added
new records.

## Completed locally

- Additive React/Vite/Tailwind application scaffold.
- Hono Worker with public `/health` and protected `/api/*` boundary.
- D1 configuration and eight forward-only migrations.
- Foundation tables for cards, fighters, aliases, fights, participants, cappers, sources, and audit events.
- Seeded individual cappers without treating the stats tracker as a capper.
- Persistent create/list APIs for cards, fights, cappers, and sources.
- Responsive product shell with Card, Fight Board, Sources, Odds Board, Bet Ledger, and Bankroll workspaces.
- Manual card creation, manual bout-list creation, capper creation, and source capture.
- Structured UFC.com preview, import, and non-destructive merge of new bouts.
- Card, bout, capper, source, alias, and soft-hide maintenance with audit events.
- Individual, aggregator, and stats-tracker extraction with reviewed immutable acceptance.
- Current-price history with staleness signals and audited soft hiding.
- Evidence-rich Fight Board with tracker divergence, dissent, method/round denominators, and deterministic language fallbacks.
- Optional batched LLM overviews and rationales that fail independently from numerical synthesis.
- Generated/manual bets, structured parlay legs, actual exposure warnings, settlement locking, and explicit audited unsettlement.
- Running bankroll, gross/net/ROI, date filters, origin/tier/market splits, and capper grading.
- Authenticated versioned JSON backup and clean-database restore.
- Deterministic American/decimal odds conversion, settlement profit, and normalized winner consensus modules.
- CI workflow with typecheck, lint, formatting, tests, build, guarded migration/deployment, and smoke check.
- One-time Cloudflare setup runbook.

## Verified

- Local D1 migrations apply successfully.
- Local API can create and reload a card, fight, capper seed set, and source.
- Public health endpoint returns HTTP 200.
- Non-local data routes verify the Cloudflare Access JWT signature, issuer, and audience; spoofed headers are rejected.
- Typecheck passes.
- Lint passes.
- Formatting check passes.
- Thirty-four unit/integration tests, including a real isolated-D1 synthesis and backup restore rehearsal, pass.
- The browser journey covers card/bout creation, outcome persistence, structured parlay placement, reload, settlement, bankroll reconciliation, and backup download.
- Production Worker and client build passes.
- No tracked file was deleted during the build.

## External release setup remaining

- Replace placeholder D1 IDs with the owner’s production and preview database IDs.
- Add the least-privilege Cloudflare token and account ID to GitHub Actions secrets.
- Configure production and preview Cloudflare Access policies.
- Add `PRODUCTION_URL` and enable `CLOUDFLARE_DEPLOY_ENABLED=true` only after the above checks pass.
- Verify the first protected preview and production deployment.
- Configure one LLM provider key and run optional live contract smoke tests with spending limits.
- Exercise a real UFC.com event page because its external markup and fetch policy cannot be guaranteed by fixtures alone.

No live LLM, production database, remote deployment, paid service, or secret has
been used. These release operations require the owner’s Cloudflare and provider
credentials; they are not missing application code.

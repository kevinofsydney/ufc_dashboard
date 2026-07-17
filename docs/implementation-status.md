# Implementation status

Updated: 17 July 2026

## Completed locally

- Additive React/Vite/Tailwind application scaffold.
- Hono Worker with public `/health` and protected `/api/*` boundary.
- D1 configuration and two forward-only migrations.
- Foundation tables for cards, fighters, aliases, fights, participants, cappers, sources, and audit events.
- Seeded individual cappers without treating the stats tracker as a capper.
- Persistent create/list APIs for cards, fights, cappers, and sources.
- Responsive product shell with Card, Fight Board, and Sources workspaces.
- Manual card creation, manual bout-list creation, capper creation, and source capture.
- Deterministic American/decimal odds conversion, settlement profit, and normalized winner consensus modules.
- CI workflow with typecheck, lint, formatting, tests, build, guarded migration/deployment, and smoke check.
- One-time Cloudflare setup runbook.

## Verified

- Local D1 migrations apply successfully.
- Local API can create and reload a card, fight, capper seed set, and source.
- Public health endpoint returns HTTP 200.
- Non-local data routes reject requests without the Cloudflare Access headers.
- Typecheck passes.
- Lint passes.
- Formatting check passes.
- Sixteen unit/API-boundary tests pass.
- Production Worker and client build passes.
- No tracked file was deleted during the build.

## Milestone 0 external setup remaining

- Replace placeholder D1 IDs with the owner’s production and preview database IDs.
- Add the least-privilege Cloudflare token and account ID to GitHub Actions secrets.
- Configure production and preview Cloudflare Access policies.
- Add `PRODUCTION_URL` and enable `CLOUDFLARE_DEPLOY_ENABLED=true` only after the above checks pass.
- Verify the first protected preview and production deployment.

## Milestone 1 next

- Add update flows for card metadata, bout ordering, replacements, capper notes, and sources.
- Add non-destructive cancellation and soft-delete workflows with audit events.
- Add fighter and capper alias review UI.
- Replace Fight Board placeholder rows with the selected card’s persisted bouts.
- Add integration tests against an isolated local D1 database.

No LLM call, production database, remote deployment, paid service, or secret has been used yet.

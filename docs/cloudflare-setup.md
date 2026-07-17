# One-time Cloudflare deployment setup

Updated: 17 July 2026

Status: **not yet performed**. The repository contains the Worker build and a
guarded production deployment job, but the release blockers below must be fixed
and verified before deployment is enabled.

The intended steady-state maintenance loop is zero-touch: work locally, push to
GitHub, and let the workflow test and deploy a green `main` commit.

## Prerequisites

- A Cloudflare account on the Workers Free plan.
- The GitHub repository connected to the owner’s account.
- A production hostname. The provided `workers.dev` hostname is sufficient initially.

## 0. Finish repository release hardening

Before adding credentials or enabling deployment:

- Move `wrangler d1 export --remote` from the general CI `test` job to the
  credentialed `deploy` job, immediately before production migrations.
- Add a committed-secret scan to the required CI checks.
- Add a preview deployment job/environment with its own Worker name, D1 binding,
  secrets, Access audience, and hostname. Never use the production D1 binding in preview.
- Configure and document a rate-limit policy suitable for the single-owner app.
- Complete the missing acceptance tests listed in `implementation-status.md`.

Do not set `CLOUDFLARE_DEPLOY_ENABLED` until this section is complete.

## 1. Create isolated databases

Create two D1 databases:

- `ufc-bet-synthesiser` for production.
- `ufc-bet-synthesiser-preview` for preview/manual verification.

Copy their generated IDs into the existing `database_id` and `preview_database_id` fields in `wrangler.jsonc`. The all-zero values are deliberate non-production placeholders and must never identify a live database.

Also add these non-secret Worker variables to the appropriate preview and
production Wrangler environments using the values shown by each Access application:

- `CF_ACCESS_TEAM_DOMAIN`, for example `https://your-team.cloudflareaccess.com`.
- `CF_ACCESS_AUD`, the application audience tag.

The Worker verifies every Access assertion against Cloudflare's published signing keys, issuer, and audience. Merely sending Access-shaped headers never authenticates a request.

## 2. Create a least-privilege API token

Create a Cloudflare API token limited to the account and resources used by this application. It needs permission to deploy the Worker, upload static assets, export/apply D1 migrations, and read only the resources needed by the workflow. Do not use the global API key.

Add these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

The last two values come from a Cloudflare Access service token limited to this
application. CI uses it only for the authenticated post-deployment status check.

Add this GitHub Actions production environment variable:

- `PRODUCTION_URL`, set to the final HTTPS origin without a trailing slash.

Create an equivalent GitHub `preview` environment with separate preview values.
Do not expose production secrets to pull requests from untrusted forks.

## 3. Protect the application

Create a Cloudflare Access application covering the production hostname and allow only the owner’s identity. Create a separate Access policy for preview deployments. Configure an explicit bypass only for `/health`; it returns service status and no private data.

Ensure direct alternative hostnames are disabled or covered by the same Access policy so callers cannot bypass authentication.
If a custom domain becomes the protected production origin, disable the default `workers.dev` route or confirm that its API requests remain rejected because they receive no valid assertion for the configured audience.

## 4. Enable automatic deployment

After the IDs, secrets, URL, and Access policies are verified, add this repository-level GitHub Actions variable:

```text
CLOUDFLARE_DEPLOY_ENABLED=true
```

Before that variable exists, pushes should run only the local/fixture CI suite and
skip deployment. This is true only after the remote export has been moved out of
the test job as described in step 0. After activation, every green push to `main`
exports production D1, applies migrations, deploys the Worker/static assets, and
checks both `/health` and authenticated `/api/status`.

The local release baseline now exercises card, fight, source, capper, alias,
odds, ledger, settlement-correction, bankroll, and backup controls. It does not
replace the credentialed provider, Access, preview-isolation, or production
checks below.

## 5. Verify once

Confirm all of the following:

- A normal push to `main` runs CI and deploys without a dashboard action.
- The workflow retains a seven-day pre-migration D1 SQL export as a protected artifact.
- `/health` returns HTTP 200 without revealing data.
- Every `/api/*` route is inaccessible without Cloudflare Access.
- The Access service-token smoke check reaches authenticated `/api/status`.
- Preview cannot access production D1.
- An idle period requires no wake-up or manual reactivation.
- A real provider extraction succeeds and its token/cost metadata is recorded.
- A real UFC.com event page produces a reviewable preview or a readable fallback.
- The authenticated application backup restores into a clean rehearsal database.
- Cloudflare usage alerts are configured and paid billing remains disabled.

Do not enable paid billing automatically. Expected hosting, static assets, and database cost is $0/month. Any fallback above $0 requires explicit owner approval and may not exceed $3 USD/month without revising the PRD.

## 6. Definition of done

Production setup is complete only when the protected preview and production
environments have both passed their smoke checks, preview isolation is proven, a
backup restore is rehearsed, and a later ordinary green push to `main` deploys
without any dashboard action. Record the first verified deployment date in
`implementation-status.md`.

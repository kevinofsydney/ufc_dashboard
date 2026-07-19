# One-time Cloudflare deployment setup

Updated: 18 July 2026

Status: **not yet performed**. The repository contains the Worker build and
guarded preview and production deployment jobs, but the external resources and
release checks below must be configured and verified before deployment is enabled.

The intended steady-state maintenance loop is zero-touch: work locally, push to
GitHub, and let the workflow test and deploy a green `main` commit.

## Prerequisites

- A Cloudflare account on the Workers Free plan.
- The GitHub repository connected to the owner’s account.
- A production hostname. The provided `workers.dev` hostname is sufficient initially.

## 0. Verify repository release safeguards

The repository already provides:

- a full-history Gitleaks scan in the CI test job;
- an internal-pull-request-only preview deployment job, gated by
  `CLOUDFLARE_PREVIEW_DEPLOY_ENABLED`;
- separate production and preview Worker names, D1 bindings, and rate-limit
  namespaces in `wrangler.jsonc`;
- authenticated application rate limits of 600 API requests per identity per
  minute and 20 model-backed requests per identity per minute; and
- local functional, reliability, settlement, migration, authorization, and
  accessibility release checks listed in `implementation-status.md`.

In GitHub, make the Gitleaks/test job a required check. After preview is
provisioned, run its deployment and smoke checks and verify that a rate-limited
request returns `429` with a readable response and `Retry-After` header.

Do not set `CLOUDFLARE_DEPLOY_ENABLED` until this section is complete.

## 1. Create isolated databases

Create two D1 databases:

- `ufc-bet-synthesiser` for production.
- `ufc-bet-synthesiser-preview` for preview/manual verification.

Copy the production ID into the top-level `d1_databases[0].database_id` and the
preview ID into `env.preview.d1_databases[0].database_id` in `wrangler.jsonc`.
Also keep the top-level `preview_database_id` pointed at a non-production database
for Wrangler local/preview use; it must never identify production. The all-zero
values are deliberate placeholders and must be replaced before remote deployment.

The production rate-limit namespace IDs are `1001` and `1002`; preview uses
`2001` and `2002`. Keep them distinct if Cloudflare requires replacement IDs.

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

Create an equivalent GitHub `preview` environment with separate preview values,
including a `PREVIEW_URL` environment variable and preview-only
`CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` secrets.
Do not expose production secrets to pull requests from untrusted forks.

## 3. Protect the application

Create a Cloudflare Access application covering the production hostname and allow only the owner’s identity. Create a separate Access policy for preview deployments. Configure an explicit bypass only for `/health`; it returns service status and no private data.

Ensure direct alternative hostnames are disabled or covered by the same Access policy so callers cannot bypass authentication.
If a custom domain becomes the protected production origin, disable the default `workers.dev` route or confirm that its API requests remain rejected because they receive no valid assertion for the configured audience.

## 4. Enable automatic deployment

After the preview database, Worker, Access policy, URL, and GitHub environment
are configured, add this repository-level GitHub Actions variable:

```text
CLOUDFLARE_PREVIEW_DEPLOY_ENABLED=true
```

This enables preview deployment only for pull requests whose branch is inside
this repository. Forked pull requests never receive preview credentials.

After the IDs, secrets, URL, and Access policies are verified, add this repository-level GitHub Actions variable:

```text
CLOUDFLARE_DEPLOY_ENABLED=true
```

Before that variable exists, pushes run only the local/fixture CI suite and
skip deployment. After activation, every green push to `main`
exports production D1, applies migrations, deploys the Worker/static assets, and
checks both `/health` and authenticated `/api/status`.

The local release baseline includes the complete generated-bet workflow,
settlement and recovery boundaries, authorization/validation checks, keyboard
navigation, Axe scanning, and 200%-equivalent layout containment. It does not
replace the credentialed provider, Access, preview-isolation, deployed CPU, or
production checks below.

## 5. Verify once

Confirm all of the following:

- A normal push to `main` runs CI and deploys without a dashboard action.
- The workflow retains a seven-day pre-migration D1 SQL export as a protected artifact.
- `/health` returns HTTP 200 without revealing data.
- Every `/api/*` route is inaccessible without Cloudflare Access.
- The Access service-token smoke check reaches authenticated `/api/status`.
- Preview cannot access production D1.
- Preview and production use distinct rate-limit namespaces, and excessive
  authenticated API/model traffic returns a readable `429` without affecting the
  other environment.
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

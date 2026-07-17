# One-time Cloudflare deployment setup

Routine maintenance is intentionally zero-touch after this one-time setup: work locally, push to GitHub, and let the workflow test and deploy a green `main` commit.

## Prerequisites

- A Cloudflare account on the Workers Free plan.
- The GitHub repository connected to the owner’s account.
- A production hostname. The provided `workers.dev` hostname is sufficient initially.

## 1. Create isolated databases

Create two D1 databases:

- `ufc-bet-synthesiser` for production.
- `ufc-bet-synthesiser-preview` for preview/manual verification.

Copy their generated IDs into the existing `database_id` and `preview_database_id` fields in `wrangler.jsonc`. The all-zero values are deliberate non-production placeholders and must never identify a live database.

Also add these non-secret Worker variables to `wrangler.jsonc` using the values shown by the Access application:

- `CF_ACCESS_TEAM_DOMAIN`, for example `https://your-team.cloudflareaccess.com`.
- `CF_ACCESS_AUD`, the application audience tag.

The Worker verifies every Access assertion against Cloudflare's published signing keys, issuer, and audience. Merely sending Access-shaped headers never authenticates a request.

## 2. Create a least-privilege API token

Create a Cloudflare API token limited to the account and resources used by this application. It needs permission to deploy the Worker, upload static assets, and apply D1 migrations. Do not use the global API key.

Add these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

The last two values come from a Cloudflare Access service token limited to this
application. CI uses it only for the authenticated post-deployment status check.

Add this GitHub Actions production environment variable:

- `PRODUCTION_URL`, set to the final HTTPS origin without a trailing slash.

## 3. Protect the application

Create a Cloudflare Access application covering the production hostname and allow only the owner’s identity. Create a separate Access policy for preview deployments. Configure an explicit bypass only for `/health`; it returns service status and no private data.

Ensure direct alternative hostnames are disabled or covered by the same Access policy so callers cannot bypass authentication.
If a custom domain becomes the protected production origin, disable the default `workers.dev` route or confirm that its API requests remain rejected because they receive no valid assertion for the configured audience.

## 4. Enable automatic deployment

After the IDs, secrets, URL, and Access policies are verified, add this repository-level GitHub Actions variable:

```text
CLOUDFLARE_DEPLOY_ENABLED=true
```

Before that variable exists, pushes still run the complete CI suite but safely skip deployment. After it is enabled, every green push to `main` applies migrations, deploys the Worker and static assets, and calls `/health` automatically.

## 5. Verify once

Confirm all of the following:

- A normal push to `main` runs CI and deploys without a dashboard action.
- The workflow retains a seven-day pre-migration D1 SQL export as a protected artifact.
- `/health` returns HTTP 200 without revealing data.
- Every `/api/*` route is inaccessible without Cloudflare Access.
- The Access service-token smoke check reaches authenticated `/api/status`.
- Preview cannot access production D1.
- An idle period requires no wake-up or manual reactivation.

Do not enable paid billing automatically. Expected hosting, static assets, and database cost is $0/month. Any fallback above $0 requires explicit owner approval and may not exceed $3 USD/month without revising the PRD.

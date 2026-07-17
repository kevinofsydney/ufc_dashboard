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

## 2. Create a least-privilege API token

Create a Cloudflare API token limited to the account and resources used by this application. It needs permission to deploy the Worker, upload static assets, and apply D1 migrations. Do not use the global API key.

Add these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Add this GitHub Actions production environment variable:

- `PRODUCTION_URL`, set to the final HTTPS origin without a trailing slash.

## 3. Protect the application

Create a Cloudflare Access application covering the production hostname and allow only the owner’s identity. Create a separate Access policy for preview deployments. Configure an explicit bypass only for `/health`; it returns service status and no private data.

Ensure direct alternative hostnames are disabled or covered by the same Access policy so callers cannot bypass authentication.

## 4. Enable automatic deployment

After the IDs, secrets, URL, and Access policies are verified, add this repository-level GitHub Actions variable:

```text
CLOUDFLARE_DEPLOY_ENABLED=true
```

Before that variable exists, pushes still run the complete CI suite but safely skip deployment. After it is enabled, every green push to `main` applies migrations, deploys the Worker and static assets, and calls `/health` automatically.

## 5. Verify once

Confirm all of the following:

- A normal push to `main` runs CI and deploys without a dashboard action.
- `/health` returns HTTP 200 without revealing data.
- Every `/api/*` route is inaccessible without Cloudflare Access.
- Preview cannot access production D1.
- An idle period requires no wake-up or manual reactivation.

Do not enable paid billing automatically. Expected hosting, static assets, and database cost is $0/month. Any fallback above $0 requires explicit owner approval and may not exceed $3 USD/month without revising the PRD.

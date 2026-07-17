# Local testing runbook

## Start the app

From the repository root in PowerShell:

```powershell
npm.cmd install
npm.cmd run db:migrate:local
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. The dev server runs the React client and Cloudflare Worker together, backed by local D1 state under the ignored `.wrangler` directory.

The first useful manual journey is:

1. Create a card and add at least one fight.
2. Add a capper and paste a source.
3. Enter current moneyline prices on the Odds Board.
4. Create a draft on the Fight Board. With no accepted opinions, verify that no bet is manufactured and the budget remains unspent.
5. Accept a qualifying draft to expose its recommendations in the Bet Ledger.
6. Record actual odds and stake, or add a manual placed bet.
7. Settle it as won, lost, push, or void.
8. Verify units, AUD, stake, and ROI on Bankroll.

LLM parsing requires optional local provider configuration in the ignored `.dev.vars` file. Without it, `Parse source` returns a readable configuration message and does not spend money.

## Automated checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

The automated suite never calls a live LLM, UFC page, bookmaker, production D1 database, or paid service.

`npm.cmd test` includes a clean, isolated D1 restore rehearsal and a real
deterministic synthesis transaction. `npm.cmd run test:e2e` starts and stops its
own local server and covers manual parlay persistence and settlement.

## Local database

Apply any new forward-only migration with:

```powershell
npm.cmd run db:migrate:local
```

Do not remove `.wrangler` when local records need to be preserved. Production migration and deployment commands are intentionally separate and require Cloudflare credentials.

## Backup and restore rehearsal

Use **Bankroll → Download backup** to save the authenticated, versioned JSON
export. Restore accepts that file only on a freshly migrated database (the four
seed cappers are allowed) and refuses to overwrite application data:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:5173/api/backup/restore `
  -ContentType application/json `
  -InFile C:\path\to\ufc-bet-synthesiser-YYYY-MM-DD.json
```

The restore endpoint is intentionally not exposed as a normal UI action.

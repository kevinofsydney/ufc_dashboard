# Local testing runbook

Updated: 18 July 2026

This runbook covers the implemented local MVP. It does not require Cloudflare or
an LLM key unless the corresponding live integration is being exercised.

## Prerequisites

- Node.js 22 or newer.
- PowerShell on Windows.
- Run every command from the repository root.
- Keep all dependencies and configurable caches inside this repository.

## Start the app

From the repository root in PowerShell:

```powershell
npm.cmd ci
npm.cmd run dev
```

`npm.cmd run dev` first applies any pending local-only D1 migrations, then runs
the React client and Cloudflare Worker together. Open
`http://127.0.0.1:5173`. Local D1 state stays under the ignored `.wrangler`
directory.

The first useful deterministic manual journey is:

1. Create a card and add at least one fight.
2. Add a capper and paste a source.
3. Enter current moneyline prices on the Odds Board.
4. Create a draft on the Fight Board. With no accepted opinions, verify that no bet is manufactured and the budget remains unspent.
5. Accept a qualifying draft to expose its recommendations in the Bet Ledger.
6. Record actual odds and stake, or add a manual placed bet.
7. Settle it as won, lost, push, or void.
8. Verify units, AUD, stake, and ROI on Bankroll.

LLM parsing requires optional provider configuration. Without it, `Parse
source` returns a readable configuration message and does not spend money.

For OpenRouter, open **Settings** in the sidebar:

1. Enter a spend-limited OpenRouter API key.
2. Choose one of the saved model IDs. Optionally select **Load models** to fetch
   OpenRouter's current text-model catalogue, or save another `author/model` ID.
3. Choose a thinking/reasoning effort supported by the selected model. Loading
   the live catalogue tailors the choices when OpenRouter reports this metadata.
4. Select **Test connection**. This checks key and model metadata without making
   a completion request or spending model tokens.
5. Select **Save connection**.
6. Parse a source or synthesise a card.

The model and reasoning preferences persist in local D1 and application
backups. The API key survives a refresh only in the same tab; it is not written
to D1, backups, or source control. Use **Clear tab key** before leaving a shared
computer. Closing the tab normally ends the key's browser session.

**Load models** calls OpenRouter's live metadata API and therefore requires
network access and a valid key, but it does not use completion tokens. Automated
tests mock this call; they never contact OpenRouter.

The same Settings page stores the current AUD bankroll and default unit size in
local D1. The unit default is used when creating or importing a new card;
existing cards keep the value snapshotted on that card. The Bankroll page shows
the manually maintained current balance separately from calculated settled P/L.

To test the server-managed Anthropic/OpenRouter alternative, copy `.env.example` to `.dev.vars`, set
`LLM_PROVIDER`, `LLM_MODEL`, and exactly one matching provider key, restart the
server, then exercise all three modes: individual, aggregator, and stats tracker.
Review every proposed identity and value before accepting a run. Live calls cost
money and are intentionally excluded from automated checks.

## Automated checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

The automated suite never calls a live LLM, UFC page, bookmaker, production D1
database, or paid service. The verified baseline is the full unit and
isolated-D1 integration suite plus three Chromium checks.

`npm.cmd test` includes a clean, isolated D1 restore rehearsal, deterministic
synthesis transactions, multi-bout UFC markup parsing, and a mocked OpenRouter
journey through parse, review, acceptance, generated copy, allocation, and
synthesis acceptance. `npm.cmd run test:e2e` starts and stops its own local
server and covers interface preferences, phone-width layouts,
the Cards accordion and vertical setup order, multipart transcript-CSV import,
card/fight/source/capper/alias/odds mutations, duplicate handling, outcomes,
manual parlay persistence, settlement correction, bankroll reconciliation, and
backup download. It does not yet cover
the complete source-review → odds → generated
synthesis workflow; that extension remains a pre-production acceptance task.

## Local database

Starting the app applies pending local migrations automatically. To apply them
without starting the app, run:

```powershell
npm.cmd run db:migrate:local
```

Do not remove `.wrangler` when local records need to be preserved. Production migration and deployment commands are intentionally separate and require Cloudflare credentials.

The repository includes an idempotent local seed for the official 18 July 2026
UFC Oklahoma City card. It records the 12-bout card verified on 17 July after
the UFC's late replacements:

```powershell
$env:XDG_CONFIG_HOME='.localappdata'
.\node_modules\.bin\wrangler.cmd d1 execute ufc-bet-synthesiser --local --file scripts\data\ufc-fight-night-july-18-2026.sql
```

Rerunning this command does not duplicate the card, fights, or participants.
The seed intentionally does not copy UFC-page odds into the Odds Board because
current qualifying prices require an owner-reviewed bookmaker snapshot.

Unit/integration tests use isolated databases. The E2E runner uses local D1 but
removes only cards named `E2E UFC Card *` and their owned test records when it
finishes, including after a failed browser test. It preserves every other card.
If a fully clean manual database is ever desired, back it up first and use a
separately named local D1 database rather than deleting the existing `.wrangler`
state.

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

## Manual release checks still required

Before production activation, manually verify:

1. Four messy extraction examples, including uncertain fighter/capper identities.
2. Direct-over-aggregated deduplication after reviewed acceptance.
3. Current-price qualification and stale/missing-price explanations.
4. Generated Core, Value, and optional parlay behavior at budget boundaries.
5. Re-synthesis after a recommendation has already been placed.
6. Win, loss, push, void, adjusted parlay, unsettle, and overturned-result paths.
7. Keyboard navigation and common phone widths.
8. Workspace subtitles and contextual guidance remain readable at keyboard
   focus, 200% zoom, and common desktop and phone widths.
9. UFC event previews report how many bouts have page odds and do not omit
   rendered prices silently.

The complete release gap list lives in `docs/implementation-status.md`.

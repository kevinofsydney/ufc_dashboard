# UFC Bet Synthesiser — Product Specification

**Scope:** product contract, architecture decisions, data model, calculation and prompt contracts, and acceptance criteria. This is the specification of record for how the application must behave.

**Status tracking:** live completed/remaining/post-MVP status is NOT kept here — see `docs/implementation-status.md`. Local development and testing instructions live in `README.md` and `docs/local-testing.md`.

**Primary locale:** Australia/Sydney, AUD

---

## 1. Background

The owner currently spends many hours each week preparing UFC bets: watching fight tape and YouTube breakdowns, reading Patreon tips, comparing predictors, and deciding how to allocate a weekly budget. This application outsources the repetitive synthesis work to software and an LLM so that the weekly ritual becomes:

> add a card → paste sources → review extraction → enter current odds → synthesise → read the board → place bets manually → settle → review results

Key facts:

- Typical weekly budget: approximately **30 units**.
- Default unit value: **AUD $10**, configurable per card.
- Preferred portfolio: mostly consensus-backed favourites, with a smaller allocation to value and underdog plays.
- Bets are placed manually at a bookmaker. The application never places bets.
- UFC events usually occur Sunday morning in Sydney. Store instants in UTC and display them in `Australia/Sydney`, which handles AEST/AEDT correctly.

### Real source types

| Source                  | Role                     | Typical content                                                            |
| ----------------------- | ------------------------ | -------------------------------------------------------------------------- |
| The MMA Guru            | individual capper        | winner, method, round, confidence and reasoning                            |
| MMA Lock of the Night   | individual capper        | winner, method and sometimes round                                         |
| TonyHasDiedMMA          | individual capper        | picks and props                                                            |
| Kunath MMA              | individual capper        | picks and props                                                            |
| UFC Predictions Tracker | stats tracker            | aggregate channel counts, best-predictor splits, MOV counts and odds notes |
| Patreon tipsters        | individual or aggregator | pasted tips, sometimes relaying named third-party predictors               |

The stats tracker is complementary to individual cappers. It provides broad crowd and “best predictor” samples; individual cappers provide method, round and reasoning. Their raw data remains separate and is blended only in computed views.

### Terminology

- **Card:** one UFC event and everything attached to it.
- **Fight/bout:** one scheduled matchup on a card.
- **Capper/tipster/predictor:** a person or channel making forecasts or betting recommendations.
- **Opinion:** a capper’s forecast of winner, method and round, whether or not they recommend a bet.
- **Tip:** a capper’s explicit betting recommendation, such as moneyline or over 2.5.
- **Unit (u):** stake denomination. The unit’s AUD value is snapshotted per card.
- **ML:** moneyline, a bet on the winner.
- **MOV/method:** KO/TKO, submission or decision.
- **Chalk:** heavy favourite.
- **Dog:** underdog.
- **Slate:** the application’s recommended set of bets for a card.
- **CLV:** closing line value, comparing the price taken with the closing price.

---

## 2. Product summary

The product is a private, single-user web application that:

1. Creates UFC cards from an event page or manual entry.
2. Ingests pasted transcripts, multipart transcript CSV exports, and written tips; later it can fetch YouTube captions.
3. Uses an LLM to extract structured opinions, explicit tips and aggregate statistics.
4. Requires human review of uncertain identity mappings and extracted data.
5. Accepts current market prices before synthesis.
6. Computes consensus, badges, eligibility and stakes in deterministic code.
7. Presents a fixed Fight Board with crowd-versus-sharps divergence, method, round and concise reasoning.
8. Produces a budget-capped recommended slate.
9. Tracks the bets actually placed, including manual bets and parlays.
10. Settles results and shows bankroll, ROI, capper accuracy and system-versus-manual performance.

### Non-negotiable design principles

1. **LLM for language; code for maths.** Counting, conversions, scoring, staking, settlement and performance calculations are deterministic and tested.
2. **Fixed render contracts.** The UI layout comes from code; the LLM fills validated text fields.
3. **Never invent.** Missing information is `null`. Ambiguous mappings enter a review queue.
4. **Human-reviewed identity.** The LLM may propose mappings but cannot silently create a confident match from an ambiguous name.
5. **Honest consensus.** Small samples, splits and crowd-versus-sharps disagreement are visible.
6. **Track reality.** Performance uses the odds and stake actually taken, not the recommendation price.
7. **Do not force-spend.** The allocator may recommend less than the budget.
8. **No chasing.** Previous losses never increase a stake or loosen qualification rules.
9. **Immutable history.** Re-parsing and re-synthesising create versioned runs and never overwrite placed or settled bets.
10. **Provider and platform seams are thin, not speculative.** Build for Cloudflare first; keep LLM provider adapters clean. Do not maintain an untested Fly.io implementation in MVP.

### Out of scope for MVP

- Bet placement or bookmaker account integration.
- Multi-user accounts, registration or social features.
- Automated wagering or autonomous bankroll changes.
- Live betting.
- Automated odds ingestion and CLV; these are Phase 2.
- Remote issue-comment coding agents.
- Editorial claims that betting is profitable. The product displays evidence and performance.

---

## 3. Product decisions made before implementation

These decisions resolve ambiguities that would otherwise cause architectural rework:

1. **Hosting:** one Cloudflare Worker serves the React/Vite static assets and Hono API on the same origin.
2. **Database:** Cloudflare D1 is the only production database target in MVP. SQL remains portable where practical, but Fly.io parity is deferred until a real need appears.
3. **Authentication:** Cloudflare Access with an allowlist for the owner is the default gate for production and preview deployments. The Worker validates the Access JWT signature, issuer and application audience against Cloudflare's published keys; it never trusts header presence alone. The application has no user table. If Access cannot satisfy the owner’s login preference, custom password authentication is a separately scoped fallback with a password hash, `SESSION_SECRET`, secure cookie, expiry, CSRF protection and durable rate limiting.
4. **Health check:** `GET /health` is the only intentionally public application endpoint and returns no data beyond service/version status. Every data and mutation route requires authentication.
5. **MVP odds:** the owner enters or pastes current prices on an Odds Board before synthesis. Mentioned odds from transcripts remain evidence only.
6. **Consensus:** confidence-adjusted vote strength is normalized across both sides, so consensus shares are always between 0 and 1.
7. **Identity:** relationships use IDs, never fighter-name strings as foreign keys.
8. **Opinion versus tip:** winner forecasts and explicit betting recommendations are stored separately.
9. **Parlays:** parlays are first-class bets with structured legs and combined odds.
10. **Versioning:** extraction and synthesis are immutable runs. Re-running creates a new draft.
11. **Money:** currency values use integer AUD cents. Decimal odds use a fixed-precision decimal representation, never binary floating point for persisted settlement maths.
12. **External fetching:** structured data is attempted first, LLM parsing second, and manual editing always remains available.

Additional hosting and deployment contracts:

- **Hosting longevity:** the production application and database must not sleep, freeze, expire, be archived, be deleted, or require manual reactivation solely because they have received no traffic. Transparent serverless scale-to-zero is acceptable only when the next request starts automatically and all persisted data remains available.
- **Cost ceiling:** hosting, static assets and database should cost **$0/month** at expected single-user usage. Any fallback must cost no more than **$3 USD/month** and requires owner approval before paid billing is enabled. LLM usage and an optional custom domain are tracked separately from hosting.
- **Deployment experience:** the routine maintenance loop is: edit and test locally → commit and push to GitHub → CI runs automatically → a green `main` deploys automatically to Cloudflare. Routine deployment must require no hosting-dashboard login, server administration, manual wake-up or local deployment command.

### Current Cloudflare constraints to design around

As of July 2026, the free Workers plan allows 100,000 requests per day and 10 ms of CPU per HTTP invocation; network waiting time is not CPU time. Free D1 provides 500 MB per database, 5 GB total account storage, and seven days of Time Travel. This application is tiny relative to the request and storage quotas, but authentication hashing, fuzzy matching and large validation payloads must be profiled in a deployed spike.

References:

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Workers Static Assets best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

Infrastructure target: **$0/month at normal usage**, excluding LLM usage and an optional custom domain. Configure usage alerts. Do not automatically upgrade or enable paid billing. If Cloudflare’s free offering stops satisfying the longevity or workload requirements, select a replacement costing no more than **$3 USD/month** or obtain owner approval before proceeding.

---

## 4. Technology and repository architecture

### Application stack

- **Language:** TypeScript with strict mode.
- **Frontend:** React, Vite and Tailwind CSS.
- **Backend:** Hono in a Cloudflare Worker.
- **Static hosting:** Workers Static Assets served alongside the API.
- **Database:** Cloudflare D1, with local D1 through Wrangler.
- **Validation:** Zod at every external and persistence boundary.
- **Tests:** Vitest for unit/integration tests and Playwright for the critical user journey.
- **Charts:** lightweight semantic HTML/CSS analytics visualisation; no separate chart dependency in the MVP.
- **Package manager:** npm with a committed lockfile. All dependencies and caches stay inside the project where configurable; no global project dependencies are required.

### Current repository layout

```text
/
├── AGENTS.md
├── README.md
├── docs/
├── package.json
├── wrangler.jsonc
├── migrations/
├── prompts/
│   ├── individual-extraction.md
│   ├── aggregator-extraction.md
│   ├── stats-tracker-extraction.md
│   ├── card-fetch.md
│   ├── fight-overviews.md
│   └── slate-rationales.md
├── src/
│   ├── client/
│   │   └── components/
│   ├── server/
│   │   ├── llm/
│   │   ├── repositories/
│   │   └── services/
│   └── shared/
│       ├── config/
│       ├── maths/
│       └── schemas/
├── worker/
├── scripts/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── .github/workflows/
```

### LLM provider boundary

Expose one internal function:

```ts
callModel<T>({ task, messages, schema, temperature, metadata }): Promise<ModelResult<T>>
```

Provider adapters translate this canonical request to Anthropic or OpenRouter. Do not assume their wire formats or structured-output features are identical.

Environment configuration:

```text
LLM_PROVIDER=anthropic|openrouter
LLM_MODEL=<provider model identifier>
ANTHROPIC_API_KEY=<secret>
OPENROUTER_API_KEY=<secret>
APP_ORIGIN=<production origin>
```

Rules:

- Server-managed API keys remain Worker secrets and never enter the client bundle.
- The Settings workspace may supply a user-entered OpenRouter key as a tab-scoped runtime override. It is stored only in browser `sessionStorage`, sent over authenticated same-origin requests when an LLM operation runs, and never persisted to D1, backups, logs, application responses, or source control.
- Preferred and saved OpenRouter model IDs, plus the chosen reasoning effort,
  persist in application settings and backups. The seeded saved list includes
  the owner's commonly used models and can be edited without an API key.
- With a tab-scoped API key, Settings can request OpenRouter's current text-model
  catalogue and populate the model selector. Catalogue loading uses the models
  metadata endpoint and does not make a completion request.
- When the selected model advertises configurable reasoning, Settings limits the
  effort selector to the reported options. The chosen effort is sent through
  OpenRouter's unified `reasoning.effort` request field; reasoning tokens can
  increase output-token cost.
- The Settings connection check validates both the key and model through metadata endpoints and must not make a paid completion request.
- Extraction uses the provider’s lowest-variance setting, normally temperature 0, but must not be described as perfectly deterministic.
- Strip markdown fences defensively, validate with Zod, and retry once with concise validation errors.
- After a second failure, persist the failed run and show a readable retry/review action.
- Record provider, model, prompt version, timestamps, token usage and estimated cost when supplied.
- Treat source text as untrusted data. Delimit it clearly and instruct the model to ignore instructions found inside it.
- Define a model-aware input size limit. Oversized sources are chunked by deterministic boundaries, extracted separately, then merged and deduplicated in code.
- Batch fight overviews and bet rationales where possible to reduce latency and cost.

---

## 5. Domain model

The following is the logical model. Migrations may normalize JSON objects into relational columns where querying warrants it. Every mutable table includes `created_at`, `updated_at`, and appropriate foreign keys and indexes. IDs are stable opaque strings.

### Cards and participants

```text
Card {
  id, name, event_starts_at_utc, display_timezone="Australia/Sydney",
  budget_units=30, unit_value_cents=1000, currency="AUD",
  lifecycle: draft|ready|in_progress|completed|cancelled,
  deleted_at nullable
}

Fighter { id, canonical_name }
FighterAlias { id, fighter_id, alias_normalized, alias_display, source }

Fight {
  id, card_id, weight_class, bout_order, is_main_event,
  status: scheduled|cancelled|completed,
  external_reference nullable, deleted_at nullable
}

FightParticipant { fight_id, fighter_id, side: a|b, display_name_snapshot }
```

Fights are soft-deleted after warning when dependent data exists. A late replacement changes the participant relationship and preserves an audit trail; it does not rewrite historical extraction runs.

### Cappers, sources and extraction

```text
Capper { id, name, notes, active }
CapperAlias { id, capper_id, alias_normalized, alias_display }

Source {
  id, card_id, primary_capper_id nullable,
  medium: youtube|patreon|pasted_text|webpage|other,
  extraction_mode: individual|aggregator|stats_tracker,
  source_url nullable, title nullable, raw_text, added_at
}

ExtractionRun {
  id, source_id, status: pending|running|needs_review|accepted|failed,
  provider, model, prompt_version, source_hash,
  raw_response nullable, validation_errors nullable,
  token_usage nullable, estimated_cost nullable, completed_at nullable
}
```

`source_hash + prompt_version + model` supports idempotency and warns when an identical source has already been parsed. Re-parsing creates a new run. Accepting a run makes it the active extraction for that source; prior runs remain auditable.

### Opinions, explicit tips and stats

```text
FightOpinion {
  id, extraction_run_id, source_id, card_id, fight_id, capper_id,
  picked_fighter_id,
  method: ko_tko|submission|decision|null,
  round: 1|2|3|4|5|distance|null,
  confidence: lean|solid|lock,
  reasoning_summary, provenance: direct|aggregated,
  review_status: accepted|corrected|rejected
}

CapperTip {
  id, opinion_id nullable, extraction_run_id, source_id,
  card_id, fight_id nullable, capper_id,
  market_type: moneyline|method|round|round_and_method|over_under|prop|parlay|other,
  selection_fighter_id nullable, method nullable, round nullable,
  line_value nullable, selection_text,
  odds_mentioned_raw nullable, odds_mentioned_decimal nullable,
  stated_stake_units nullable, confidence: lean|solid|lock,
  reasoning_summary, provenance: direct|aggregated,
  review_status: accepted|corrected|rejected
}

FightStats {
  id, extraction_run_id, fight_id, source_id,
  all_channels, best_overall, best_favourite, best_underdog,
  mov_counts, best_mov, bookmaker_note
}
```

An aggregator credits each opinion/tip to the named original capper, never the host. Attribution is matched through `CapperAlias`; uncertain identities require review. Direct evidence takes precedence over the same capper’s aggregated evidence for the same fight and market. A distinct capper contributes at most one active winner opinion per fight.

### Prices and synthesis

```text
MarketPrice {
  id, card_id, fight_id nullable, bookmaker nullable,
  market_type, selection_fighter_id nullable, method nullable,
  round nullable, line_value nullable, selection_text,
  decimal_odds, captured_at, source: manual|api
}

SynthesisRun {
  id, card_id, status: pending|running|draft|accepted|failed|superseded,
  config_snapshot, input_snapshot_hash, prompt_versions,
  started_at, completed_at nullable
}

FightSummary {
  id, synthesis_run_id, fight_id,
  consensus_fighter_id, weighted_share, raw_support_count, eligible_voter_count,
  consensus_method nullable, method_support_count,
  consensus_round nullable, round_support_count,
  overview_text, badges
}
```

Synthesis snapshots the accepted extraction runs, prices and tunable configuration. A later re-synthesis creates a new draft. Accepting it supersedes the prior recommendation view but never edits ledger bets created from an earlier run.

### Ledger and outcomes

```text
Bet {
  id, card_id, synthesis_run_id nullable,
  origin: synthesised|manual,
  tier: core|value|parlay|manual,
  market_type, selection_text,
  recommended_units nullable, recommended_odds nullable,
  consensus_share nullable, rationale nullable,
  state: recommended|skipped|placed|settled,
  odds_taken nullable, settlement_odds nullable,
  stake_units nullable,
  result: pending|won|lost|push|void,
  net_profit_units nullable, settled_at nullable, notes nullable
}

BetLeg {
  id, bet_id, fight_id, market_type,
  selection_fighter_id nullable, method nullable,
  round nullable, line_value nullable, selection_text,
  leg_result: pending|won|lost|push|void
}

BetSupport { bet_id, capper_id, opinion_id nullable, capper_tip_id nullable }

FightOutcome {
  fight_id,
  status: pending|winner|draw|no_contest|overturned|cancelled,
  winner_fighter_id nullable,
  method: ko_tko|submission|decision|disqualification|other|null,
  round: 1|2|3|4|5|null,
  recorded_at nullable
}
```

Settled bets are locked. An explicit “Unsettle” action records an audit event before allowing correction. Manual and synthesised bets share the ledger but remain separate performance buckets.

### Derived capper statistics

```text
CapperStat {
  capper_id,
  winner_calls_graded, winner_hit_rate,
  method_calls_graded, method_hit_rate,
  round_calls_graded, round_hit_rate,
  priced_tips_graded, tip_roi_at_stated_odds nullable,
  current_weight
}
```

Do not calculate capper ROI for unpriced forecasts. Accuracy and ROI are distinct metrics.

---

## 6. Deterministic calculation contracts

All functions in this section live in pure modules and are unit-tested.

### 6.1 Odds conversion

Accept decimal and American input; store validated decimal odds at fixed precision.

```text
American positive: decimal = 1 + american / 100
American negative: decimal = 1 + 100 / abs(american)
```

Examples:

```text
-140 → 1.7143
+120 → 2.2000
```

Reject impossible or ambiguous values. The LLM returns mentioned odds as raw text; code detects and converts the format. Define one display precision and one higher internal precision.

### 6.2 Winner consensus

Phase 1 capper weights are `1.0`.

```text
confidence_multiplier:
  lean  = 0.5
  solid = 1.0
  lock  = 1.5

vote_strength = capper_weight × confidence_multiplier

consensus_share(fighter) =
  sum(vote_strength for fighter) /
  sum(vote_strength for both fighters)
```

Properties:

- Shares are in `[0, 1]` and both sides sum to 1, subject only to decimal precision.
- Support counts are counts of distinct cappers, not rows or sources.
- Repeated mentions from one capper do not create extra votes.
- An accepted direct opinion overrides matching aggregated evidence from that capper.
- Rejected or unreviewed extractions are excluded.
- Fights with no eligible opinions have no consensus.
- Ties are represented as ties and are not resolved by arbitrary ordering.

### 6.3 Method and round consensus

- Method consensus is calculated among accepted opinions that back the displayed consensus fighter and specify a method.
- Round consensus is calculated among accepted opinions that back the displayed consensus fighter and specify a round/distance.
- Support always displays both numerator and eligible denominator.
- `few calls` displays when fewer than three eligible method or round calls exist.
- Stats-tracker MOV data is displayed separately; it does not become an individual capper vote.

### 6.4 Badges

- `UNANIMOUS`: at least two eligible distinct cappers and all back the same fighter.
- `SPLIT`: at least four eligible distinct cappers, both fighters have support, and the leader has no more than 60% of raw distinct-capper votes.
- `CROWD_VS_SHARPS`: the stats tracker’s all-channel majority and best-overall majority are on opposing fighters, both with known totals and neither tied.
- Small samples are displayed explicitly and never receive `UNANIMOUS` from a single vote.

### 6.5 Slate eligibility

A bet requires a current `MarketPrice`. Transcript-mentioned prices cannot qualify a bet unless the owner explicitly promotes them to the Odds Board after review.

MVP tiers:

- **Core moneyline:** consensus share at least `0.60`, at least three distinct supporting cappers, and current decimal odds at most `2.20`. Recommend `2u`, or `3u` when share is at least `0.80`.
- **Value/dog:** current decimal odds above `2.20`, and at least two distinct cappers explicitly support the same market at `solid` or `lock`. Recommend `1u`.
- **Parlay:** at most one per card, at most `1u`, at most three legs, and every leg must be a Core moneyline. Skip if fewer than three Core plays exist.
- **Per-bet cap:** no generated bet may exceed `4u`.

The recommended parlay price is the deterministic product of its current leg prices. The actual combined bookmaker price is recorded separately when the bet is placed.

Tier thresholds, multipliers and stakes live in one typed configuration file and are snapshotted into every synthesis run.

### 6.6 Allocation algorithm

The algorithm is deterministic:

1. Build one candidate per exact market and selection using accepted inputs and current prices.
2. Remove ineligible candidates.
3. Resolve opposing moneyline candidates on the same fight: keep the higher consensus share; on an exact tie, keep neither and record the reason.
4. Assign the tier’s initial stake.
5. Enforce the per-bet cap.
6. Sort Core candidates by share, support count, then stable ID; sort Value candidates by explicit support strength, then stable ID.
7. Add qualified candidates while total recommended units remain within the card budget.
8. If over budget, trim the lowest-ranked candidates first; never reduce below a tier’s minimum stake merely to force inclusion.
9. Add the optional parlay only if qualified and budget remains.
10. Stop. Never top up stakes merely to spend the budget.

The desired 70% Core / 20% Value / at-most-1u parlay shape is a soft portfolio target used for ordering and reporting, not a command to manufacture bets or increase stakes. The UI explains under-spend.

Generated recommendations can never exceed the budget. Manual bets do not rewrite the synthesised slate; they contribute to actual exposure. If placed plus proposed manual exposure exceeds the card budget, show a prominent warning and require confirmation rather than silently blocking owner-entered reality.

### 6.7 Settlement maths

For a single bet with stake `s` and settlement decimal odds `o`:

```text
won  → net profit = s × (o − 1); gross return = s × o
lost → net profit = −s;          gross return = 0
push → net profit = 0;           gross return = s
void → net profit = 0;           gross return = s
```

`settlement_odds` defaults to `odds_taken`. When a bookmaker voids one parlay leg and recalculates the combined price, the owner records the bookmaker’s adjusted settlement odds. A fully void parlay returns zero profit. The bet-level bookmaker result is authoritative.

```text
card ROI = total net profit / total settled stake
```

Pending, skipped and unplaced bets are excluded. Display units and AUD using the card’s snapshotted unit value.

### 6.8 Capper grading

- Winner accuracy grades only accepted opinions with a resolvable winner outcome.
- Method accuracy requires both the correct winner and method.
- Round accuracy requires the correct winner and exact round; `distance` is correct only when the fight completes its scheduled final round by decision.
- Missing method/round calls are excluded from those denominators.
- Draw, no contest, cancelled and unresolved outcomes are excluded.
- ROI uses only explicit priced tips and a documented flat-stake assumption unless a stated stake is present.
- Phase 2 weights use only information available before the evaluated card to prevent look-ahead bias.

### 6.9 CLV definition for Phase 2

For a selection with taken decimal odds `t` and closing decimal odds `c`, display both:

```text
odds-ratio CLV = (t / c) − 1
implied-probability movement = (1 / c) − (1 / t)
```

Positive values mean the taken price beat the close. Record bookmaker, market, timestamp and closing-source provenance.

---

## 7. Lifecycle and mutation rules

### Source parsing

1. Saving raw source text creates or updates the Source.
2. Parse creates an `ExtractionRun`.
3. Validated output appears in review, including unmatched fighters and uncertain capper attribution.
4. Corrections are applied to the run’s candidate records.
5. Accepting the run atomically makes it active for its Source.
6. A later parse creates another run and does not delete the accepted history.

### Synthesis

1. Synthesis requires a reviewed card, at least one accepted extraction, and prices for bets that may enter the slate.
2. A run snapshots all accepted inputs and configuration.
3. Deterministic calculations complete before any overview/rationale generation.
4. If language generation fails, the numerical Fight Board and slate remain usable with a readable “summary unavailable” state.
5. The result begins as a draft.
6. Accepting the draft makes it the current recommendation view.
7. Re-synthesis never edits existing ledger bets. The UI offers to copy unplaced recommendations from the new run.

### Bet state

```text
recommended → skipped
recommended → placed → settled
settled → explicitly unsettled → placed
manual draft → placed → settled
```

Odds and stake remain editable while placed but unsettled. Settlement locks them. Every unsettle action is logged.

### Card state

Card lifecycle is independent from extraction and synthesis status. A completed card may still receive settlement corrections. Cancelled fights remain visible for audit and settlement.

---

## 8. Weekly user workflow

1. **Configure.** In Settings, record the current bankroll, default unit size, and tab-scoped OpenRouter connection.
2. **Create card (Wednesday/Thursday).** Paste an official UFC event URL or create manually. Review the fetched bout list, event time, and any displayed page odds. Importing page odds requires an explicit confirmation.
3. **Add sources.** Select/create a capper, choose source medium and extraction mode, then paste one source or upload a transcript CSV. Multipart rows sharing a video ID are validated, ordered, and combined before parsing.
4. **Review extraction.** Correct fighter mappings, predictor attribution, markets and confidence. Accept the extraction run.
5. **Confirm prices.** On the Odds Board, review imported page prices and enter the current bookmaker prices for moneylines and supported props under consideration.
6. **Synthesise.** OpenRouter extracts/summarises the reviewed language while deterministic code computes consensus, eligibility and stakes for a versioned Fight Board and draft slate.
7. **Read.** Review consensus, crowd-versus-sharps signals, method/round support, dissent and rationales.
8. **Place manually.** Use the ledger as a checklist: mark recommendations placed or skipped, record actual odds/stake, and add manual singles or parlays.
9. **Settle Sunday.** Record fight outcomes and the bookmaker result for every placed bet.
10. **Review bankroll.** See the manually maintained current balance alongside cumulative P/L, card ROI, performance splits, capper accuracy and manual-versus-system results.

The primary card, odds and settlement workflows must be comfortable on a phone-sized screen.

---

## 9. Functional requirements

### 9.1 Card and participant management

- CRUD for Cards and Cappers.
- Card deletion requires an explicit inline confirmation and is implemented as an audited soft delete so related history is preserved.
- Create a card manually or fetch by UFC.com URL, with a separately implemented fallback adapter if legally and technically viable.
- Fetch order: deterministic UFC bout markup/structured page data → JSON-LD → stripped page text plus LLM → manual entry.
- Auto-suggesting the next event is optional until a stable discovery source is proven.
- The fetched result is always a preview diff, never an automatic overwrite.
- When the page explicitly displays fighter moneyline odds, preserve them as raw text in the preview. The LLM does not convert them.
- The preview reports how many bouts have both displayed page prices and warns
  when coverage is incomplete; missing odds remain missing and are never
  inferred.
- Importing UFC-page odds to the Odds Board is an explicit user choice and records `UFC event page` provenance. Unconfirmed page odds cannot qualify a bet.
- Add, replace, rename, reorder, cancel or soft-delete fights.
- Re-fetch merges by participant IDs/aliases and flags additions, removals, replacements and order changes.
- No fuzzy match may overwrite reviewed manual data.

### 9.2 Source management and extraction

- Text area handles at least 20,000 characters and displays the model-aware input limit.
- Transcript CSV import groups rows by `video_id`, validates complete and unique `part_number` values against `part_count`, and concatenates the ordered parts without altering their text.
- CSV import previews one source per video, permits an extraction-mode choice for each source, creates missing individual cappers from `channel_name`, and does not automatically parse or accept imported evidence.
- Source medium and extraction mode are separate fields.
- Parse status, retries, errors and estimated model cost are visible.
- Review tables allow correction, rejection and unmatched resolution.
- Unmatched fighter/capper aliases can be linked to an existing entity or used to create a reviewed new entity.
- Re-parsing is idempotent and versioned.
- Aggregated picks retain original and host provenance, but only the named original capper receives voting credit.
- Stats-tracker data remains aggregate and never generates artificial individual cappers.

### 9.3 Odds Board

- Add/edit/delete current market prices.
- Accept American or decimal input and show the normalized decimal price.
- Capture market, selection, line, bookmaker and timestamp.
- Highlight stale prices based on a configurable threshold.
- Synthesis identifies consensus candidates that are missing a qualifying current price.

### 9.4 Fight Board

Render one card per fight in bout order:

```text
{Fighter A} vs {Fighter B}                         [{order} / MAIN EVENT]
PICK    {consensus fighter} · {raw support} · {weighted share}
        {all-channels % when available} · {best-predictors % when available}
        [SPLIT | CROWD VS SHARPS | UNANIMOUS] · dissenters on expand
METHOD  {method} ({support/eligible}) · best MOV tracker summary
ROUND   {round/distance} ({support/eligible}) or “few/no round calls”
WHY     {maximum three sentences}
```

Requirements:

- All percentages label their source and denominator.
- Missing tracker data is absent, not rendered as zero.
- Crowd-versus-sharps disagreement is visually prominent.
- Dissent lists capper, confidence and concise reasoning.
- Numerical content works even when LLM overview generation fails.

### 9.5 Slate and ledger

- Slate row: selection, market, units, recommendation price, weighted share, tier, rationale and supporting cappers.
- Place, skip and add-manual-bet actions.
- Bulk manual-bet CSV import uses the fixed columns
  `fight,selection,market,odds,stake_units,notes`, validates every row against
  the selected card before import, and supports exact-name fighter markets plus
  explicit fight-wide props.
- The ledger provides a downloadable selected-card CSV template and a copyable
  screenshot-extraction prompt that tells an external AI not to invent missing
  fights, markets, odds, or stakes.
- Structured parlay builder with up to any manually entered number of legs; generated parlays remain capped at three.
- Editable actual odds and stake before settlement.
- Recommended exposure, placed exposure and budget are distinct totals.
- Manual over-budget exposure triggers a confirmation warning.
- Settled bets lock and require explicit unsettle.

### 9.6 Settlement and bankroll

- Record winner/draw/no-contest/cancelled/overturned outcomes, method and round.
- Record bookmaker settlement per placed bet.
- Running cumulative P/L in units and AUD, filterable by date.
- Per-card stake, gross return, net and ROI.
- Splits by tier, market type, origin and capper support.
- Capper winner/method/round records with clear denominators.
- Never infer settlement from a fight outcome when market rules could differ without showing the proposed result for confirmation.

### 9.7 Operational UX

- Explicit loading, empty, success, needs-review and error states.
- Contextual help icons explain each workspace and major workflow section on hover, keyboard focus, or touch focus.
- Light and dark themes carry the sidebar's charcoal-and-lime visual language through cards, controls, forms, tables, and status states.
- The desktop sidebar can collapse to an accessible icon rail; theme and collapse preferences persist on that device, while the mobile drawer remains fully labelled.
- A dedicated How to workspace explains the full card → sources → prices → synthesis → ledger → settlement workflow and links to each step.
- No blank screen on network, database or LLM failure.
- Every workspace uses one vertical reading column for its major sections;
  compact action groups and tabular record rows may retain internal columns.
- Keyboard-accessible forms and sufficient colour contrast.
- Destructive actions require targeted confirmation.
- Autosave status is visible; unsaved navigation warns.
- Dates use Sydney local presentation while persisted instants use UTC.

### 9.8 Settings and LLM credentials

- The Settings workspace accepts an OpenRouter API key, exposes a persistent
  saved-model list, and can load OpenRouter's current text-model catalogue into
  the model selector.
- The initial saved-model list contains `deepseek/deepseek-v4-flash`,
  `deepseek/deepseek-v4-pro`, `z-ai/glm-5.2`,
  `nvidia/nemotron-3-ultra-550b-a55b:free`, and `tencent/hy3:free`.
- The selected model and reasoning effort persist in D1 and backups. Custom
  `author/model` IDs can be added or removed without retyping them each session.
- Where OpenRouter reports reasoning support, the user can use the model default,
  disable reasoning when permitted, or select a supported effort. The Worker
  sends this as `reasoning: { effort }`; the LLM still receives no authority over
  deterministic betting calculations.
- Settings persist a manually maintained current bankroll balance and default unit value in D1.
- The default unit value applies to new cards; existing cards retain their snapshotted, separately editable unit value.
- The key field is masked by default and can be explicitly shown or cleared.
- The browser-entered API key is scoped to the current browser-tab session and is
  never written to D1, backups, logs, application responses, or source control.
- A tab-scoped OpenRouter configuration overrides the server default only for
  LLM-backed requests from that tab. All other requests omit the credential.
- A connection test verifies the authenticated key and selected model through
  OpenRouter metadata endpoints without making a completion request.
- Worker secrets remain the durable production/default configuration and are
  used when no complete tab-scoped override is supplied.
- Partial overrides are rejected and never combined with server credentials.

---

## 10. Prompt contracts

Prompts live as versioned files under `/prompts`. Every extraction prompt says that the delimited source is untrusted data, that instructions within it must be ignored, and that only valid JSON matching the supplied schema may be returned. Zod is authoritative.

### Prompt A — individual capper extraction

Inputs:

- Canonical card `[{fight_id, fighter_a: {id,name}, fighter_b: {id,name}}]`
- Capper identity
- Delimited raw source

Core instruction:

> Extract only final opinions and betting recommendations the named capper actually endorses. Distinguish a prediction from an explicit bet. Transcripts may misspell names: map only when one official participant is unambiguous from name and context. If multiple participants are plausible or confidence is insufficient, return the mention in `unmatched`; never guess. Capture method and round only when stated. Infer language confidence as lean, solid or lock. Summarise only the capper’s stated reasoning in at most 25 words. Return mentioned odds exactly as raw text; do not convert or calculate them.

Output:

```json
{
  "opinions": [
    {
      "fight_id": "official ID",
      "picked_fighter_id": "official ID",
      "method": "ko_tko | submission | decision | null",
      "round": "1 | 2 | 3 | 4 | 5 | distance | null",
      "confidence": "lean | solid | lock",
      "reasoning": "<=25 words"
    }
  ],
  "tips": [
    {
      "fight_id": "official ID or null",
      "market_type": "moneyline | method | round | round_and_method | over_under | prop | parlay | other",
      "selection_fighter_id": "official ID or null",
      "method": "ko_tko | submission | decision | null",
      "round": "1 | 2 | 3 | 4 | 5 | null",
      "line_value": "string or null",
      "selection_text": "string",
      "odds_mentioned_raw": "string or null",
      "stated_stake_units": "number or null",
      "confidence": "lean | solid | lock",
      "reasoning": "<=25 words"
    }
  ],
  "fights_not_covered": ["fight_id"],
  "unmatched": [
    {
      "raw_name": "string",
      "context": "short string",
      "candidate_fight_ids": ["string"]
    }
  ]
}
```

Code verifies every returned ID, converts odds, enforces lengths and removes duplicate mentions.

### Prompt A2 — aggregator extraction

Uses Prompt A’s schema, with `attributed_to_raw` on every opinion/tip.

Core addition:

> Attribute each item to the original predictor explicitly named by the host. Do not assign relayed picks to the host. If the original predictor is unclear, return the item in `unmatched_attribution`.

Capper matching and auto-creation occur only through the review workflow.

### Prompt B — stats-tracker extraction

Inputs: canonical card and delimited stats text.

Core instruction:

> Copy only statistics explicitly stated in the source. Missing values are null. Do not deduce complements, totals, percentages or other values. Preserve the source labels needed to identify fighter A and fighter B. Never convert odds or perform arithmetic.

Output contains one object per matched fight with nullable `all_channels`, `best_overall`, `best_favourite`, `best_underdog`, `mov_counts`, `best_mov` and `bookmaker_note`, plus `unmatched`.

Deterministic code may compute a missing complement only when the necessary stated values and invariant are present, and the derived value is marked as derived rather than source-stated.

### Prompt C — fight overview synthesis

Batch input per synthesis run:

- Code-computed winner/method/round results and support
- Accepted supporting and dissenting reasoning summaries
- Available tracker statistics

Core instruction:

> For each fight, write no more than three sentences using only the supplied evidence. Sentence 1 explains why the consensus fighter is favoured. Sentence 2 explains method and round only when supported. Sentence 3 gives the strongest dissent when present. Do not add outside fight knowledge, unsupported claims, betting advice or invented odds.

Output:

```json
{ "overviews": [{ "fight_id": "string", "overview": "string" }] }
```

Code validates sentence count and retries; it does not blindly truncate mid-thought. A deterministic evidence-only fallback is allowed.

### Prompt D — slate rationale synthesis

Batch input includes exact bet markets, supporting tips/opinions and capper names.

Core instruction:

> Explain each play in one or two sentences using only supplied supporting evidence. Name the supporting cappers. Do not claim certainty, add outside analysis or change the stake.

Output:

```json
{ "rationales": [{ "bet_candidate_id": "string", "rationale": "string" }] }
```

### Prompt E — card page parsing

Input: canonical URL metadata and stripped event-page content after structured-data parsing has been attempted.

Core instruction:

> Extract only bouts explicitly present in this event-page content. Do not add fighters from outside knowledge. Preserve page ordering when known. Copy each fighter's displayed moneyline odds exactly as raw text; do not convert or calculate them. If odds, order or main-event status are not stated, use null rather than guessing.

Output:

```json
{
  "event_name": "string or null",
  "event_starts_at_raw": "string or null",
  "bouts": [
    {
      "fighter_a": "string",
      "fighter_b": "string",
      "fighter_a_odds_raw": "string or null",
      "fighter_b_odds_raw": "string or null",
      "weight_class": "string or null",
      "bout_order": "number or null",
      "is_main_event": "boolean or null"
    }
  ]
}
```

---

## 11. Phase 2 and Phase 3

### Phase 2 — automation and evidence weighting

1. **YouTube captions:** paste a URL, fetch captions through a Worker-compatible HTTP approach, and fall back to manual paste. Run a compatibility spike before choosing a package; do not assume a Node package works in Workers.
2. **Capper weights:** activate only after at least 15 eligible historical winner calls. Use a documented, bounded formula and compute each card using only prior-card history. Show every component and clamp the result to `[0.3, 2.0]`.
3. **Odds and CLV:** integrate an approved odds provider for supported MMA markets. Snapshot opening/current/closing prices with source and timestamp. Manual prices remain available.
4. **Cost and quality reporting:** extraction success rate, correction rate, tokens, cost and model version by prompt.

### Phase 3 — polish

- Calibration chart: consensus-share buckets versus actual winner rate.
- CSV export and shareable slate image.
- Prompt-tuning UI with version creation and rollback, never in-place production edits.
- Multiple events in the same weekend.
- Optional installable/PWA shell if mobile usage justifies it.

---

## 12. CI/CD, environments and maintenance

Implementation checkpoint: local and production build automation exists.
Production/preview Cloudflare environments have not been provisioned or proven.
The workflow must be hardened as noted below before deployment is enabled.

### Environments

- **Local:** Wrangler local D1 and local-only dependency/cache directories where configurable.
- **Preview:** preview Worker, preview secrets and a separate preview D1 database. Never bind production D1 to PR code.
- **Production:** production Worker, production D1 and production secrets.

Cloudflare preview URLs are public by default; protect previews with Cloudflare Access. Do not place real transcripts, production data or production API keys into an unprotected preview.

### Required CI on every push and pull request

1. Install from the committed lockfile.
2. Typecheck.
3. Lint and format-check.
4. Run unit and integration tests against local D1.
5. Run the critical Playwright path against a local test build.
6. Build Worker and client.
7. Scan committed content for secrets.

No required CI test calls a live LLM, UFC page or odds API. Use recorded fixtures and provider mocks. Optional live contract smoke tests run manually or on a non-blocking schedule with strict spending limits.

Current workflow status: installation, typecheck, lint, formatting, automated
tests, Playwright, and the production build are wired. The remote pre-migration
export runs in the credentialed deploy job immediately before migrations, so
ordinary pushes and pull requests do not require production credentials. The
committed-secret scan is not yet wired. An isolated preview deployment job also
remains to be added and verified.

### CD on `main`

The normal deployment path is zero-touch after Git push: GitHub receives the commit, the workflow runs CI, and a green `main` deploys to Cloudflare automatically. No routine Cloudflare dashboard action, server maintenance, manual wake-up or local `wrangler deploy` command is permitted.

The deployment job runs only after CI passes:

1. Take a pre-migration Time Travel bookmark and/or export for material migrations.
2. Apply production D1 migrations.
3. Deploy the Worker and static assets.
4. Call public `/health` and an authenticated synthetic data route.
5. Fail loudly and preserve logs on any error.

The guarded production job implements migrations, deployment, and both smoke
requests, but it has not run against the owner's Cloudflare account. Keep
`CLOUDFLARE_DEPLOY_ENABLED` unset until the release checklist in
`docs/cloudflare-setup.md` is complete.

Database changes follow expand/contract migration discipline:

- Add backwards-compatible schema first.
- Deploy code that can handle old and new forms.
- Backfill if necessary.
- Remove obsolete schema only in a later release.

Worker rollback does not reverse a D1 migration. Every destructive migration needs an explicit restore/forward-fix plan.

### Secrets

- Deployment credentials live in GitHub Actions secrets.
- Runtime secrets live in Cloudflare secrets/configuration.
- Local secrets use ignored local files.
- No secret may appear in code, fixtures, logs, screenshots or repository history.

### Backups

- D1 Time Travel is always on, with the retention supplied by the active plan.
- The authenticated “Download backup” action exports relational data in a versioned JSON format without exposing Cloudflare management credentials.
- Restore is implemented for a freshly migrated database and refuses to overwrite application data; an isolated local restore rehearsal passes.
- A production pre-migration `wrangler d1 export` is retained as a protected workflow artifact, taken in the credentialed deploy job immediately before migrations.
- Rehearse restore against a non-production Cloudflare D1 database before declaring production backups complete.
- Warn that a full D1 export can briefly block database requests; acceptable for this single-user workload when surfaced.

### Agent maintenance contract

The root `AGENTS.md` must instruct coding agents to:

- Read this README first.
- Install dependencies only inside the project.
- Never change allocation, odds or settlement maths without tests.
- Never write secrets to the repository.
- Preserve versioned prompts and migrations.
- Run the full relevant suite before committing.
- Prefer small focused commits.
- Use PR previews for risky UI or migration changes.

The pipeline remains agent-agnostic.

---

## 13. Test strategy

This section remains the required coverage contract. Current execution results,
test counts, and remaining coverage are maintained only in
`docs/implementation-status.md`. The suite covers core maths, model response
validation/retry, card-fetch restrictions, an isolated-D1 synthesis/grade
transaction, backup/restore, and the manual parlay/settlement/bankroll flow.

### Unit tests — crown jewels

- American/decimal odds conversion, validation and rounding.
- Vote normalization and scores summing to one.
- Confidence and future capper weights.
- Direct-over-aggregated deduplication.
- One distinct capper vote per fight.
- Ties and small samples.
- Method/round conditional denominators.
- Every badge boundary.
- Tier eligibility at values immediately below, equal to and above thresholds.
- Stable ordering under shuffled inputs.
- Budget hard cap, per-bet cap, conflict rule, one-parlay rule and no-force-spend.
- Property tests asserting no budget overflow and no opposing generated bets.
- Single and parlay settlement, adjusted void-leg odds, push and void.
- ROI and capper grading denominators.
- CLV formulas.

### Integration tests

- D1 migrations from empty and previous schema versions.
- Foreign keys and soft deletion.
- Source parse → review → accept lifecycle.
- Re-parsing without duplicate active votes.
- Re-synthesis without mutating placed bets.
- Fighter rename and late replacement after extraction.
- Capper alias and ambiguous attribution review.
- Authentication/Access headers at the application boundary.
- Every mutation’s authorization and validation.
- Backup export and restore into a clean local database.

### LLM contract fixtures

Maintain realistic, de-identified fixtures covering:

- At least four messy transcripts.
- Mangled fighter names such as multiple plausible phonetic spellings.
- Hypotheticals, hedges and a final pick that changes late in the source.
- A forecast with “no bet at this price.”
- Multiple tips for one fight.
- An aggregator relaying named predictors.
- A stats tracker with missing fields and numbers whose complements are not stated.
- Prompt-injection-like text inside a transcript.
- Invalid JSON and schema violations.

Expected fixtures test schema handling and deterministic merging. Live-model output is not assumed stable enough for blocking CI.

### Required end-to-end release path

The release-gate Playwright journey must cover:

> authenticate → create card → edit fights → add and accept source → resolve unmatched name → enter odds → synthesise → inspect Fight Board → place generated bet → add manual/parlay bet → settle → verify bankroll

The current Playwright checks cover persistent light/dark, sidebar and layout
preferences; phone-width overflow; card/fight editing; fighter/capper aliases;
source create/edit; duplicate handling; odds add/hide; outcomes; manual and
structured parlay placement; settlement correction; bankroll reconciliation;
and backup download. Live source parsing/review, generated synthesis, and
generated-bet placement remain to be added before the release gate passes.

### Operational tests

- Deployed CPU profile for login/access handling, 20k+ character source validation and fuzzy matching.
- Preview isolation from production D1.
- Public `/health` contains no private information.
- Failed model/API/database calls produce readable recovery UI.
- Responsive checks at common phone and desktop widths.
- Keyboard navigation and basic accessibility scan.

---

## 14. MVP acceptance criteria

Status: the product behavior below is implemented, but the acceptance suite is
not yet complete and production-only criteria have not been exercised. Treat
this list as the release gate, not as a claim that every bullet already passed.
The authoritative completed/remaining split is maintained in
`docs/implementation-status.md`.

### Card management

- Saved cards are presented as a single vertical accordion. Opening a card
  reveals its complete saved bout list directly beneath that card, while UFC
  import/merge, blank-card creation, and manual card maintenance live together
  in one setup section below the list.
- A current event page can produce a reviewable bout list through structured parsing or LLM fallback.
- Saved page fixtures reproduce deterministic merge behavior in CI.
- A fighter can be renamed, a replacement recorded, and a fight reordered/cancelled/soft-deleted without corrupting accepted extraction history.

### Extraction

- Four realistic transcript fixtures produce validated opinions and tips.
- Ambiguous fighter names enter review rather than being silently guessed.
- Aggregated evidence credits original cappers and does not double-count matching direct evidence.
- Re-running the same source never creates duplicate active votes.
- Stats extraction leaves absent values null and performs no LLM arithmetic.
- Validation/model failures remain visible and retryable.

### Synthesis

- Every weighted share is within `[0,1]`; supported two-sided shares sum to one.
- Slate respects the budget, per-bet cap, tier rules, single generated parlay and no-opposing-sides rule.
- A thin card under-spends with an explanation.
- A missing current price prevents bet qualification without hiding the consensus candidate.
- Re-synthesis does not change an already placed bet.

### Fight Board

- Every scheduled fight renders the fixed contract.
- Support counts and denominators are visible.
- Crowd-versus-sharps disagreement shows both source percentages.
- Overviews use at most three sentences and fail independently from numerical synthesis.

### Ledger and settlement

- Generated, manual and parlay bets can be placed with actual odds/stakes.
- A selected-card CSV template can be downloaded and a valid multi-bet CSV can
  be previewed and imported with exact fight/fighter matching and no inferred values.
- Recommended and actual exposure are displayed separately.
- Manual over-budget exposure produces a confirmation warning.
- Draw, no-contest, cancelled and overturned outcomes are representable.
- Win/loss/push/void and adjusted parlay settlement maths are correct.
- Settled bets lock and can be explicitly unsettled with audit history.

### Bankroll and grading

- Cumulative units/AUD, gross return, net and card ROI match deterministic test fixtures.
- Manual bets appear in a separate performance bucket.
- Winner, method and round accuracy use documented independent denominators.
- Unpriced opinions never receive a fictional ROI.

### Security and operations

- Production and preview data routes require the owner’s Cloudflare Access identity.
- `/health` is public, minimal and returns 200 after deployment.
- Preview uses a separate D1 database and is Access-protected.
- No API key or secret appears in the client bundle or repository scan.
- A red CI suite blocks deployment.
- Migrations, deployment and smoke checks complete from GitHub Actions.
- A backup can be exported and restored successfully.
- Normal idle infrastructure cost is $0, excluding stated external costs.
- The host does not suspend, archive, delete or require manual reactivation of the application or database solely because of inactivity.
- A first request after an idle period starts automatically and can read previously persisted data without an owner action.
- Hosting, static assets and database remain free at expected usage; any paid fallback is at most $3 USD/month and is never enabled without owner approval.
- Pushing a green change to `main` deploys it automatically without a dashboard login, server administration, manual wake-up or local deployment command.

---

## 15. Tunable configuration

Keep owner-tunable values in one typed configuration module and snapshot them per synthesis:

- Default budget and unit value.
- Confidence multipliers.
- Core/value thresholds and stakes.
- Per-bet and parlay caps.
- Badge thresholds and minimum samples.
- Price staleness threshold.
- Phase 2 capper-weight formula and bounds.

Changing a value requires updated boundary tests. Historical synthesis runs continue to display the configuration they used.

---

## 16. Final implementation notes

- Name canonicalisation is a core workflow, not an edge case. Real transcripts can render one fighter as several phonetic spellings.
- Stats trackers and individual cappers remain separate in storage and are joined only in read models.
- Do not infer that a winner prediction is a recommended bet.
- Do not infer that a mentioned price is currently available.
- Do not allow one capper to gain extra influence merely because multiple sources repeat their pick.
- Do not make the LLM convert odds, derive complements, count votes, select stakes, grade results or calculate returns.
- Do not overwrite accepted history when cards change mid-week.
- Do not deploy preview code against production data.
- Prefer transparent missing data over a polished invented answer.

The MVP feature set is implemented locally. Complete the remaining acceptance,
pipeline-hardening, and credentialed release items in
`docs/implementation-status.md` before describing it as production-ready.

# sybaubetting

A private, single-user sports betting odds comparison tool. It polls an
external odds API across ~10 US sportsbooks, normalizes equivalent markets
(so "LeBron James over 25.5 points" is only ever compared against the exact
same line, never a different one), finds the best price for every outcome,
estimates fair (de-vigged) probability and expected value, flags meaningful
price outliers, scans for arbitrage, and lets you track your own placed
bets across sportsbooks (including closing line value once a bet settles).

It is a simplified, personal alternative to tools like OddsJam — not a
production SaaS. See [Known limitations](#known-limitations) for what's
deliberately out of scope for the MVP.

## Contents

- [Architecture](#architecture)
- [Core concepts](#core-concepts)
- [Local development](#local-development)
- [Running the worker](#running-the-worker)
- [Testing](#testing)
- [Deployment](#deployment)
- [API documentation](#api-documentation)
- [Project structure](#project-structure)
- [Known limitations](#known-limitations)
- [Recommended next steps](#recommended-next-steps)

## Architecture

```
┌─────────────────┐        ┌──────────────────────────┐
│   Vercel         │        │   Render                  │
│                  │        │                            │
│  Next.js app     │◄──────►│  PostgreSQL                │
│  (frontend +     │  reads/│                            │
│   API routes)    │  writes│  Background Worker         │
│                  │        │  (polls odds provider,     │
└──────────────────┘        │   normalizes, computes     │
        ▲                   │   EV/arbitrage)             │
        │                   │                              │
        │                   │  Redis (optional, caching)  │
        │                   └──────────────────────────┘
        │                              │
        │                              ▼
        │                   ┌──────────────────────────┐
        └───────────────────┤  The Odds API              │
       (never called from   │  (or another provider      │
        the browser)        │   behind the same          │
                             │   interface)                │
                             └──────────────────────────┘
```

**Why this split.** The brief allows either FastAPI or Next.js server routes
as the backend; Next.js API routes were chosen so the whole app is one
language and one deploy artifact for the interactive parts. But the odds
ingestion pipeline needs to run continuously/on a schedule, independent of
any HTTP request — something Vercel's serverless functions (bounded
execution time, no persistent process) are a poor fit for. So:

- **Vercel** hosts the Next.js app: the UI and every `/api/*` route (reads
  for the dashboard/odds/arbitrage/event pages, writes for bets/settings).
  This is the "backend using Next.js server-side routes" called out as an
  acceptable option in the brief.
- **Render** hosts PostgreSQL (the system of record) and a **background
  worker** (`worker/poll.ts`) that does the actual data collection and
  computation: fetch odds → normalize → snapshot → best price → consensus
  → fair probability → EV → arbitrage → expire stale opportunities. Redis
  on Render is optional and only used to cache the dashboard aggregate
  query.

Both Vercel and Render talk to the same Postgres database; the worker never
runs inside a request/response cycle, and the Next.js app never calls the
odds provider directly (only the worker does, and only from the server —
the odds API key is never sent to the browser).

### Provider abstraction

`src/lib/providers/types.ts` defines an `OddsProvider` interface (list
sports, list game odds, list player props, list futures). `theOddsApi.ts`
implements it for [The Odds API](https://the-odds-api.com); `mock.ts`
implements it with a small offline dataset for local dev/tests without an
API key. `registry.ts` picks the implementation from environment
variables. Adding a second real provider (SportsGameOdds, SportsDataIO,
...) means writing one new file implementing the interface and adding one
case to the registry — nothing else in the app changes. All external IDs
(provider event/team/player/market/sportsbook keys) are kept as opaque
strings and resolved against dedicated `provider_*` mapping tables — see
`SCHEMA_CHANGES.md` — never used as internal database IDs.

### Normalization / market matching

`src/lib/normalization/marketMatcher.ts` is the piece described as "the
most important backend responsibility" in the brief. It resolves raw
provider odds into internal `Market` → `MarketLine` → `Outcome` rows,
de-duplicating by natural key so the same market from two different books
(or the same book polled twice) always resolves to the same row instead of
creating a duplicate. Team names, player names (including accented
characters), and period ("first half" vs "full game") are normalized in
`src/lib/normalization/`. See `SCHEMA_CHANGES.md` for the exact
de-duplication rules and their edge cases.

### Calculation pipeline (`src/lib/worker/`, mirrored in `src/lib/odds/`)

All the math (odds conversion, no-vig, expected value, consensus, outlier
scoring, arbitrage) lives in framework-free, fully unit-tested modules
under `src/lib/odds/`. `src/lib/worker/opportunityCalculator.ts` and
`arbitrageScanner.ts` apply that math to the database: for every outcome
touched by a polling cycle, compute best price, consensus, a fair
probability estimate (sharp-reference book if configured, else no-vig
de-vig of the market's two sides, else plain consensus as a fallback), and
EV; for every market line with a complete outcome set, scan for arbitrage.

## Core concepts

The brief's data model distinctions are enforced end-to-end, not just
described:

| Concept | Example | Where |
|---|---|---|
| **Market** | "LeBron James total points" | `markets` table — the question being offered |
| **Line** | 25.5 | `market_lines` table — the numeric threshold (nullable for futures) |
| **Outcome** | "Over 25.5" | `outcomes` table — the selectable side |
| **Odds** | -115 / 1.87 decimal | `odds_snapshots.american_odds` / `.decimal_odds` |
| **Odds snapshot** | DraftKings' price for that outcome at 3:04pm | one immutable, timestamped row |

A book offering 25.5 and a book offering 26.5 for the same player/market
are two different `MarketLine`s under the same `Market` — they are never
compared as if equivalent (see `tests/db/marketMatcher.test.ts` and the
mock provider's player-prop fixture in `src/lib/providers/mock.ts`, both
of which deliberately exercise this exact scenario).

## Local development

Prerequisites: Node 20+, PostgreSQL 16 (or any recent Postgres), and
optionally Redis.

```bash
npm install                     # also runs `prisma generate` via postinstall
cp .env.example .env            # fill in DATABASE_URL at minimum

createdb sybaubetting           # or: psql -c "CREATE DATABASE sybaubetting;"
createdb sybaubetting_test      # for tests/db/*

npx prisma migrate deploy       # apply migrations to $DATABASE_URL
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy   # and to the test DB

npm run db:seed                 # reference data only: providers, sportsbooks,
                                 # sports/leagues, market types, a starter NBA +
                                 # EPL roster, settings, and the single MVP user.
                                 # No fabricated events/odds/bets -- real data
                                 # only ever comes from the worker below.

npm run worker:once             # fetch + normalize + compute once (uses the
                                 # mock provider automatically if ODDS_API_KEY
                                 # is unset -- its small built-in NBA slate
                                 # includes a guaranteed arbitrage example so
                                 # the Arbitrage page has something to show)

npm run dev                     # http://localhost:3000
```

No `ODDS_API_KEY`? The app and worker automatically fall back to
`MockOddsProvider` (`src/lib/providers/mock.ts`), a small hand-built NBA
slate, so the whole pipeline works offline. Once you have a real key from
[the-odds-api.com](https://the-odds-api.com), set `ODDS_API_KEY` in `.env`
and re-run the worker.

## Running the worker

```bash
npm run worker:once   # one polling cycle, then exit (for a Render Cron Job)
npm run worker        # continuous loop, sleeping settings.refresh_frequency_seconds
                       # between cycles (for a Render Background Worker)
```

Each cycle: for every active league, fetch game odds (moneyline/spread/
total, all periods) and futures, plus player props per event; normalize
and snapshot; recompute best price/consensus/fair probability/EV for every
touched outcome; scan touched market lines for arbitrage; expire arbitrage
opportunities whose prices have since moved. Unchanged prices don't create
a new snapshot row (checked by exact odds/availability match) unless the
last snapshot for that outcome+book is more than 30 minutes old, in which
case one is written anyway so line-movement charts have periodic sample
points even in a quiet market. Retries with exponential backoff on
transient HTTP failures (`src/lib/providers/httpClient.ts`); the worker
also tracks the provider's rate-limit headers and stops starting new
requests if the remaining quota drops low.

The frontend never triggers a poll on its own -- reloading a page just
re-reads whatever the worker last wrote to Postgres. Two ways to actually
get fresh data:

- Run `npm run worker` (continuous mode) in a second terminal while you use
  the app, so odds refresh automatically in the background every
  `settings.refresh_frequency_seconds` (2 minutes by default) regardless of
  which page is open.
- Click **"Refresh odds now"** on the Dashboard, which calls
  `POST /api/worker/run` to run exactly one cycle on demand -- the same work
  `npm run worker:once` does, without leaving your terminal. The "Last
  checked" timestamp next to it reflects the most recent completed cycle
  (`settings.last_worker_run_at`), even if that cycle found no price changes
  to write. Each click spends real provider request quota, so avoid mashing
  it if you're on a metered plan.

## Testing

```bash
npm test          # unit + integration + DB + frontend component tests, once
npm run test:watch
```

130 tests across:

- **Unit** (`tests/unit/`): odds conversion, implied probability, no-vig
  (two-way and n-way), expected value, consensus (median + weighted),
  outlier scoring, best price, arbitrage (two-way and three-way),
  text/period/market-type normalization, formatting helpers, the Redis
  cache-aside helper.
- **Integration** (`tests/integration/`): `TheOddsApiProvider` against
  mocked HTTP responses (fixtures in `tests/fixtures/`) — parsing, rate
  limit header capture, retry-on-5xx, no-retry-on-401, graceful handling of
  "no props posted yet"; the full worker cycle against the mock provider
  and a real Postgres test database.
- **DB** (`tests/db/`): team/player/event/market/line/outcome resolution
  and duplicate prevention against a real Postgres instance — including
  that re-ingesting identical data never creates duplicate rows, that
  moneyline shares one line while totals/spreads split correctly, that
  mismatched player-prop lines stay separate, and that the worker never
  leaves more than one `is_current` snapshot per outcome+sportsbook after
  repeated cycles.
- **Frontend** (`tests/frontend/`): shared UI components, the odds-history
  chart, the bet-logging flow.

DB and integration tests need `TEST_DATABASE_URL` pointed at a real
(disposable) Postgres database with migrations applied — see [Local
development](#local-development).

## Deployment

### Render (database + worker)

1. In the Render dashboard: **New → Blueprint**, point it at this repo.
   `render.yaml` provisions a Postgres database, an optional Redis
   instance, and the background worker service.
2. On the worker service, set `ODDS_API_KEY` (Render dashboard → Environment
   — `render.yaml` deliberately leaves it out of source control via
   `sync: false`).
3. Run migrations once against the new database (from your machine, with
   `DATABASE_URL` pointed at Render's connection string):
   ```bash
   DATABASE_URL="<render external connection string>" npx prisma migrate deploy
   DATABASE_URL="<render external connection string>" npm run db:seed
   ```
4. The worker service starts automatically and begins polling. Watch its
   logs in the Render dashboard — each cycle logs one JSON line with
   events/snapshots processed and any errors.

Don't want a 24/7 worker process? Change the `sybaubetting-worker` service
in `render.yaml` from `type: worker` to `type: cron` with
`startCommand: npm run worker:once` and a schedule (e.g. `*/2 * * * *` for
every 2 minutes) — the polling logic is identical either way.

### Vercel (frontend + API routes)

1. Import this repo into Vercel as a Next.js project (auto-detected).
2. Set environment variables in the Vercel project settings:
   - `DATABASE_URL` — the same Render Postgres connection string (use the
     external/pooled connection string Render provides).
   - `REDIS_URL` — only if you provisioned Redis on Render.
   - `ODDS_API_PROVIDER` — `the-odds-api` (or `mock-provider` for a demo
     deployment with no API key).
   - `APP_PASSWORD` — **required if anyone besides you will have this
     URL.** There is no per-user login system; this one passphrase gates
     every page and every `/api/*` route via `src/proxy.ts`. Leaving it
     unset means the deployed app — including your bet history and the
     ability to create/edit data — is open to anyone with the link. Local
     dev works fine without it (no login prompt at all); production
     deployments you intend to share should always set it.
   - Do **not** set `ODDS_API_KEY` on Vercel — the browser-facing app never
     calls the odds provider directly, only the worker does. Leaving it
     unset on Vercel is correct, not an oversight.
3. Deploy. `postinstall` runs `prisma generate` automatically.

At real traffic (more than one user, or scripts hammering the API), a
serverless app opening direct Postgres connections can exhaust Render's
connection limit — see [Known limitations](#known-limitations) for the
mitigation (PgBouncer / Prisma Accelerate) not implemented in this MVP.

### API provider setup

1. Create an account at [the-odds-api.com](https://the-odds-api.com) and
   copy your API key.
2. Set it as `ODDS_API_KEY` on the Render worker service (never on Vercel,
   never committed to git).
3. The free tier's monthly request quota is limited — the worker's
   rate-limit guard (`src/lib/worker/runCycle.ts`) stops starting new
   requests once the provider reports low remaining quota, and
   `settings.refresh_frequency_seconds` (Settings page) controls how often
   the continuous worker polls, so tune it to fit your plan.

## API documentation

All routes are under `/api/`, return JSON, and validate input with
[zod](https://zod.dev). Errors: `400` (validation), `404` (not found),
`500` (unexpected — message is never leaked to the client, only logged
server-side).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/dashboard` | Top +EV, best-line, largest outliers, active arbitrage, recently updated markets (cached 20s in Redis if configured) |
| GET | `/api/odds` | Filterable odds comparison. Query: `sport`, `league`, `event`, `marketType`, `sportsbook`, `minOdds`, `minEv`, `live`, `player`, `startTimeFrom`, `startTimeTo`, `limit` |
| GET | `/api/events` | List events. Query: `sport`, `league`, `limit` |
| GET | `/api/events/:id` | Full event detail — every current price per market/line, best-price flag, consensus, fair probability |
| GET | `/api/outcomes/:id/history` | Odds history for one outcome (for the line-movement chart) |
| GET | `/api/arbitrage` | Active (non-expired) arbitrage opportunities with suggested stake allocation. Query: `stake` |
| GET / POST | `/api/bets` | List / log a placed bet |
| PATCH | `/api/bets/:id` | Settle a bet (status, actual profit); `computeClosingLine: true` derives closing line value from the consensus price nearest event start |
| GET / PUT | `/api/settings` | Read / update app settings (refresh frequency, min EV threshold, max quote age, bankroll, default stake, consensus method). Reports `oddsApiKeyConfigured` as a boolean only — the key itself is never returned |
| GET | `/api/sportsbooks` | List sportsbooks (active/sharp-reference flags) |
| PATCH | `/api/sportsbooks/:id` | Toggle `active` / `isSharp` |
| GET | `/api/sports` | List sports with their leagues |
| PATCH | `/api/sports/:id` | Toggle a sport (and cascade to its leagues) active/inactive |
| PATCH | `/api/leagues/:id` | Toggle one league active/inactive |
| GET | `/api/market-types` | List market types (for filter dropdowns) |

## Project structure

```
prisma/               schema.prisma, migrations, seed.ts
src/
  app/                 Next.js pages (App Router) + /api routes
  components/          Shared React UI
  lib/
    odds/               odds conversion, no-vig, EV, consensus, outliers,
                         best price, arbitrage — pure functions, unit tested
    providers/            OddsProvider interface + The Odds API + mock + registry
    normalization/         text/period/market-type normalization + MarketMatcher
    worker/                 snapshot writer, opportunity calculator, arbitrage
                          scanner, ingest orchestration, cycle runner
    api/                    request/response logic backing the /api routes
    cache/                  Redis cache-aside helper (optional)
    db/                     Prisma client singleton
    seedData/               static seed reference data (teams, players, ...)
worker/poll.ts         worker CLI entrypoint (once / continuous)
tests/
  unit/ integration/ db/ frontend/ fixtures/
docs/erd.pdf           the original ERD this schema is derived from
SCHEMA_CHANGES.md      every deviation from the ERD, and why
```

## Known limitations

Being explicit about what this MVP does **not** do, per the brief's
instruction not to claim more than what's implemented and tested:

- **One shared password, not per-user accounts.** `src/proxy.ts` gates the
  whole app (every page, every `/api/*` route) behind a single passphrase
  (`APP_PASSWORD`) via an HttpOnly signed cookie (`src/lib/auth/session.ts`)
  — there's no concept of separate user accounts, roles, or permissions.
  Everyone who has the password has full access to everything, including
  each other's bet history if you share it with more than one person. Fine
  for a personal tool shared with a few trusted people; not a substitute
  for real multi-user access control.
- **CUSTOM_MODEL fair-probability estimates aren't computed automatically.**
  The database and calculator support `estimationMethod: "CUSTOM_MODEL"`,
  but nothing in the worker or API currently lets you enter a custom model
  probability — only `SHARP_REFERENCE`, `NO_VIG`, and `CONSENSUS` are
  computed by the pipeline.
- **No connection pooling for serverless Postgres access.** Running Prisma
  from Vercel serverless functions against a plain Postgres connection can
  exhaust the database's connection limit under real concurrent traffic.
  Fine for one user; not fine at scale. See below.
- **Team and player names are matched by exact/normalized-string match
  only, not fuzzy/edit-distance matching.** Both are auto-created on first
  sighting when no seeded or previously-mapped team/player matches (see
  `SCHEMA_CHANGES.md`) — this is deliberate, since real rosters/leagues
  change constantly (promotion/relegation, expansion teams, rebrands) and
  a strict "reject anything unseeded" policy broke real-provider ingestion
  in practice. A genuinely misspelled or wildly different name from the
  provider would still create a distinct duplicate team rather than
  matching an existing one — normalized-string matching only catches
  case/accent/abbreviation differences, not typos.
  Sportsbooks are still curated — an odds-provider bookmaker key with no
  matching `provider_sportbooks` mapping is skipped, not auto-created,
  since which sportsbooks to track is a deliberate user choice (Settings
  page), not something to infer from the feed.
- **Only ~10 sportsbooks and 5 sports/leagues are seeded** (NBA, NFL, MLB,
  NHL, EPL), matching the brief's MVP scope. Adding another league is a
  data change (`src/lib/seedData/`), not a code change; adding another
  sport with genuinely different market shapes may need catalog additions
  in `src/lib/normalization/marketTypeCatalog.ts`.
- **Live/in-play odds aren't specially handled** beyond the `live` filter
  on `/api/odds`, which just checks `event.status`. There's no live-odds
  polling cadence separate from pregame, and no live-specific UI.
- **No promotion tracking.** An earlier version of this app tracked
  manually-entered sportsbook promotions (bonus bets, odds boosts, etc.)
  and ranked qualifying bets against them. That feature was removed to
  keep scope focused on odds comparison and bet tracking; the underlying
  `promotions`/`promotion_opportunities` tables and `placed_bets.promotion_id`
  still exist in the schema (harmless, unused) if it's worth reviving later.
- **The Odds API integration has not been exercised against live traffic**
  in this environment (no API key available here). It's fully implemented
  and unit/integration tested against realistic mocked responses matching
  the documented API shape, but "tested against mocks" and "verified
  against the real API" are different claims — only the former is true
  today.

## Recommended next steps

Roughly in priority order, per the brief's own phasing ("live betting,
advanced arbitrage, historical analytics, user accounts, and additional
providers only after the core system works"):

1. **Per-user accounts**, if this is ever shared with people who shouldn't
   see each other's bet history — today's `APP_PASSWORD` gate is one
   shared passphrase for everyone, not per-user access control.
2. **Connection pooling** (PgBouncer in front of Render Postgres, or
   Prisma Accelerate) before any real concurrent load.
3. **A second odds provider** implementing `OddsProvider` (SportsGameOdds
   or SportsDataIO), to validate the abstraction actually holds up and to
   add a cross-provider consensus signal.
4. **Custom model fair-probability entry** — a form to manually enter a
   probability for `estimationMethod: "CUSTOM_MODEL"`, surfaced next to
   the existing methods on the Event Details page.
5. **Historical analytics** — CLV trends over time, ROI by sport/market/
   sportsbook.
6. **Live/in-play odds** with a faster polling cadence and live-specific
   UI treatment.
7. **More sports/markets** — the catalog and normalization layer are
   designed to extend without rewrites; this is primarily a seed-data and
   testing exercise per sport.

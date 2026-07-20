# Schema changes vs. the attached ERD

The ERD (`docs/erd.pdf`) is the source of truth. This document lists every
place `prisma/schema.prisma` deviates from it and why. Table/column names
below use the ERD's snake_case; Prisma maps camelCase model fields back to
the same snake_case columns (`@map`), so the physical schema still matches
the ERD's naming where unchanged.

## Additions

1. **`provider_leagues`, `provider_teams`, `provider_players`,
   `provider_market_types`** — the ERD already has `provider_sportsbooks`
   and `provider_events` to separate internal IDs from external provider
   IDs, but the brief explicitly requires "provider mapping tables where
   necessary" for normalizing team names, player names, and market names
   across providers. The ERD didn't include these four, so they were added,
   mirroring the shape of `provider_sportsbooks`. Without them, market
   matching would have to fuzzy-match provider strings on every request
   instead of resolving through a stable, auditable mapping created once.

2. **`odds_snapshots.is_current`** — the ERD models `odds_snapshots` as a
   pure append-only log (correctly, per the "never overwrite" requirement).
   But nearly every read in the app ("current price", "best price", "is
   this a live opportunity") needs the *latest* snapshot per
   (outcome, sportsbook). Without a marker, that's a correlated subquery /
   window function on every request. `is_current` is a boolean maintained
   by the worker in the same transaction that inserts a new snapshot
   (previous current row for that outcome+sportsbook flips to `false`).
   History is still 100% intact — this is an index-friendly pointer, not a
   mutation of history.

3. **`settings` (singleton table, id fixed at 1)** — the ERD has no table
   backing the Settings page (enabled sportsbooks/sports, refresh
   frequency, sharp reference books, min EV threshold, max quote age,
   bankroll, default stake size). "Enabled sportsbooks/sports" reuse the
   existing `sportsbooks.active` / `sports.active` flags rather than
   duplicating state. "Sharp reference books" reuse a new
   `sportsbooks.is_sharp` boolean (see below) instead of a join table,
   since sharp/not-sharp is a simple per-book flag, not a many-to-many
   relationship. The remaining fields (refresh frequency, min EV threshold,
   max quote age, bankroll, default stake size, consensus method) live on
   `settings`.

   Deliberately **not** included: an odds-provider API key field. The
   brief's own security section says "store API keys only in environment
   variables; never expose secret API keys to the browser." Putting the key
   in a database table read by a Next.js API route creates exactly that
   risk. The Settings page instead reports whether `ODDS_API_KEY` is set
   in the environment (boolean) — the actual key is never read from, or
   written to, the database.

4. **`sportsbooks.is_sharp`** — boolean flag for "treated as a sharp
   reference book," configurable from Settings. Not in the ERD; needed by
   the `SHARP_REFERENCE` fair-probability method.

5. **`placed_bets.closing_decimal_odds`, `placed_bets.closing_line_value_percent`**
   — the brief's Bet Tracker requirements explicitly list "closing line"
   and "closing line value" as fields to track; the ERD's `placed_bets`
   doesn't have them. Added as nullable decimals, populated by the worker
   once an event starts (closing line = consensus price at kickoff).

6. **`placed_bets.odds_snapshot_id`** — nullable FK to the exact snapshot a
   bet was placed against. Needed to compute closing line value precisely
   (compare the odds actually taken against the closing consensus for that
   same outcome) rather than re-deriving it from `american_odds`/`decimal_odds`
   alone.

7. **`promotions.notes`** — the brief lists "additional notes" as a
   Promotions field; the ERD's `promotions` table doesn't have a notes
   column.

## Type / constraint changes

8. **Integer primary keys everywhere, including tables the ERD marks
   `bigint`** (`odds_snapshots`, `fair_probability_estimates`,
   `betting_opportunities`, `arbitrage_opportunities`, `arbitrage_legs`,
   `promotion_opportunities`, `placed_bets`). Postgres `integer` supports
   up to ~2.1 billion rows, far beyond MVP (and realistic single-tenant)
   scale, and standard `int4` autoincrement avoids the `BigInt`/`JSON.stringify`
   friction that shows up constantly in Node/Next.js APIs (every API route
   would otherwise need custom JSON serialization). If snapshot volume ever
   approaches billions of rows, switching to `bigint` is a mechanical
   migration — documented here as a known, deliberate MVP simplification
   rather than an oversight.

9. **Enums instead of free `varchar`** for `events.status`
   (`EventStatus`), `markets.status` (`MarketStatus`),
   `fair_probability_estimates.estimation_method` (`EstimationMethod`),
   `promotions.promotion_type` (`PromotionType`), and `placed_bets.status`
   (`BetStatus`). The ERD used `varchar` for these; Postgres enums give the
   same values compile-time and database-level validation instead of
   relying on application code to keep the string vocabulary consistent.
   `markets.period` and `outcomes.outcome_type` are deliberately **kept as
   `varchar`**, not enums, because the controlled vocabulary differs across
   sports (`1h`/`2h` for basketball and football, `1p`/`2p`/`3p` for
   hockey, `1st_5`for baseball, etc.) and is centralized in application
   code (`src/lib/normalization/periods.ts`, `src/lib/normalization/outcomeTypes.ts`)
   instead of the database, so new sports can add period/outcome codes
   without a migration.

## Constraints added for de-duplication

The ERD's diagram doesn't show unique constraints, but market
normalization ("do not treat equivalent markets as duplicates, do not
conflate different lines") only works if the database enforces the natural
keys the brief describes. Added:

- `provider_sportsbooks(api_provider_id, external_sportsbook_id)`,
  `provider_events(api_provider_id, external_event_id)`, and the equivalent
  uniques on the other four provider-mapping tables — one internal entity
  maps to at most one external ID per provider, and vice versa.
- `events(league_id, home_team_id, away_team_id, start_time)` — the natural
  key for "is this the same game."
- `markets(event_id, market_type_id, player_id, team_id, period)` — the
  natural key described in the brief ("same sport, league, event,
  player/team, market type, period"). Note Postgres unique indexes treat
  `NULL` as distinct from other `NULL`s, so this constraint alone doesn't
  fully dedupe markets with `player_id`/`team_id` both null (e.g. a game
  total); the market-matching upsert in
  `src/lib/normalization/marketMatcher.ts` explicitly looks up by the full
  natural key including `IS NULL` checks before inserting, rather than
  relying on the constraint alone to reject duplicates.
- `market_lines(market_id, line_value, handicap_team_id)` — the numeric
  line is part of the natural key ("25.5 is not 26.5").
- `outcomes(market_line_id, normalized_label)` — the normalized outcome
  label (e.g. `over`, `under`, `lakers`) is unique per line.
- `betting_opportunities(odds_snapshot_id)` — one opportunity record per
  snapshot, recalculated in place rather than accumulated.

None of these change what data the ERD models — they enforce the
de-duplication rules the brief already specifies in prose.

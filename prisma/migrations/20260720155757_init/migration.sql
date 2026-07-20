-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED');

-- CreateEnum
CREATE TYPE "market_status" AS ENUM ('OPEN', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "estimation_method" AS ENUM ('NO_VIG', 'SHARP_REFERENCE', 'CONSENSUS', 'CUSTOM_MODEL');

-- CreateEnum
CREATE TYPE "promotion_type" AS ENUM ('PROFIT_BOOST', 'BONUS_BET', 'NO_SWEAT', 'ODDS_BOOST', 'DEPOSIT_BONUS', 'BET_CREDIT');

-- CreateEnum
CREATE TYPE "bet_status" AS ENUM ('PENDING', 'WON', 'LOST', 'PUSH', 'CASHED_OUT', 'VOID');

-- CreateTable
CREATE TABLE "api_providers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sportsbooks" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website_url" TEXT,
    "logo_url" TEXT,
    "is_sharp" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sportsbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sportsbook_regions" (
    "id" SERIAL NOT NULL,
    "sportsbook_id" INTEGER NOT NULL,
    "country_code" TEXT NOT NULL,
    "state_code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sportsbook_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_sportsbooks" (
    "id" SERIAL NOT NULL,
    "api_provider_id" INTEGER NOT NULL,
    "sportsbook_id" INTEGER NOT NULL,
    "external_sportsbook_id" TEXT NOT NULL,

    CONSTRAINT "provider_sportsbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" SERIAL NOT NULL,
    "sport_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "country_code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_leagues" (
    "id" SERIAL NOT NULL,
    "api_provider_id" INTEGER NOT NULL,
    "league_id" INTEGER NOT NULL,
    "external_league_key" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "provider_leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "league_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "city" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_teams" (
    "id" SERIAL NOT NULL,
    "api_provider_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "external_team_name" TEXT NOT NULL,

    CONSTRAINT "provider_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "current_team_id" INTEGER,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_players" (
    "id" SERIAL NOT NULL,
    "api_provider_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "external_player_name" TEXT NOT NULL,

    CONSTRAINT "provider_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "league_id" INTEGER NOT NULL,
    "home_team_id" INTEGER NOT NULL,
    "away_team_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "status" "event_status" NOT NULL DEFAULT 'SCHEDULED',
    "neutral_site" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_events" (
    "id" SERIAL NOT NULL,
    "api_provider_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "external_event_id" TEXT NOT NULL,

    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "has_line" BOOLEAN NOT NULL,
    "expected_outcome_count" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "market_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_market_types" (
    "id" SERIAL NOT NULL,
    "api_provider_id" INTEGER NOT NULL,
    "market_type_id" INTEGER NOT NULL,
    "external_market_key" TEXT NOT NULL,

    CONSTRAINT "provider_market_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER,
    "league_id" INTEGER NOT NULL,
    "market_type_id" INTEGER NOT NULL,
    "player_id" INTEGER,
    "team_id" INTEGER,
    "title" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'full_game',
    "status" "market_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_lines" (
    "id" SERIAL NOT NULL,
    "market_id" INTEGER NOT NULL,
    "line_value" DECIMAL(10,3),
    "handicap_team_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcomes" (
    "id" SERIAL NOT NULL,
    "market_line_id" INTEGER NOT NULL,
    "outcome_type" TEXT NOT NULL,
    "team_id" INTEGER,
    "player_id" INTEGER,
    "label" TEXT NOT NULL,
    "normalized_label" TEXT NOT NULL,

    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odds_snapshots" (
    "id" SERIAL NOT NULL,
    "outcome_id" INTEGER NOT NULL,
    "sportsbook_id" INTEGER NOT NULL,
    "api_provider_id" INTEGER NOT NULL,
    "american_odds" INTEGER NOT NULL,
    "decimal_odds" DECIMAL(10,4) NOT NULL,
    "implied_probability" DECIMAL(8,6) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "max_stake" DECIMAL(12,2),
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odds_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fair_probability_estimates" (
    "id" SERIAL NOT NULL,
    "outcome_id" INTEGER NOT NULL,
    "probability" DECIMAL(8,6) NOT NULL,
    "estimation_method" "estimation_method" NOT NULL,
    "reference_sportsbook_id" INTEGER,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fair_probability_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "betting_opportunities" (
    "id" SERIAL NOT NULL,
    "odds_snapshot_id" INTEGER NOT NULL,
    "fair_probability_estimate_id" INTEGER,
    "expected_value_percent" DECIMAL(10,4),
    "edge_percent" DECIMAL(10,4),
    "outlier_score" DECIMAL(10,4),
    "best_price_in_market" BOOLEAN NOT NULL DEFAULT false,
    "recommended_stake" DECIMAL(12,2),
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "betting_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arbitrage_opportunities" (
    "id" SERIAL NOT NULL,
    "market_line_id" INTEGER NOT NULL,
    "total_implied_probability" DECIMAL(8,6) NOT NULL,
    "profit_percent" DECIMAL(10,4) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arbitrage_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arbitrage_legs" (
    "id" SERIAL NOT NULL,
    "arbitrage_opportunity_id" INTEGER NOT NULL,
    "odds_snapshot_id" INTEGER NOT NULL,
    "stake_percentage" DECIMAL(8,6) NOT NULL,

    CONSTRAINT "arbitrage_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" SERIAL NOT NULL,
    "sportsbook_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "promotion_type" "promotion_type" NOT NULL,
    "boost_percent" DECIMAL(8,4),
    "max_stake" DECIMAL(12,2),
    "min_decimal_odds" DECIMAL(10,4),
    "max_decimal_odds" DECIMAL(10,4),
    "stake_returned" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_opportunities" (
    "id" SERIAL NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "odds_snapshot_id" INTEGER NOT NULL,
    "boosted_decimal_odds" DECIMAL(10,4) NOT NULL,
    "expected_value_percent" DECIMAL(10,4) NOT NULL,
    "expected_profit" DECIMAL(12,2) NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placed_bets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "outcome_id" INTEGER NOT NULL,
    "sportsbook_id" INTEGER NOT NULL,
    "promotion_id" INTEGER,
    "odds_snapshot_id" INTEGER,
    "stake" DECIMAL(12,2) NOT NULL,
    "american_odds" INTEGER NOT NULL,
    "decimal_odds" DECIMAL(10,4) NOT NULL,
    "potential_profit" DECIMAL(12,2) NOT NULL,
    "status" "bet_status" NOT NULL DEFAULT 'PENDING',
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),
    "actual_profit" DECIMAL(12,2),
    "closing_decimal_odds" DECIMAL(10,4),
    "closing_line_value_percent" DECIMAL(10,4),

    CONSTRAINT "placed_bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "refresh_frequency_seconds" INTEGER NOT NULL DEFAULT 120,
    "min_ev_percent_threshold" DECIMAL(6,2) NOT NULL DEFAULT 2,
    "max_quote_age_seconds" INTEGER NOT NULL DEFAULT 600,
    "bankroll" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "default_stake_size" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "consensus_method" TEXT NOT NULL DEFAULT 'median',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_providers_name_key" ON "api_providers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "api_providers_slug_key" ON "api_providers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "sportsbooks_slug_key" ON "sportsbooks"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "sportsbook_regions_sportsbook_id_country_code_state_code_key" ON "sportsbook_regions"("sportsbook_id", "country_code", "state_code");

-- CreateIndex
CREATE UNIQUE INDEX "provider_sportsbooks_api_provider_id_external_sportsbook_id_key" ON "provider_sportsbooks"("api_provider_id", "external_sportsbook_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_sportsbooks_api_provider_id_sportsbook_id_key" ON "provider_sportsbooks"("api_provider_id", "sportsbook_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_slug_key" ON "sports"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_sport_id_name_key" ON "leagues"("sport_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "provider_leagues_api_provider_id_external_league_key_key" ON "provider_leagues"("api_provider_id", "external_league_key");

-- CreateIndex
CREATE UNIQUE INDEX "provider_leagues_api_provider_id_league_id_key" ON "provider_leagues"("api_provider_id", "league_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_league_id_name_key" ON "teams"("league_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "provider_teams_api_provider_id_external_team_name_key" ON "provider_teams"("api_provider_id", "external_team_name");

-- CreateIndex
CREATE INDEX "players_normalized_name_idx" ON "players"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "provider_players_api_provider_id_external_player_name_key" ON "provider_players"("api_provider_id", "external_player_name");

-- CreateIndex
CREATE INDEX "events_start_time_idx" ON "events"("start_time");

-- CreateIndex
CREATE UNIQUE INDEX "events_league_id_home_team_id_away_team_id_start_time_key" ON "events"("league_id", "home_team_id", "away_team_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "provider_events_api_provider_id_external_event_id_key" ON "provider_events"("api_provider_id", "external_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_events_api_provider_id_event_id_key" ON "provider_events"("api_provider_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_types_code_key" ON "market_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "provider_market_types_api_provider_id_external_market_key_key" ON "provider_market_types"("api_provider_id", "external_market_key");

-- CreateIndex
CREATE INDEX "markets_event_id_idx" ON "markets"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "markets_event_id_league_id_market_type_id_player_id_team_id_key" ON "markets"("event_id", "league_id", "market_type_id", "player_id", "team_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "market_lines_market_id_line_value_handicap_team_id_key" ON "market_lines"("market_id", "line_value", "handicap_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "outcomes_market_line_id_normalized_label_key" ON "outcomes"("market_line_id", "normalized_label");

-- CreateIndex
CREATE INDEX "odds_snapshots_outcome_id_sportsbook_id_is_current_idx" ON "odds_snapshots"("outcome_id", "sportsbook_id", "is_current");

-- CreateIndex
CREATE INDEX "odds_snapshots_outcome_id_captured_at_idx" ON "odds_snapshots"("outcome_id", "captured_at");

-- CreateIndex
CREATE INDEX "odds_snapshots_captured_at_idx" ON "odds_snapshots"("captured_at");

-- CreateIndex
CREATE INDEX "fair_probability_estimates_outcome_id_calculated_at_idx" ON "fair_probability_estimates"("outcome_id", "calculated_at");

-- CreateIndex
CREATE INDEX "betting_opportunities_expected_value_percent_idx" ON "betting_opportunities"("expected_value_percent");

-- CreateIndex
CREATE INDEX "betting_opportunities_outlier_score_idx" ON "betting_opportunities"("outlier_score");

-- CreateIndex
CREATE UNIQUE INDEX "betting_opportunities_odds_snapshot_id_key" ON "betting_opportunities"("odds_snapshot_id");

-- CreateIndex
CREATE INDEX "arbitrage_opportunities_market_line_id_idx" ON "arbitrage_opportunities"("market_line_id");

-- CreateIndex
CREATE INDEX "arbitrage_opportunities_expires_at_idx" ON "arbitrage_opportunities"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "arbitrage_legs_arbitrage_opportunity_id_odds_snapshot_id_key" ON "arbitrage_legs"("arbitrage_opportunity_id", "odds_snapshot_id");

-- CreateIndex
CREATE INDEX "promotions_sportsbook_id_active_idx" ON "promotions"("sportsbook_id", "active");

-- CreateIndex
CREATE INDEX "promotion_opportunities_promotion_id_idx" ON "promotion_opportunities"("promotion_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "placed_bets_user_id_status_idx" ON "placed_bets"("user_id", "status");

-- AddForeignKey
ALTER TABLE "sportsbook_regions" ADD CONSTRAINT "sportsbook_regions_sportsbook_id_fkey" FOREIGN KEY ("sportsbook_id") REFERENCES "sportsbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_sportsbooks" ADD CONSTRAINT "provider_sportsbooks_api_provider_id_fkey" FOREIGN KEY ("api_provider_id") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_sportsbooks" ADD CONSTRAINT "provider_sportsbooks_sportsbook_id_fkey" FOREIGN KEY ("sportsbook_id") REFERENCES "sportsbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_leagues" ADD CONSTRAINT "provider_leagues_api_provider_id_fkey" FOREIGN KEY ("api_provider_id") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_leagues" ADD CONSTRAINT "provider_leagues_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_teams" ADD CONSTRAINT "provider_teams_api_provider_id_fkey" FOREIGN KEY ("api_provider_id") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_teams" ADD CONSTRAINT "provider_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_current_team_id_fkey" FOREIGN KEY ("current_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_players" ADD CONSTRAINT "provider_players_api_provider_id_fkey" FOREIGN KEY ("api_provider_id") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_players" ADD CONSTRAINT "provider_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_api_provider_id_fkey" FOREIGN KEY ("api_provider_id") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_market_types" ADD CONSTRAINT "provider_market_types_api_provider_id_fkey" FOREIGN KEY ("api_provider_id") REFERENCES "api_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_market_types" ADD CONSTRAINT "provider_market_types_market_type_id_fkey" FOREIGN KEY ("market_type_id") REFERENCES "market_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_market_type_id_fkey" FOREIGN KEY ("market_type_id") REFERENCES "market_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_lines" ADD CONSTRAINT "market_lines_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_lines" ADD CONSTRAINT "market_lines_handicap_team_id_fkey" FOREIGN KEY ("handicap_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_market_line_id_fkey" FOREIGN KEY ("market_line_id") REFERENCES "market_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_outcome_id_fkey" FOREIGN KEY ("outcome_id") REFERENCES "outcomes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_sportsbook_id_fkey" FOREIGN KEY ("sportsbook_id") REFERENCES "sportsbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_api_provider_id_fkey" FOREIGN KEY ("api_provider_id") REFERENCES "api_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fair_probability_estimates" ADD CONSTRAINT "fair_probability_estimates_outcome_id_fkey" FOREIGN KEY ("outcome_id") REFERENCES "outcomes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fair_probability_estimates" ADD CONSTRAINT "fair_probability_estimates_reference_sportsbook_id_fkey" FOREIGN KEY ("reference_sportsbook_id") REFERENCES "sportsbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "betting_opportunities" ADD CONSTRAINT "betting_opportunities_odds_snapshot_id_fkey" FOREIGN KEY ("odds_snapshot_id") REFERENCES "odds_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "betting_opportunities" ADD CONSTRAINT "betting_opportunities_fair_probability_estimate_id_fkey" FOREIGN KEY ("fair_probability_estimate_id") REFERENCES "fair_probability_estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arbitrage_opportunities" ADD CONSTRAINT "arbitrage_opportunities_market_line_id_fkey" FOREIGN KEY ("market_line_id") REFERENCES "market_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arbitrage_legs" ADD CONSTRAINT "arbitrage_legs_arbitrage_opportunity_id_fkey" FOREIGN KEY ("arbitrage_opportunity_id") REFERENCES "arbitrage_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arbitrage_legs" ADD CONSTRAINT "arbitrage_legs_odds_snapshot_id_fkey" FOREIGN KEY ("odds_snapshot_id") REFERENCES "odds_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_sportsbook_id_fkey" FOREIGN KEY ("sportsbook_id") REFERENCES "sportsbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_opportunities" ADD CONSTRAINT "promotion_opportunities_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_opportunities" ADD CONSTRAINT "promotion_opportunities_odds_snapshot_id_fkey" FOREIGN KEY ("odds_snapshot_id") REFERENCES "odds_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placed_bets" ADD CONSTRAINT "placed_bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placed_bets" ADD CONSTRAINT "placed_bets_outcome_id_fkey" FOREIGN KEY ("outcome_id") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placed_bets" ADD CONSTRAINT "placed_bets_sportsbook_id_fkey" FOREIGN KEY ("sportsbook_id") REFERENCES "sportsbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placed_bets" ADD CONSTRAINT "placed_bets_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placed_bets" ADD CONSTRAINT "placed_bets_odds_snapshot_id_fkey" FOREIGN KEY ("odds_snapshot_id") REFERENCES "odds_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

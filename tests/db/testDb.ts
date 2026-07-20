import { PrismaClient } from "@prisma/client";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. DB tests require a dedicated Postgres database " +
      "(see .env.example) with migrations applied via `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`."
  );
}

export const testPrisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

const TABLES_IN_DELETE_ORDER = [
  "placed_bets",
  "promotion_opportunities",
  "promotions",
  "arbitrage_legs",
  "arbitrage_opportunities",
  "betting_opportunities",
  "fair_probability_estimates",
  "odds_snapshots",
  "outcomes",
  "market_lines",
  "markets",
  "provider_market_types",
  "market_types",
  "provider_events",
  "events",
  "provider_players",
  "players",
  "provider_teams",
  "teams",
  "provider_leagues",
  "leagues",
  "sports",
  "provider_sportsbooks",
  "sportsbook_regions",
  "sportsbooks",
  "api_providers",
  "users",
  "settings",
];

/** Wipes every table between tests so DB tests don't leak state into each other. */
export async function resetTestDb(): Promise<void> {
  await testPrisma.$transaction(
    TABLES_IN_DELETE_ORDER.map((table) => testPrisma.$executeRawUnsafe(`DELETE FROM "${table}"`))
  );
}

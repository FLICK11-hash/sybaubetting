import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";

/**
 * Deletes every fetched-odds row rooted at Event (markets, lines, outcomes,
 * odds snapshots, betting opportunities, arbitrage) so the next worker cycle
 * rebuilds everything from scratch. Leaves sportsbooks, teams, leagues,
 * users, settings, futures markets (not tied to an event), and placed bets
 * alone -- if any placed bet still references an outcome this would delete,
 * Postgres blocks the whole delete (placed_bets.outcome_id is
 * ON DELETE RESTRICT) rather than silently orphaning or removing the bet.
 */
async function main() {
  const { count } = await prisma.event.deleteMany({});
  console.log(
    `Deleted ${count} event(s) and everything under them (markets, lines, outcomes, odds snapshots, opportunities, arbitrage).`
  );
  console.log('Run `npm run worker:once` (or click "Refresh odds now") to rebuild.');
}

main()
  .catch((err) => {
    if (err?.code === "P2003") {
      console.error(
        "Could not delete: at least one placed bet still references an outcome that would be removed.\n" +
          "This script refuses to touch placed bets -- if you want to proceed anyway, say which bet(s) can go."
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  })
  .finally(() => prisma.$disconnect());

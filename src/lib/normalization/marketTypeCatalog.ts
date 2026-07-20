/**
 * Canonical market type catalog. This is the seed data for `market_types`
 * AND the lookup table normalization uses to turn a provider market key
 * (The Odds API convention, e.g. "player_points") into an internal
 * `market_types.code`. Adding a new market only requires adding an entry
 * here plus re-running the seed — no code changes elsewhere.
 *
 * `expectedOutcomeCount` drives arbitrage scanning (only markets with a
 * fixed, exhaustive outcome set are scanned) and outlier/EV context. Futures
 * markets have a variable outcome count (however many entrants a book
 * lists) so they're excluded from arbitrage scanning entirely — see
 * `category === "future"` checks in the worker.
 */
export type MarketCategory = "game" | "player_prop" | "future";

export interface MarketTypeDefinition {
  code: string;
  name: string;
  category: MarketCategory;
  hasLine: boolean;
  expectedOutcomeCount: number;
  /** Provider base market keys (post period-suffix-stripping) that map to this type. */
  providerKeys: string[];
}

export const MARKET_TYPE_CATALOG: MarketTypeDefinition[] = [
  // --- Game markets ---------------------------------------------------
  { code: "MONEYLINE", name: "Moneyline", category: "game", hasLine: false, expectedOutcomeCount: 2, providerKeys: ["h2h"] },
  { code: "MONEYLINE_3WAY", name: "Moneyline (3-way)", category: "game", hasLine: false, expectedOutcomeCount: 3, providerKeys: ["h2h"] },
  { code: "SPREAD", name: "Point Spread", category: "game", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["spreads"] },
  { code: "TOTAL", name: "Game Total", category: "game", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["totals"] },
  { code: "TEAM_TOTAL", name: "Team Total", category: "game", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["team_totals"] },

  // --- Player props -----------------------------------------------------
  { code: "PLAYER_POINTS", name: "Player Points", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_points"] },
  { code: "PLAYER_REBOUNDS", name: "Player Rebounds", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_rebounds"] },
  { code: "PLAYER_ASSISTS", name: "Player Assists", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_assists"] },
  { code: "PLAYER_THREES", name: "Player Made Threes", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_threes"] },
  { code: "PLAYER_PASS_YARDS", name: "Player Passing Yards", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_pass_yds"] },
  { code: "PLAYER_RUSH_YARDS", name: "Player Rushing Yards", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_rush_yds"] },
  { code: "PLAYER_RECEPTIONS", name: "Player Receptions", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_receptions"] },
  { code: "PLAYER_RECEIVING_YARDS", name: "Player Receiving Yards", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_reception_yds"] },
  { code: "PLAYER_STRIKEOUTS", name: "Pitcher Strikeouts", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["pitcher_strikeouts"] },
  { code: "PLAYER_HITS", name: "Player Hits", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["batter_hits"] },
  { code: "PLAYER_SHOTS_ON_GOAL", name: "Player Shots on Goal", category: "player_prop", hasLine: true, expectedOutcomeCount: 2, providerKeys: ["player_shots_on_goal"] },
  { code: "PLAYER_ANYTIME_GOALSCORER", name: "Anytime Goalscorer", category: "player_prop", hasLine: false, expectedOutcomeCount: 1, providerKeys: ["player_goal_scorer_anytime"] },

  // --- Futures ------------------------------------------------------------
  { code: "FUTURES_WINNER", name: "Championship Winner", category: "future", hasLine: false, expectedOutcomeCount: 0, providerKeys: ["outrights"] },
];

const KEY_TO_DEFAULT_CODE = new Map<string, string>();
for (const def of MARKET_TYPE_CATALOG) {
  for (const key of def.providerKeys) {
    if (!KEY_TO_DEFAULT_CODE.has(key)) {
      KEY_TO_DEFAULT_CODE.set(key, def.code);
    }
  }
}

/**
 * Resolve a provider's base market key to an internal market type code.
 * `isThreeWayMoneyline` disambiguates "h2h" between two-way (most US sports)
 * and three-way (soccer, which offers a draw) — see MONEYLINE_3WAY above.
 */
export function resolveMarketTypeCode(
  baseProviderKey: string,
  options: { isThreeWayMoneyline?: boolean } = {}
): string | null {
  if (baseProviderKey === "h2h" && options.isThreeWayMoneyline) {
    return "MONEYLINE_3WAY";
  }
  return KEY_TO_DEFAULT_CODE.get(baseProviderKey) ?? null;
}

export function marketTypeDefinition(code: string): MarketTypeDefinition | undefined {
  return MARKET_TYPE_CATALOG.find((d) => d.code === code);
}

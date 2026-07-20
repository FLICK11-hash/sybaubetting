/**
 * Which provider market keys to request per sport. Game markets
 * (moneyline/spread/total) are requested for every league in one call;
 * player props require a second, per-event call (provider limitation), so
 * they're listed separately per sport.
 */
export const GAME_MARKET_KEYS = ["h2h", "spreads", "totals"];

export const PLAYER_PROP_MARKET_KEYS_BY_SPORT: Record<string, string[]> = {
  basketball: ["player_points", "player_rebounds", "player_assists", "player_threes"],
  american_football: ["player_pass_yds", "player_rush_yds", "player_receptions", "player_reception_yds"],
  baseball: ["pitcher_strikeouts", "batter_hits"],
  ice_hockey: ["player_shots_on_goal", "player_goal_scorer_anytime"],
  soccer: ["player_goal_scorer_anytime"],
};

export function playerPropMarketKeysForSport(sportSlug: string): string[] {
  return PLAYER_PROP_MARKET_KEYS_BY_SPORT[sportSlug] ?? [];
}

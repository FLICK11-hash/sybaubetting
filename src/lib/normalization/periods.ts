/**
 * Canonical period vocabulary, kept in application code (not a DB enum) so
 * new sports can introduce period codes without a migration — see
 * SCHEMA_CHANGES.md. Provider market keys encode period as a suffix (The
 * Odds API convention: `_h1`/`_h2` for halves, `_q1`.._q4` for quarters,
 * `_p1`.._p3` for hockey periods, `_1st_5_innings` for baseball).
 */
export const PERIODS = {
  FULL_GAME: "full_game",
  FIRST_HALF: "first_half",
  SECOND_HALF: "second_half",
  FIRST_QUARTER: "first_quarter",
  SECOND_QUARTER: "second_quarter",
  THIRD_QUARTER: "third_quarter",
  FOURTH_QUARTER: "fourth_quarter",
  FIRST_PERIOD: "first_period",
  SECOND_PERIOD: "second_period",
  THIRD_PERIOD: "third_period",
  FIRST_FIVE_INNINGS: "first_five_innings",
} as const;

export type Period = (typeof PERIODS)[keyof typeof PERIODS];

const SUFFIX_TO_PERIOD: Record<string, Period> = {
  h1: PERIODS.FIRST_HALF,
  h2: PERIODS.SECOND_HALF,
  q1: PERIODS.FIRST_QUARTER,
  q2: PERIODS.SECOND_QUARTER,
  q3: PERIODS.THIRD_QUARTER,
  q4: PERIODS.FOURTH_QUARTER,
  p1: PERIODS.FIRST_PERIOD,
  p2: PERIODS.SECOND_PERIOD,
  p3: PERIODS.THIRD_PERIOD,
  "1st_5_innings": PERIODS.FIRST_FIVE_INNINGS,
};

/**
 * Splits a provider market key like "totals_h1" into its base key ("totals")
 * and canonical period. Keys with no recognized suffix are full-game.
 */
export function parsePeriodFromMarketKey(providerMarketKey: string): {
  baseMarketKey: string;
  period: Period;
} {
  for (const [suffix, period] of Object.entries(SUFFIX_TO_PERIOD)) {
    const marker = `_${suffix}`;
    if (providerMarketKey.endsWith(marker)) {
      return { baseMarketKey: providerMarketKey.slice(0, -marker.length), period };
    }
  }
  return { baseMarketKey: providerMarketKey, period: PERIODS.FULL_GAME };
}

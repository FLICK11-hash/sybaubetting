export interface SeedLeague {
  name: string;
  abbreviation: string;
  countryCode: string;
  /** The Odds API sport key for game-level odds. */
  theOddsApiKey: string;
  /** The Odds API sport key for futures/outrights (null if not modeled). */
  theOddsApiFuturesKey: string | null;
}

export interface SeedSport {
  name: string;
  slug: string;
  leagues: SeedLeague[];
}

export const SPORTS: SeedSport[] = [
  {
    name: "Basketball",
    slug: "basketball",
    leagues: [
      {
        name: "NBA",
        abbreviation: "NBA",
        countryCode: "US",
        theOddsApiKey: "basketball_nba",
        theOddsApiFuturesKey: "basketball_nba_championship_winner",
      },
    ],
  },
  {
    name: "American Football",
    slug: "american_football",
    leagues: [
      {
        name: "NFL",
        abbreviation: "NFL",
        countryCode: "US",
        theOddsApiKey: "americanfootball_nfl",
        theOddsApiFuturesKey: "americanfootball_nfl_super_bowl_winner",
      },
    ],
  },
  {
    name: "Baseball",
    slug: "baseball",
    leagues: [
      {
        name: "MLB",
        abbreviation: "MLB",
        countryCode: "US",
        theOddsApiKey: "baseball_mlb",
        theOddsApiFuturesKey: "baseball_mlb_world_series_winner",
      },
    ],
  },
  {
    name: "Ice Hockey",
    slug: "ice_hockey",
    leagues: [
      {
        name: "NHL",
        abbreviation: "NHL",
        countryCode: "US",
        theOddsApiKey: "icehockey_nhl",
        theOddsApiFuturesKey: "icehockey_nhl_championship_winner",
      },
    ],
  },
  {
    name: "Soccer",
    slug: "soccer",
    leagues: [
      {
        name: "English Premier League",
        abbreviation: "EPL",
        countryCode: "GB",
        theOddsApiKey: "soccer_epl",
        theOddsApiFuturesKey: "soccer_epl_winner",
      },
    ],
  },
];

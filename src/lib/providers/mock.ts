import {
  ListEventOddsParams,
  ListFuturesOddsParams,
  ListPlayerPropOddsParams,
  OddsProvider,
  ProviderEventOdds,
  ProviderSportSummary,
  RateLimitInfo,
} from "./types";

/**
 * Deterministic in-memory provider used for local development without an
 * odds API key, and as the default provider in integration tests. Ships a
 * small but realistic NBA slate (moneyline/spread/total + one player prop
 * market + one futures market) across several sportsbooks so the full
 * pipeline (normalization -> snapshots -> best price -> EV -> arbitrage) is
 * exercisable end-to-end offline.
 */
export class MockOddsProvider implements OddsProvider {
  readonly slug = "mock-provider";
  readonly name = "Mock Odds Provider";

  getLastRateLimitInfo(): RateLimitInfo {
    return { requestsRemaining: 500, requestsUsed: 0 };
  }

  async listSports(): Promise<ProviderSportSummary[]> {
    return [
      { key: "basketball_nba", title: "NBA", group: "Basketball", active: true, hasOutrights: false },
      { key: "americanfootball_nfl", title: "NFL", group: "American Football", active: true, hasOutrights: false },
    ];
  }

  async listEventOdds(params: ListEventOddsParams): Promise<ProviderEventOdds[]> {
    if (params.sportKey !== "basketball_nba") return [];

    const commenceTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    return [
      {
        id: "mock-event-lakers-celtics",
        sportKey: "basketball_nba",
        commenceTime,
        homeTeam: "Boston Celtics",
        awayTeam: "Los Angeles Lakers",
        bookmakers: [
          book("draftkings", "DraftKings", [
            market("h2h", [
              { name: "Boston Celtics", price: -150 },
              { name: "Los Angeles Lakers", price: 130 },
            ]),
            market("spreads", [
              { name: "Boston Celtics", price: -110, point: -3.5 },
              { name: "Los Angeles Lakers", price: -110, point: 3.5 },
            ]),
            market("totals", [
              { name: "Over", price: -110, point: 221.5 },
              { name: "Under", price: -110, point: 221.5 },
            ]),
          ]),
          book("fanduel", "FanDuel", [
            market("h2h", [
              { name: "Boston Celtics", price: -145 },
              { name: "Los Angeles Lakers", price: 125 },
            ]),
            market("spreads", [
              { name: "Boston Celtics", price: -108, point: -3.5 },
              { name: "Los Angeles Lakers", price: -112, point: 3.5 },
            ]),
            market("totals", [
              { name: "Over", price: 100, point: 221.5 },
              { name: "Under", price: -120, point: 221.5 },
            ]),
          ]),
          book("betmgm", "BetMGM", [
            market("h2h", [
              { name: "Boston Celtics", price: -160 },
              { name: "Los Angeles Lakers", price: 135 },
            ]),
            market("spreads", [
              { name: "Boston Celtics", price: -105, point: -3.5 },
              { name: "Los Angeles Lakers", price: -115, point: 3.5 },
            ]),
            market("totals", [
              { name: "Over", price: -105, point: 221.5 },
              { name: "Under", price: -115, point: 221.5 },
            ]),
          ]),
        ],
      },
    ];
  }

  async listPlayerPropOdds(params: ListPlayerPropOddsParams): Promise<ProviderEventOdds | null> {
    if (params.eventId !== "mock-event-lakers-celtics") return null;
    const commenceTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    return {
      id: "mock-event-lakers-celtics",
      sportKey: "basketball_nba",
      commenceTime,
      homeTeam: "Boston Celtics",
      awayTeam: "Los Angeles Lakers",
      bookmakers: [
        book("draftkings", "DraftKings", [
          market("player_points", [
            { name: "Over", price: -115, point: 25.5, description: "LeBron James" },
            { name: "Under", price: -105, point: 25.5, description: "LeBron James" },
          ]),
        ]),
        book("fanduel", "FanDuel", [
          market("player_points", [
            { name: "Over", price: 100, point: 25.5, description: "LeBron James" },
            { name: "Under", price: -130, point: 25.5, description: "LeBron James" },
          ]),
        ]),
        book("betmgm", "BetMGM", [
          market("player_points", [
            // Different line on purpose: must NOT be compared directly with the 25.5 line above.
            { name: "Over", price: -110, point: 26.5, description: "LeBron James" },
            { name: "Under", price: -110, point: 26.5, description: "LeBron James" },
          ]),
        ]),
      ],
    };
  }

  async listFuturesOdds(params: ListFuturesOddsParams): Promise<ProviderEventOdds[]> {
    if (params.sportKey !== "basketball_nba_championship_winner") return [];
    const commenceTime = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    return [
      {
        id: "mock-future-nba-champion",
        sportKey: params.sportKey,
        commenceTime,
        homeTeam: "",
        awayTeam: "",
        bookmakers: [
          book("draftkings", "DraftKings", [
            market("outrights", [
              { name: "Boston Celtics", price: 450 },
              { name: "Denver Nuggets", price: 700 },
            ]),
          ]),
          book("fanduel", "FanDuel", [
            market("outrights", [
              { name: "Boston Celtics", price: 425 },
              { name: "Denver Nuggets", price: 750 },
            ]),
          ]),
        ],
      },
    ];
  }
}

function book(
  key: string,
  title: string,
  markets: ReturnType<typeof market>[]
): ProviderEventOdds["bookmakers"][number] {
  return { key, title, lastUpdate: new Date().toISOString(), markets };
}

function market(
  key: string,
  outcomes: Array<{ name: string; price: number; point?: number; description?: string }>
) {
  return {
    key,
    lastUpdate: new Date().toISOString(),
    outcomes: outcomes.map((o) => ({
      name: o.name,
      price: o.price,
      point: o.point ?? null,
      description: o.description ?? null,
    })),
  };
}

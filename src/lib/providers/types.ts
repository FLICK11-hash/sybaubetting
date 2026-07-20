/**
 * Provider abstraction. Every odds API integration (The Odds API today;
 * SportsGameOdds, SportsDataIO, etc. later) implements `OddsProvider`. No
 * code outside `src/lib/providers/*` should know which HTTP API is behind
 * the data — the normalization layer and worker only ever talk to this
 * interface, so adding a second provider means adding one new file plus a
 * registry entry, never touching the rest of the app.
 *
 * All external identifiers (provider sport/event/bookmaker/market keys) are
 * kept as opaque strings here and resolved against the `provider_*` mapping
 * tables during normalization — they are never used as internal database
 * IDs.
 */

export interface ProviderSportSummary {
  /** Provider's own key for this sport/league, e.g. "basketball_nba". */
  key: string;
  title: string;
  group: string;
  active: boolean;
  hasOutrights: boolean;
}

export interface ProviderOutcomeQuote {
  /** Team name, "Over"/"Under", or player name depending on market. */
  name: string;
  price: number;
  /** Line value (spread/total/prop threshold). Absent for moneyline/outrights. */
  point?: number | null;
  /** Present on player-prop outcomes: the player's name as the provider spells it. */
  description?: string | null;
}

export interface ProviderMarketQuote {
  /** Provider's market key, e.g. "h2h", "spreads", "totals", "player_points". */
  key: string;
  lastUpdate: string;
  outcomes: ProviderOutcomeQuote[];
}

export interface ProviderBookmakerQuote {
  /** Provider's bookmaker key, e.g. "draftkings". */
  key: string;
  title: string;
  lastUpdate: string;
  markets: ProviderMarketQuote[];
}

export interface ProviderEventOdds {
  /** Provider's event id — opaque, mapped via provider_events. */
  id: string;
  sportKey: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  bookmakers: ProviderBookmakerQuote[];
}

export interface ProviderEventSummary {
  id: string;
  sportKey: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
}

export type OddsFormat = "american" | "decimal";

export interface ListEventOddsParams {
  sportKey: string;
  /** Provider region codes, e.g. ["us", "us2"]. */
  regions?: string[];
  /** Provider market keys, e.g. ["h2h", "spreads", "totals"]. */
  markets?: string[];
  oddsFormat?: OddsFormat;
}

export interface ListPlayerPropOddsParams {
  sportKey: string;
  eventId: string;
  markets: string[];
  regions?: string[];
  oddsFormat?: OddsFormat;
}

export interface ListFuturesOddsParams {
  /** Provider "outright" sport key, e.g. "basketball_nba_championship_winner". */
  sportKey: string;
  regions?: string[];
  oddsFormat?: OddsFormat;
}

export interface RateLimitInfo {
  requestsRemaining: number | null;
  requestsUsed: number | null;
}

/** Every odds provider integration implements this interface. */
export interface OddsProvider {
  readonly slug: string;
  readonly name: string;

  /** Sports/leagues the provider currently offers. */
  listSports(): Promise<ProviderSportSummary[]>;

  /** Upcoming/live events with game-level odds (moneyline, spread, total). */
  listEventOdds(params: ListEventOddsParams): Promise<ProviderEventOdds[]>;

  /** Player prop odds for one specific event (most providers require per-event calls for props). */
  listPlayerPropOdds(params: ListPlayerPropOddsParams): Promise<ProviderEventOdds | null>;

  /** Futures/outright markets for a league (e.g. championship winner). */
  listFuturesOdds(params: ListFuturesOddsParams): Promise<ProviderEventOdds[]>;

  /** Rate-limit info from the most recent response, if the provider exposes it. */
  getLastRateLimitInfo(): RateLimitInfo;
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

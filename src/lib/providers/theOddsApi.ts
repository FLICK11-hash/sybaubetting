import { fetchWithRetry } from "./httpClient";
import {
  ListEventOddsParams,
  ListFuturesOddsParams,
  ListPlayerPropOddsParams,
  OddsFormat,
  OddsProvider,
  ProviderEventOdds,
  ProviderRequestError,
  ProviderSportSummary,
  RateLimitInfo,
} from "./types";

const DEFAULT_BASE_URL = "https://api.the-odds-api.com/v4";

// --- Raw response shapes from The Odds API (v4) ---------------------------

interface RawSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

interface RawOutcome {
  name: string;
  price: number;
  point?: number;
  description?: string;
}

interface RawMarket {
  key: string;
  last_update: string;
  outcomes: RawOutcome[];
}

interface RawBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: RawMarket[];
}

interface RawEventOdds {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: RawBookmaker[];
}

function mapEventOdds(raw: RawEventOdds): ProviderEventOdds {
  return {
    id: raw.id,
    sportKey: raw.sport_key,
    commenceTime: raw.commence_time,
    homeTeam: raw.home_team,
    awayTeam: raw.away_team,
    bookmakers: raw.bookmakers.map((bm) => ({
      key: bm.key,
      title: bm.title,
      lastUpdate: bm.last_update,
      markets: bm.markets.map((m) => ({
        key: m.key,
        lastUpdate: m.last_update,
        outcomes: m.outcomes.map((o) => ({
          name: o.name,
          price: o.price,
          point: o.point ?? null,
          description: o.description ?? null,
        })),
      })),
    })),
  };
}

export interface TheOddsApiConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Provider implementation for https://the-odds-api.com. The API key is
 * always supplied server-side (worker or a Next.js API route) via
 * `process.env.ODDS_API_KEY` — never sent to or read from the browser.
 */
export class TheOddsApiProvider implements OddsProvider {
  readonly slug = "the-odds-api";
  readonly name = "The Odds API";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private lastRateLimit: RateLimitInfo = { requestsRemaining: null, requestsUsed: null };

  constructor(config: TheOddsApiConfig) {
    if (!config.apiKey) {
      throw new Error("TheOddsApiProvider requires an apiKey");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  getLastRateLimitInfo(): RateLimitInfo {
    return this.lastRateLimit;
  }

  private async request<T>(path: string, query: Record<string, string | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("apiKey", this.apiKey);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const response = await fetchWithRetry(
      url.toString(),
      { headers: { Accept: "application/json" } },
      { fetchImpl: this.fetchImpl }
    );

    const remaining = response.headers.get("x-requests-remaining");
    const used = response.headers.get("x-requests-used");
    this.lastRateLimit = {
      requestsRemaining: remaining !== null ? Number(remaining) : null,
      requestsUsed: used !== null ? Number(used) : null,
    };

    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderRequestError("Failed to parse The Odds API response as JSON");
    }
  }

  async listSports(): Promise<ProviderSportSummary[]> {
    const raw = await this.request<RawSport[]>("/sports", {});
    return raw.map((s) => ({
      key: s.key,
      title: s.title,
      group: s.group,
      active: s.active,
      hasOutrights: s.has_outrights,
    }));
  }

  async listEventOdds(params: ListEventOddsParams): Promise<ProviderEventOdds[]> {
    const raw = await this.request<RawEventOdds[]>(`/sports/${params.sportKey}/odds`, {
      regions: (params.regions ?? ["us"]).join(","),
      markets: (params.markets ?? ["h2h", "spreads", "totals"]).join(","),
      oddsFormat: toOddsFormatParam(params.oddsFormat ?? "american"),
      dateFormat: "iso",
    });
    return raw.map(mapEventOdds);
  }

  async listPlayerPropOdds(params: ListPlayerPropOddsParams): Promise<ProviderEventOdds | null> {
    try {
      const raw = await this.request<RawEventOdds>(
        `/sports/${params.sportKey}/events/${params.eventId}/odds`,
        {
          regions: (params.regions ?? ["us"]).join(","),
          markets: params.markets.join(","),
          oddsFormat: toOddsFormatParam(params.oddsFormat ?? "american"),
          dateFormat: "iso",
        }
      );
      return mapEventOdds(raw);
    } catch (err) {
      // The Odds API returns 404/422 when an event has no props posted yet
      // (common well before game time) — treat as "no data" rather than a
      // hard failure so the worker keeps processing other events.
      if (err instanceof ProviderRequestError && err.status && [404, 422].includes(err.status)) {
        return null;
      }
      throw err;
    }
  }

  async listFuturesOdds(params: ListFuturesOddsParams): Promise<ProviderEventOdds[]> {
    const raw = await this.request<RawEventOdds[]>(`/sports/${params.sportKey}/odds`, {
      regions: (params.regions ?? ["us"]).join(","),
      markets: "outrights",
      oddsFormat: toOddsFormatParam(params.oddsFormat ?? "american"),
      dateFormat: "iso",
    });
    return raw.map(mapEventOdds);
  }
}

function toOddsFormatParam(format: OddsFormat): string {
  return format;
}

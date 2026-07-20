import { describe, it, expect, vi } from "vitest";
import { TheOddsApiProvider } from "@/lib/providers/theOddsApi";
import sportsFixture from "../fixtures/theOddsApi.sports.json";
import eventOddsFixture from "../fixtures/theOddsApi.eventOdds.json";
import playerPropsFixture from "../fixtures/theOddsApi.playerProps.json";

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("TheOddsApiProvider", () => {
  it("lists sports and maps snake_case fields to camelCase", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sportsFixture));
    const provider = new TheOddsApiProvider({ apiKey: "test-key", fetchImpl });

    const sports = await provider.listSports();

    expect(fetchImpl).toHaveBeenCalledOnce();
    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/v4/sports");
    expect(calledUrl.searchParams.get("apiKey")).toBe("test-key");

    expect(sports).toHaveLength(3);
    expect(sports[0]).toEqual({
      key: "basketball_nba",
      title: "NBA",
      group: "Basketball",
      active: true,
      hasOutrights: false,
    });
  });

  it("lists event odds with the requested regions/markets/format", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(eventOddsFixture));
    const provider = new TheOddsApiProvider({ apiKey: "test-key", fetchImpl });

    const events = await provider.listEventOdds({
      sportKey: "basketball_nba",
      regions: ["us"],
      markets: ["h2h", "spreads", "totals"],
    });

    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/v4/sports/basketball_nba/odds");
    expect(calledUrl.searchParams.get("regions")).toBe("us");
    expect(calledUrl.searchParams.get("markets")).toBe("h2h,spreads,totals");

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("abc123externaleventid");
    expect(events[0].bookmakers).toHaveLength(2);
    expect(events[0].bookmakers[0].markets[0].outcomes[0]).toEqual({
      name: "Boston Celtics",
      price: -150,
      point: null,
      description: null,
    });
  });

  it("captures rate limit headers from the response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(sportsFixture, { headers: { "x-requests-remaining": "487", "x-requests-used": "13" } })
    );
    const provider = new TheOddsApiProvider({ apiKey: "test-key", fetchImpl });

    await provider.listSports();

    expect(provider.getLastRateLimitInfo()).toEqual({ requestsRemaining: 487, requestsUsed: 13 });
  });

  it("parses player prop outcomes including the player name in `description`", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(playerPropsFixture));
    const provider = new TheOddsApiProvider({ apiKey: "test-key", fetchImpl });

    const result = await provider.listPlayerPropOdds({
      sportKey: "basketball_nba",
      eventId: "abc123externaleventid",
      markets: ["player_points"],
    });

    expect(result).not.toBeNull();
    const dkOutcome = result!.bookmakers[0].markets[0].outcomes[0];
    expect(dkOutcome).toEqual({ name: "Over", price: -115, point: 25.5, description: "LeBron James" });

    // Different books quoting different lines for the same player/market must be preserved as-is
    const dkLine = result!.bookmakers[0].markets[0].outcomes[0].point;
    const mgmLine = result!.bookmakers[2].markets[0].outcomes[0].point;
    expect(dkLine).not.toBe(mgmLine);
  });

  it("returns null (not an error) when player props aren't posted yet (404)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    const provider = new TheOddsApiProvider({ apiKey: "test-key", fetchImpl });

    const result = await provider.listPlayerPropOdds({
      sportKey: "basketball_nba",
      eventId: "no-props-yet",
      markets: ["player_points"],
    });

    expect(result).toBeNull();
  });

  it("retries on a 503 and succeeds once the transient failure clears", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("service unavailable", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(sportsFixture));
    const provider = new TheOddsApiProvider({ apiKey: "test-key", fetchImpl });

    const sports = await provider.listSports();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sports).toHaveLength(3);
  });

  it("does not retry on a 401 (bad API key) and throws immediately", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const provider = new TheOddsApiProvider({ apiKey: "bad-key", fetchImpl });

    await expect(provider.listSports()).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws when constructed without an API key", () => {
    expect(() => new TheOddsApiProvider({ apiKey: "" })).toThrow();
  });
});

import type { PrismaClient } from "@prisma/client";
import { normalizeTeamName, normalizePlayerName, normalizeOutcomeLabel } from "./text";
import { classifyOutcomeType, OUTCOME_TYPES } from "./outcomeTypes";
import type { ProviderEventOdds, ProviderMarketQuote } from "../providers/types";

export class NormalizationError extends Error {}

// Reconciles minor start-time drift between providers/polls reporting the
// same real game (see the cross-provider test below, ~20 minutes apart).
// Deliberately much shorter than the gap between two games of a same-day
// doubleheader (MLB games are the common case, typically 3+ hours apart) --
// a wider window would merge Game 1 and Game 2 between the same two teams
// into a single Event, mixing two different games' odds into one market.
const EVENT_START_TIME_TOLERANCE_MS = 60 * 60 * 1000;

export interface ResolvedOutcomeTarget {
  marketId: number;
  marketLineId: number;
  outcomeId: number;
  sportsbookId: number;
}

/**
 * Turns raw provider odds into internal Market/MarketLine/Outcome rows,
 * de-duplicating against existing rows by natural key so re-ingesting the
 * same market never creates a second copy. This is the "most important
 * backend responsibility" described in the brief: equivalent markets across
 * providers/sportsbooks only ever resolve to a single internal Market.
 *
 * Team and player resolution are both lenient: an unseen team or player is
 * created on first sighting (same as OddsJam-style tools discover new
 * entities from the odds feed itself), rather than requiring an exhaustive
 * pre-seeded roster. Real leagues change constantly — promotion/relegation,
 * expansion teams, mid-season rebrands (the NHL's Utah Mammoth, formerly
 * the Arizona Coyotes, is a real example) — so hand-maintaining a complete,
 * always-current roster per league is a losing battle. `seedData/` still
 * ships small curated rosters for the sample dashboard data, but they are a
 * starting point, not a gate: any team a real provider reports gets created
 * automatically and its provider mapping cached for next time.
 */
export class MarketMatcher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly apiProviderId: number
  ) {}

  async resolveSportsbook(externalSportsbookId: string): Promise<number | null> {
    const mapping = await this.prisma.providerSportsbook.findUnique({
      where: {
        apiProviderId_externalSportsbookId: {
          apiProviderId: this.apiProviderId,
          externalSportsbookId,
        },
      },
      include: { sportsbook: true },
    });
    if (!mapping || !mapping.sportsbook.active) return null;
    return mapping.sportsbookId;
  }

  async resolveTeam(leagueId: number, externalTeamName: string): Promise<number> {
    const existingMapping = await this.prisma.providerTeam.findUnique({
      where: {
        apiProviderId_externalTeamName: {
          apiProviderId: this.apiProviderId,
          externalTeamName,
        },
      },
    });
    if (existingMapping) return existingMapping.teamId;

    const normalizedTarget = normalizeTeamName(externalTeamName);
    const candidates = await this.prisma.team.findMany({ where: { leagueId } });
    let team = candidates.find((t) => {
      const candidatesToCheck = [t.name, `${t.city ?? ""} ${t.name}`.trim(), t.abbreviation ?? ""];
      return candidatesToCheck.some((c) => c && normalizeTeamName(c) === normalizedTarget);
    });

    if (!team) {
      team = await this.prisma.team.create({
        data: { leagueId, name: externalTeamName },
      });
    }

    await this.prisma.providerTeam.create({
      data: { apiProviderId: this.apiProviderId, teamId: team.id, externalTeamName },
    });
    return team.id;
  }

  /**
   * Best-effort team resolution that returns null instead of throwing.
   * resolveTeam() no longer throws for an unseen team (it auto-creates),
   * so this only guards against genuine unexpected errors (e.g. a
   * transient DB failure) — kept for callers like futures entrant
   * resolution that shouldn't abort the whole ingest over one bad row.
   */
  async tryResolveTeam(leagueId: number, externalTeamName: string): Promise<number | null> {
    try {
      return await this.resolveTeam(leagueId, externalTeamName);
    } catch {
      return null;
    }
  }

  async resolvePlayer(externalPlayerName: string, currentTeamId?: number | null): Promise<number> {
    const existingMapping = await this.prisma.providerPlayer.findUnique({
      where: {
        apiProviderId_externalPlayerName: {
          apiProviderId: this.apiProviderId,
          externalPlayerName,
        },
      },
    });
    if (existingMapping) return existingMapping.playerId;

    const normalizedName = normalizePlayerName(externalPlayerName);
    let player = await this.prisma.player.findFirst({ where: { normalizedName } });

    if (!player) {
      player = await this.prisma.player.create({
        data: { name: externalPlayerName, normalizedName, currentTeamId: currentTeamId ?? null },
      });
    }

    await this.prisma.providerPlayer.create({
      data: { apiProviderId: this.apiProviderId, playerId: player.id, externalPlayerName },
    });
    return player.id;
  }

  async resolveMarketTypeId(code: string): Promise<number> {
    const marketType = await this.prisma.marketType.findUnique({ where: { code } });
    if (!marketType) {
      throw new NormalizationError(
        `Market type "${code}" is not seeded. Add it to MARKET_TYPE_CATALOG and re-run the seed.`
      );
    }
    return marketType.id;
  }

  /**
   * Resolve (or create) the internal Event for a provider event, matching
   * on the provider's own event id first, then falling back to the
   * (league, home team, away team, approximate start time) natural key so
   * the same game reported by two different providers still resolves to
   * one Event.
   */
  async resolveEvent(
    leagueId: number,
    providerEvent: Pick<ProviderEventOdds, "id" | "commenceTime" | "homeTeam" | "awayTeam">
  ): Promise<{ eventId: number; homeTeamId: number; awayTeamId: number }> {
    const existingMapping = await this.prisma.providerEvent.findUnique({
      where: { apiProviderId_externalEventId: { apiProviderId: this.apiProviderId, externalEventId: providerEvent.id } },
      include: { event: true },
    });
    if (existingMapping) {
      return {
        eventId: existingMapping.eventId,
        homeTeamId: existingMapping.event.homeTeamId,
        awayTeamId: existingMapping.event.awayTeamId,
      };
    }

    const homeTeamId = await this.resolveTeam(leagueId, providerEvent.homeTeam);
    const awayTeamId = await this.resolveTeam(leagueId, providerEvent.awayTeam);
    const startTime = new Date(providerEvent.commenceTime);

    const nearbyEvents = await this.prisma.event.findMany({
      where: { leagueId, homeTeamId, awayTeamId },
    });
    let event = nearbyEvents.find(
      (e) => Math.abs(e.startTime.getTime() - startTime.getTime()) <= EVENT_START_TIME_TOLERANCE_MS
    );

    if (!event) {
      const homeTeam = await this.prisma.team.findUniqueOrThrow({ where: { id: homeTeamId } });
      const awayTeam = await this.prisma.team.findUniqueOrThrow({ where: { id: awayTeamId } });
      event = await this.prisma.event.create({
        data: {
          leagueId,
          homeTeamId,
          awayTeamId,
          name: `${awayTeam.name} @ ${homeTeam.name}`,
          startTime,
        },
      });
    }

    await this.prisma.providerEvent.create({
      data: { apiProviderId: this.apiProviderId, eventId: event.id, externalEventId: providerEvent.id },
    });

    return { eventId: event.id, homeTeamId, awayTeamId };
  }

  async upsertMarket(params: {
    eventId?: number | null;
    leagueId: number;
    marketTypeId: number;
    playerId?: number | null;
    teamId?: number | null;
    title: string;
    period: string;
  }): Promise<number> {
    const where = {
      eventId: params.eventId ?? null,
      leagueId: params.leagueId,
      marketTypeId: params.marketTypeId,
      playerId: params.playerId ?? null,
      teamId: params.teamId ?? null,
      period: params.period,
    };
    const existing = await this.prisma.market.findFirst({ where });
    if (existing) return existing.id;

    const created = await this.prisma.market.create({
      data: { ...where, title: params.title },
    });
    return created.id;
  }

  async upsertMarketLine(params: {
    marketId: number;
    lineValue: number | null;
    handicapTeamId?: number | null;
  }): Promise<number> {
    const lineValueDecimal =
      params.lineValue === null ? null : (Math.round(params.lineValue * 1000) / 1000).toString();

    const existing = await this.prisma.marketLine.findFirst({
      where: {
        marketId: params.marketId,
        lineValue: lineValueDecimal,
        handicapTeamId: params.handicapTeamId ?? null,
      },
    });
    if (existing) return existing.id;

    const created = await this.prisma.marketLine.create({
      data: {
        marketId: params.marketId,
        lineValue: lineValueDecimal,
        handicapTeamId: params.handicapTeamId ?? null,
      },
    });
    return created.id;
  }

  async upsertOutcome(params: {
    marketLineId: number;
    outcomeType: string;
    teamId?: number | null;
    playerId?: number | null;
    label: string;
  }): Promise<number> {
    const normalizedLabel = normalizeOutcomeLabel(params.label);
    const existing = await this.prisma.outcome.findFirst({
      where: { marketLineId: params.marketLineId, normalizedLabel },
    });
    if (existing) return existing.id;

    const created = await this.prisma.outcome.create({
      data: {
        marketLineId: params.marketLineId,
        outcomeType: params.outcomeType,
        teamId: params.teamId ?? null,
        playerId: params.playerId ?? null,
        label: params.label,
        normalizedLabel,
      },
    });
    return created.id;
  }

  /**
   * Resolve (creating as needed) the Market/MarketLine/Outcome chain for one
   * provider market quote on one game event, for every outcome in that
   * quote. Returns one ResolvedOutcomeTarget per outcome so the caller
   * (worker) can attach a price/snapshot to each.
   */
  async resolveGameMarketOutcomes(params: {
    eventId: number;
    leagueId: number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeamName: string;
    awayTeamName: string;
    marketTypeId: number;
    marketTypeName: string;
    period: string;
    sportsbookId: number;
    quote: ProviderMarketQuote;
  }): Promise<ResolvedOutcomeTarget[]> {
    const results: ResolvedOutcomeTarget[] = [];

    // Group outcomes by line value first — each distinct line is a separate
    // MarketLine (e.g. spread posted at -3.5 by one book and -4 by another
    // still share the market, but never share a line).
    const byLine = new Map<string, typeof params.quote.outcomes>();
    for (const outcome of params.quote.outcomes) {
      const key = outcome.point ?? "null";
      const bucket = byLine.get(String(key)) ?? [];
      bucket.push(outcome);
      byLine.set(String(key), bucket);
    }

    const marketId = await this.upsertMarket({
      eventId: params.eventId,
      leagueId: params.leagueId,
      marketTypeId: params.marketTypeId,
      title: `${params.awayTeamName} @ ${params.homeTeamName} ${params.marketTypeName}`,
      period: params.period,
    });

    for (const [, outcomes] of byLine) {
      for (const outcome of outcomes) {
        const outcomeType = classifyOutcomeType({
          outcomeName: outcome.name,
          homeTeamName: params.homeTeamName,
          awayTeamName: params.awayTeamName,
        });
        const teamId =
          outcomeType === OUTCOME_TYPES.HOME
            ? params.homeTeamId
            : outcomeType === OUTCOME_TYPES.AWAY
              ? params.awayTeamId
              : null;

        // handicapTeamId only means something when there's an actual line
        // (spread). Moneyline has no point value, so both teams' outcomes
        // must share a single MarketLine (null, null) — exactly like Totals
        // shares one line between Over and Under — rather than splintering
        // into one line per team.
        const handicapTeamId = outcome.point != null ? teamId : null;

        const marketLineId = await this.upsertMarketLine({
          marketId,
          lineValue: outcome.point ?? null,
          handicapTeamId,
        });

        const outcomeId = await this.upsertOutcome({
          marketLineId,
          outcomeType,
          teamId,
          label: outcome.name,
        });

        results.push({ marketId, marketLineId, outcomeId, sportsbookId: params.sportsbookId });
      }
    }

    return results;
  }

  /** Same as resolveGameMarketOutcomes but for a player-prop market (one player subject, over/under outcomes). */
  async resolvePlayerPropOutcomes(params: {
    eventId: number;
    leagueId: number;
    playerId: number;
    playerName: string;
    marketTypeId: number;
    marketTypeName: string;
    period: string;
    sportsbookId: number;
    quote: ProviderMarketQuote;
  }): Promise<ResolvedOutcomeTarget[]> {
    const results: ResolvedOutcomeTarget[] = [];

    const marketId = await this.upsertMarket({
      eventId: params.eventId,
      leagueId: params.leagueId,
      marketTypeId: params.marketTypeId,
      playerId: params.playerId,
      title: `${params.playerName} ${params.marketTypeName}`,
      period: params.period,
    });

    for (const outcome of params.quote.outcomes) {
      const outcomeType = classifyOutcomeType({ outcomeName: outcome.name });

      const marketLineId = await this.upsertMarketLine({
        marketId,
        lineValue: outcome.point ?? null,
      });

      const outcomeId = await this.upsertOutcome({
        marketLineId,
        outcomeType,
        playerId: params.playerId,
        label: outcome.name,
      });

      results.push({ marketId, marketLineId, outcomeId, sportsbookId: params.sportsbookId });
    }

    return results;
  }

  /** Futures market: one MarketLine (no numeric line), one Outcome per entrant. */
  async resolveFuturesOutcomes(params: {
    leagueId: number;
    marketTypeId: number;
    title: string;
    sportsbookId: number;
    quote: ProviderMarketQuote;
  }): Promise<ResolvedOutcomeTarget[]> {
    const results: ResolvedOutcomeTarget[] = [];

    const marketId = await this.upsertMarket({
      eventId: null,
      leagueId: params.leagueId,
      marketTypeId: params.marketTypeId,
      title: params.title,
      period: "full_game",
    });
    const marketLineId = await this.upsertMarketLine({ marketId, lineValue: null });

    for (const outcome of params.quote.outcomes) {
      const teamId = await this.tryResolveTeam(params.leagueId, outcome.name);
      const outcomeId = await this.upsertOutcome({
        marketLineId,
        outcomeType: OUTCOME_TYPES.SELECTION,
        teamId,
        label: outcome.name,
      });
      results.push({ marketId, marketLineId, outcomeId, sportsbookId: params.sportsbookId });
    }

    return results;
  }
}

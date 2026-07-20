"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { Card, LoadingState, ErrorState, EmptyState, Badge, EvValue } from "@/components/ui";
import { LogBetButton } from "@/components/LogBetButton";
import { formatAmericanOdds, formatDecimalOdds, formatProbability, formatRelativeTime } from "@/lib/format";

interface OddsRow {
  outcomeId: number;
  event: { id: number; name: string; startTime: string; status: string } | null;
  market: { id: number; title: string; period: string; typeCode: string; typeName: string };
  subject: { type: string; id: number | null; name: string | null };
  outcome: { label: string; outcomeType: string };
  line: number | null;
  bestSportsbook: { id: number; name: string; slug: string } | null;
  bestAmericanOdds: number | null;
  bestDecimalOdds: number | null;
  consensusDecimalOdds: number | null;
  fairProbability: number | null;
  expectedValuePercent: number | null;
  outlierScore: number | null;
  isBestPrice: boolean;
  lastUpdated: string | null;
}

interface SportsResponse {
  sports: { id: number; name: string; slug: string; active: boolean; leagues: { id: number; name: string; active: boolean }[] }[];
}
interface SportsbooksResponse {
  sportsbooks: { id: number; name: string; slug: string; active: boolean }[];
}
interface MarketTypesResponse {
  marketTypes: { id: number; code: string; name: string; category: string }[];
}

export default function OddsComparisonPage() {
  const [sport, setSport] = useState("");
  const [league, setLeague] = useState("");
  const [marketType, setMarketType] = useState("");
  const [sportsbook, setSportsbook] = useState("");
  const [minOdds, setMinOdds] = useState("");
  const [minEv, setMinEv] = useState("");
  const [player, setPlayer] = useState("");
  const [live, setLive] = useState<"" | "true" | "false">("");

  const { data: sportsData } = useFetch<SportsResponse>("/api/sports");
  const { data: sportsbooksData } = useFetch<SportsbooksResponse>("/api/sportsbooks");
  const { data: marketTypesData } = useFetch<MarketTypesResponse>("/api/market-types");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (sport) params.set("sport", sport);
    if (league) params.set("league", league);
    if (marketType) params.set("marketType", marketType);
    if (sportsbook) params.set("sportsbook", sportsbook);
    if (minOdds) params.set("minOdds", minOdds);
    if (minEv) params.set("minEv", minEv);
    if (player) params.set("player", player);
    if (live) params.set("live", live);
    return params.toString();
  }, [sport, league, marketType, sportsbook, minOdds, minEv, player, live]);

  const { data, loading, error } = useFetch<{ rows: OddsRow[] }>(`/api/odds?${query}`, [query]);

  const leaguesForSport = sportsData?.sports.find((s) => s.slug === sport)?.leagues ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Odds Comparison</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Best price, consensus, fair probability, and EV for every tracked outcome.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <select
            className="filter-input"
            value={sport}
            onChange={(e) => {
              setSport(e.target.value);
              setLeague("");
            }}
          >
            <option value="">All sports</option>
            {sportsData?.sports.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>

          <select className="filter-input" value={league} onChange={(e) => setLeague(e.target.value)} disabled={!sport}>
            <option value="">All leagues</option>
            {leaguesForSport.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <select className="filter-input" value={marketType} onChange={(e) => setMarketType(e.target.value)}>
            <option value="">All markets</option>
            {marketTypesData?.marketTypes.map((mt) => (
              <option key={mt.id} value={mt.code}>
                {mt.name}
              </option>
            ))}
          </select>

          <select className="filter-input" value={sportsbook} onChange={(e) => setSportsbook(e.target.value)}>
            <option value="">All sportsbooks</option>
            {sportsbooksData?.sportsbooks.map((sb) => (
              <option key={sb.id} value={sb.slug}>
                {sb.name}
              </option>
            ))}
          </select>

          <input
            className="filter-input"
            type="number"
            step="0.01"
            placeholder="Min decimal odds"
            value={minOdds}
            onChange={(e) => setMinOdds(e.target.value)}
          />
          <input
            className="filter-input"
            type="number"
            step="0.1"
            placeholder="Min EV %"
            value={minEv}
            onChange={(e) => setMinEv(e.target.value)}
          />
          <input
            className="filter-input"
            type="text"
            placeholder="Player name"
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
          />
          <select className="filter-input" value={live} onChange={(e) => setLive(e.target.value as "" | "true" | "false")}>
            <option value="">Pregame &amp; live</option>
            <option value="false">Pregame only</option>
            <option value="true">Live only</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {loading ? (
          <LoadingState label="Loading odds…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState message="No odds match these filters." />
        ) : (
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Market</th>
                <th className="px-3 py-2 font-medium">Player/Team</th>
                <th className="px-3 py-2 font-medium">Outcome</th>
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Best Book</th>
                <th className="px-3 py-2 font-medium">Best Odds</th>
                <th className="px-3 py-2 font-medium">Consensus</th>
                <th className="px-3 py-2 font-medium">Fair Prob.</th>
                <th className="px-3 py-2 font-medium">EV</th>
                <th className="px-3 py-2 font-medium">Outlier</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.rows.map((row) => (
                <tr key={row.outcomeId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-3 py-2">
                    {row.event ? (
                      <Link href={`/events/${row.event.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                        {row.event.name}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">Futures</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{row.market.typeName}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{row.subject.name ?? "—"}</td>
                  <td className="px-3 py-2">{row.outcome.label}</td>
                  <td className="px-3 py-2 tabular-nums">{row.line ?? "—"}</td>
                  <td className="px-3 py-2">{row.bestSportsbook?.name ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      {formatAmericanOdds(row.bestAmericanOdds)}
                      {row.isBestPrice && <Badge tone="positive">Best</Badge>}
                    </div>
                    <div className="text-xs text-zinc-400">{formatDecimalOdds(row.bestDecimalOdds)}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-300">
                    {formatDecimalOdds(row.consensusDecimalOdds)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatProbability(row.fairProbability)}</td>
                  <td className="px-3 py-2">
                    <EvValue value={row.expectedValuePercent} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.outlierScore !== null ? `${row.outlierScore > 0 ? "+" : ""}${row.outlierScore.toFixed(1)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-400">{formatRelativeTime(row.lastUpdated)}</td>
                  <td className="px-3 py-2">
                    {row.bestSportsbook && row.bestAmericanOdds !== null && (
                      <LogBetButton
                        outcomeId={row.outcomeId}
                        sportsbookId={row.bestSportsbook.id}
                        americanOdds={row.bestAmericanOdds}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

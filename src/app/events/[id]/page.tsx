"use client";

import { use, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { Card, CardHeader, LoadingState, ErrorState, Badge, EvValue } from "@/components/ui";
import { OddsHistoryChart } from "@/components/OddsHistoryChart";
import { LogBetButton } from "@/components/LogBetButton";
import { formatAmericanOdds, formatDecimalOdds, formatDateTime, formatProbability, formatRelativeTime } from "@/lib/format";

interface PriceRow {
  sportsbook: { id: number; name: string; slug: string };
  americanOdds: number;
  decimalOdds: number;
  impliedProbability: number;
  expectedValuePercent: number | null;
  outlierScore: number | null;
  isBestPrice: boolean;
  lastUpdated: string;
}

interface OutcomeDetail {
  outcomeId: number;
  label: string;
  outcomeType: string;
  consensusDecimalOdds: number | null;
  fairProbability: number | null;
  prices: PriceRow[];
}

interface MarketLineDetail {
  marketLineId: number;
  lineValue: number | null;
  outcomes: OutcomeDetail[];
}

interface MarketDetail {
  id: number;
  title: string;
  period: string;
  typeCode: string;
  typeName: string;
  subject: string | null;
  lines: MarketLineDetail[];
}

interface EventDetail {
  id: number;
  name: string;
  startTime: string;
  status: string;
  league: { id: number; name: string; sport: string };
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  markets: MarketDetail[];
}

interface HistoryResponse {
  label: string;
  history: { sportsbook: string; sportsbookId: number; americanOdds: number; decimalOdds: number; capturedAt: string }[];
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useFetch<EventDetail>(`/api/events/${id}`, [id]);
  const [selectedOutcome, setSelectedOutcome] = useState<{ outcomeId: number; label: string } | null>(null);
  const { data: history } = useFetch<HistoryResponse>(
    selectedOutcome ? `/api/outcomes/${selectedOutcome.outcomeId}/history` : null,
    [selectedOutcome?.outcomeId]
  );

  if (loading) return <LoadingState label="Loading event…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{data.league.sport}</span>
          <span>·</span>
          <span>{data.league.name}</span>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{data.name}</h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span>{formatDateTime(data.startTime)}</span>
          <Badge tone={data.status === "LIVE" ? "warning" : "neutral"}>{data.status}</Badge>
        </div>
      </div>

      {selectedOutcome && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Odds history — {selectedOutcome.label}</h3>
            <button
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              onClick={() => setSelectedOutcome(null)}
            >
              Close
            </button>
          </div>
          <OddsHistoryChart history={history?.history ?? []} />
        </Card>
      )}

      <div className="space-y-4">
        {data.markets.map((market) => (
          <Card key={market.id}>
            <CardHeader
              title={market.subject ? `${market.subject} — ${market.typeName}` : market.typeName}
              action={<span className="text-xs text-zinc-400">{market.period.replace(/_/g, " ")}</span>}
            />
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {market.lines.map((line) => (
                <div key={line.marketLineId} className="px-4 py-3">
                  {line.lineValue !== null && (
                    <div className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Line: {line.lineValue}</div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {line.outcomes.map((outcome) => (
                      <div key={outcome.outcomeId} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                        <div className="mb-2 flex items-center justify-between">
                          <button
                            className="text-sm font-medium hover:underline"
                            onClick={() => setSelectedOutcome({ outcomeId: outcome.outcomeId, label: outcome.label })}
                          >
                            {outcome.label}
                          </button>
                          <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                            <div>Consensus {formatDecimalOdds(outcome.consensusDecimalOdds)}</div>
                            <div>Fair prob. {formatProbability(outcome.fairProbability)}</div>
                          </div>
                        </div>
                        <table className="w-full text-left text-xs">
                          <thead className="text-zinc-400">
                            <tr>
                              <th className="py-1 font-normal">Book</th>
                              <th className="py-1 font-normal">Odds</th>
                              <th className="py-1 font-normal">EV</th>
                              <th className="py-1 font-normal">Updated</th>
                              <th className="py-1 font-normal"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {outcome.prices.map((price) => (
                              <tr
                                key={price.sportsbook.id}
                                className={price.isBestPrice ? "bg-emerald-50 dark:bg-emerald-500/10" : ""}
                              >
                                <td className="py-1 pr-2">{price.sportsbook.name}</td>
                                <td className="py-1 pr-2 tabular-nums">
                                  {formatAmericanOdds(price.americanOdds)}
                                  {price.isBestPrice && <Badge tone="positive">Best</Badge>}
                                </td>
                                <td className="py-1 pr-2">
                                  <EvValue value={price.expectedValuePercent} />
                                </td>
                                <td className="py-1 text-zinc-400">{formatRelativeTime(price.lastUpdated)}</td>
                                <td className="py-1">
                                  <LogBetButton
                                    outcomeId={outcome.outcomeId}
                                    sportsbookId={price.sportsbook.id}
                                    americanOdds={price.americanOdds}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

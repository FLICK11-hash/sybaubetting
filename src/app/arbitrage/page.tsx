"use client";

import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { Card, CardHeader, LoadingState, ErrorState, EmptyState, Badge } from "@/components/ui";
import { formatAmericanOdds, formatCurrency, formatDateTime, formatPercent } from "@/lib/format";

interface ArbitrageLeg {
  sportsbook: string;
  outcome: string;
  americanOdds: number;
  decimalOdds: number;
  stakePercentage: number;
  suggestedStake: number;
}

interface ArbitrageRow {
  id: number;
  market: string;
  marketType: string;
  event: { id: number; name: string; startTime: string } | null;
  totalImpliedProbability: number;
  profitPercent: number;
  detectedAt: string;
  expiresAt: string;
  quoteAgeSeconds: number;
  legs: ArbitrageLeg[];
}

export default function ArbitragePage() {
  const [stake, setStake] = useState("1000");
  const { data, loading, error, refetch } = useFetch<{ stake: number; rows: ArbitrageRow[] }>(
    `/api/arbitrage?stake=${encodeURIComponent(stake || "1000")}`,
    [stake]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Arbitrage</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Guaranteed-profit opportunities across every outcome of a market. Stale quotes are excluded automatically.
          </p>
        </div>
        <label
          className="flex shrink-0 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
          style={{ whiteSpace: "nowrap" }}
        >
          Total stake
          <input
            className="filter-input w-32"
            type="number"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            onBlur={refetch}
          />
        </label>
      </div>

      {loading ? (
        <LoadingState label="Scanning for arbitrage…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState message="No active arbitrage opportunities right now." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.rows.map((row) => (
            <Card key={row.id}>
              <CardHeader
                title={row.event?.name ?? row.market}
                action={<Badge tone="positive">+{formatPercent(row.profitPercent * 100)} profit</Badge>}
              />
              <div className="space-y-2 px-4 py-3 text-sm">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {row.marketType} · {row.market}
                  {row.event && <> · {formatDateTime(row.event.startTime)}</>}
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-zinc-400">
                    <tr>
                      <th className="py-1 font-normal">Sportsbook</th>
                      <th className="py-1 font-normal">Outcome</th>
                      <th className="py-1 font-normal">Odds</th>
                      <th className="py-1 font-normal">Stake</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.legs.map((leg, i) => (
                      <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1.5 font-medium">{leg.sportsbook}</td>
                        <td className="py-1.5">{leg.outcome}</td>
                        <td className="py-1.5 tabular-nums">{formatAmericanOdds(leg.americanOdds)}</td>
                        <td className="py-1.5 tabular-nums">{formatCurrency(leg.suggestedStake)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between pt-1 text-xs text-zinc-400">
                  <span>Total implied probability {(row.totalImpliedProbability * 100).toFixed(2)}%</span>
                  <span>Quote age {row.quoteAgeSeconds}s</span>
                </div>
                {row.event && (
                  <Link href={`/events/${row.event.id}`} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                    View event →
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

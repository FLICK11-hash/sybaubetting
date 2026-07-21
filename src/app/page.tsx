"use client";

import Link from "next/link";
import { useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { Card, CardHeader, LoadingState, ErrorState, EmptyState, Badge, EvValue, Button } from "@/components/ui";
import { formatAmericanOdds, formatDateTime, formatPercent, formatRelativeTime } from "@/lib/format";

interface OpportunityRow {
  bettingOpportunityId: number;
  event: { id: number; name: string; startTime: string } | null;
  market: string;
  outcome: string;
  line: number | null;
  sportsbook: { id: number; name: string; slug: string };
  americanOdds: number;
  decimalOdds: number;
  expectedValuePercent: number | null;
  edgePercent: number | null;
  outlierScore: number | null;
  bestPriceInMarket: boolean;
  calculatedAt: string;
}

interface ArbitrageRow {
  id: number;
  market: string;
  event: { id: number; name: string } | null;
  totalImpliedProbability: number;
  profitPercent: number;
  expiresAt: string;
  legs: { sportsbook: string; americanOdds: number; decimalOdds: number; stakePercentage: number }[];
}

interface MarketRow {
  id: number;
  title: string;
  marketType: string;
  event: { id: number; name: string } | null;
  updatedAt: string;
}

interface DashboardData {
  lastWorkerRunAt: string | null;
  topExpectedValueOpportunities: OpportunityRow[];
  activeArbitrage: ArbitrageRow[];
  recentlyUpdatedMarkets: MarketRow[];
}

function OpportunityList({ rows, emptyMessage }: { rows: OpportunityRow[]; emptyMessage: string }) {
  if (rows.length === 0) return <EmptyState message={emptyMessage} />;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((row) => (
        <li key={row.bettingOpportunityId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium text-zinc-900 dark:text-zinc-50">
              {row.event ? (
                <Link href={`/events/${row.event.id}`} className="hover:underline">
                  {row.event.name}
                </Link>
              ) : (
                row.market
              )}
            </div>
            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {row.event ? `${formatDateTime(row.event.startTime)} · ` : ""}
              {row.market} · {row.outcome}
              {row.line !== null ? ` ${row.line}` : ""} · {row.sportsbook.name}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tabular-nums font-medium">{formatAmericanOdds(row.americanOdds)}</div>
            <EvValue value={row.expectedValuePercent} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { data, loading, error, refetch } = useFetch<DashboardData>("/api/dashboard");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function refreshOdds() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/worker/run", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Refresh failed with status ${res.status}`);
      }
      if (body.errors?.length > 0) {
        setRefreshError(body.errors[0]);
      }
      refetch();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Live snapshot of the best opportunities across every tracked sportsbook.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Button onClick={refreshOdds} disabled={refreshing} variant="secondary">
            {refreshing ? "Refreshing…" : "Refresh odds now"}
          </Button>
          <div className="mt-1 text-xs text-zinc-400">Last checked {formatRelativeTime(data.lastWorkerRunAt)}</div>
          {refreshError && <div className="mt-1 max-w-xs text-xs text-rose-600 dark:text-rose-400">{refreshError}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Top Positive EV Opportunities" />
          <OpportunityList rows={data.topExpectedValueOpportunities} emptyMessage="No positive EV opportunities right now." />
        </Card>

        <Card>
          <CardHeader title="Active Arbitrage Opportunities" action={<Link href="/arbitrage" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">View all</Link>} />
          {data.activeArbitrage.length === 0 ? (
            <EmptyState message="No active arbitrage opportunities." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.activeArbitrage.map((arb) => (
                <li key={arb.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium">{arb.event?.name ?? arb.market}</span>
                    <Badge tone="positive">+{formatPercent(arb.profitPercent * 100)}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {arb.legs.map((leg) => `${leg.sportsbook} ${formatAmericanOdds(leg.americanOdds)}`).join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recently Updated Markets" />
          {data.recentlyUpdatedMarkets.length === 0 ? (
            <EmptyState message="No markets ingested yet." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.recentlyUpdatedMarkets.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{m.event ? m.event.name : m.title}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{m.marketType}</div>
                  </div>
                  <span className="text-xs text-zinc-400">{formatRelativeTime(m.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

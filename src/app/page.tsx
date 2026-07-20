"use client";

import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { Card, CardHeader, LoadingState, ErrorState, EmptyState, Badge, EvValue } from "@/components/ui";
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

interface PromotionRow {
  id: number;
  name: string;
  sportsbook: string;
  promotionType: string;
  boostPercent: number | null;
  expiresAt: string | null;
}

interface MarketRow {
  id: number;
  title: string;
  marketType: string;
  event: { id: number; name: string } | null;
  updatedAt: string;
}

interface DashboardData {
  topExpectedValueOpportunities: OpportunityRow[];
  bestLineOpportunities: OpportunityRow[];
  largestOutliers: OpportunityRow[];
  activeArbitrage: ArbitrageRow[];
  activePromotions: PromotionRow[];
  recentlyUpdatedMarkets: MarketRow[];
}

function OutlierValue({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-zinc-400">—</span>;
  const tone = value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  return (
    <span className={`font-medium tabular-nums ${tone}`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)} outlier
    </span>
  );
}

function OpportunityList({
  rows,
  emptyMessage,
  metric = "ev",
}: {
  rows: OpportunityRow[];
  emptyMessage: string;
  metric?: "ev" | "outlier";
}) {
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
              {row.market} · {row.outcome}
              {row.line !== null ? ` ${row.line}` : ""} · {row.sportsbook.name}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tabular-nums font-medium">{formatAmericanOdds(row.americanOdds)}</div>
            {metric === "outlier" ? <OutlierValue value={row.outlierScore} /> : <EvValue value={row.expectedValuePercent} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { data, loading, error } = useFetch<DashboardData>("/api/dashboard");

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Live snapshot of the best opportunities across every tracked sportsbook.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top Positive EV Opportunities" />
          <OpportunityList rows={data.topExpectedValueOpportunities} emptyMessage="No positive EV opportunities right now." />
        </Card>

        <Card>
          <CardHeader title="Best-Line Opportunities" />
          <OpportunityList rows={data.bestLineOpportunities} emptyMessage="No best-line data yet." />
        </Card>

        <Card>
          <CardHeader title="Largest Market Outliers" />
          <OpportunityList rows={data.largestOutliers} emptyMessage="No outliers detected." metric="outlier" />
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
          <CardHeader title="Active Promotions" action={<Link href="/promotions" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">Manage</Link>} />
          {data.activePromotions.length === 0 ? (
            <EmptyState message="No active promotions configured." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.activePromotions.map((promo) => (
                <li key={promo.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{promo.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {promo.sportsbook} · {promo.promotionType.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                    {promo.boostPercent ? `${promo.boostPercent}% boost` : null}
                    {promo.expiresAt ? <div>Expires {formatDateTime(promo.expiresAt)}</div> : null}
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

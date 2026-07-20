"use client";

import { useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { Card, LoadingState, ErrorState, EmptyState, Badge, Button } from "@/components/ui";
import { formatAmericanOdds, formatCurrency, formatDateTime, formatSignedPercent } from "@/lib/format";

const STATUSES = ["PENDING", "WON", "LOST", "PUSH", "CASHED_OUT", "VOID"];

interface Bet {
  id: number;
  sportsbook: string;
  promotion: string | null;
  event: { id: number; name: string } | null;
  market: string;
  outcome: string;
  line: number | null;
  americanOdds: number;
  decimalOdds: number;
  stake: number;
  potentialProfit: number;
  status: string;
  placedAt: string;
  settledAt: string | null;
  actualProfit: number | null;
  closingDecimalOdds: number | null;
  closingLineValuePercent: number | null;
}

function statusTone(status: string): "positive" | "negative" | "neutral" | "warning" {
  if (status === "WON") return "positive";
  if (status === "LOST") return "negative";
  if (status === "PENDING") return "warning";
  return "neutral";
}

function SettleControls({ bet, onSettled }: { bet: Bet; onSettled: () => void }) {
  const [status, setStatus] = useState(bet.status);
  const [actualProfit, setActualProfit] = useState(bet.actualProfit?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/bets/${bet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          actualProfit: actualProfit === "" ? null : Number(actualProfit),
          computeClosingLine: true,
        }),
      });
      onSettled();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select className="filter-input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        className="filter-input !w-24"
        type="number"
        placeholder="Profit"
        value={actualProfit}
        onChange={(e) => setActualProfit(e.target.value)}
      />
      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Update"}
      </Button>
    </div>
  );
}

export default function BetTrackerPage() {
  const { data, loading, error, refetch } = useFetch<{ bets: Bet[] }>("/api/bets");

  const summary = data
    ? {
        totalStaked: data.bets.reduce((s, b) => s + b.stake, 0),
        totalProfit: data.bets.reduce((s, b) => s + (b.actualProfit ?? 0), 0),
        pending: data.bets.filter((b) => b.status === "PENDING").length,
      }
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Bet Tracker</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Bets logged from Odds Comparison and Event Details. Settle results here to track closing line value.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Total staked</div>
            <div className="text-lg font-semibold">{formatCurrency(summary.totalStaked)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Realized profit</div>
            <div className={`text-lg font-semibold ${summary.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {formatCurrency(summary.totalProfit)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Pending bets</div>
            <div className="text-lg font-semibold">{summary.pending}</div>
          </Card>
        </div>
      )}

      <Card className="overflow-x-auto">
        {loading ? (
          <LoadingState label="Loading bets…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : !data || data.bets.length === 0 ? (
          <EmptyState message="No bets logged yet. Use “Log bet” on Odds Comparison or an Event page." />
        ) : (
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Placed</th>
                <th className="px-3 py-2 font-medium">Event / Market</th>
                <th className="px-3 py-2 font-medium">Sportsbook</th>
                <th className="px-3 py-2 font-medium">Odds</th>
                <th className="px-3 py-2 font-medium">Stake</th>
                <th className="px-3 py-2 font-medium">Potential</th>
                <th className="px-3 py-2 font-medium">CLV</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.bets.map((bet) => (
                <tr key={bet.id}>
                  <td className="px-3 py-2 text-xs text-zinc-400">{formatDateTime(bet.placedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{bet.event?.name ?? bet.market}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {bet.market} — {bet.outcome}
                      {bet.line !== null ? ` ${bet.line}` : ""}
                      {bet.promotion ? ` · ${bet.promotion}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">{bet.sportsbook}</td>
                  <td className="px-3 py-2 tabular-nums">{formatAmericanOdds(bet.americanOdds)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(bet.stake)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(bet.potentialProfit)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {bet.closingLineValuePercent !== null ? formatSignedPercent(bet.closingLineValuePercent) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="mb-1">
                      <Badge tone={statusTone(bet.status)}>{bet.status}</Badge>
                      {bet.actualProfit !== null && (
                        <span className="ml-2 text-xs tabular-nums">{formatCurrency(bet.actualProfit)}</span>
                      )}
                    </div>
                    <SettleControls bet={bet} onSettled={refetch} />
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

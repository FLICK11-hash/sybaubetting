"use client";

import { useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { Card, CardHeader, LoadingState, ErrorState, EmptyState, Badge, Button } from "@/components/ui";
import { formatAmericanOdds, formatCurrency, formatDateTime, formatPercent } from "@/lib/format";

const PROMOTION_TYPES = ["PROFIT_BOOST", "BONUS_BET", "NO_SWEAT", "ODDS_BOOST", "DEPOSIT_BONUS", "BET_CREDIT"];

interface Promotion {
  id: number;
  sportsbook: { id: number; name: string; slug: string };
  name: string;
  promotionType: string;
  boostPercent: number | null;
  maxStake: number | null;
  minDecimalOdds: number | null;
  maxDecimalOdds: number | null;
  stakeReturned: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  notes: string | null;
}

interface PromotionOpportunity {
  event: { id: number; name: string } | null;
  market: string;
  outcome: string;
  americanOdds: number;
  stake: number;
  boostedDecimalOdds: number;
  expectedProfit: number;
  expectedValuePercent: number;
}

function CreatePromotionForm({ sportsbooks, onCreated }: { sportsbooks: { id: number; name: string }[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    sportsbookId: "",
    name: "",
    promotionType: "BONUS_BET",
    boostPercent: "",
    maxStake: "",
    minDecimalOdds: "",
    maxDecimalOdds: "",
    stakeReturned: false,
    expiresAt: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportsbookId: Number(form.sportsbookId),
          name: form.name,
          promotionType: form.promotionType,
          boostPercent: form.boostPercent ? Number(form.boostPercent) : null,
          maxStake: form.maxStake ? Number(form.maxStake) : null,
          minDecimalOdds: form.minDecimalOdds ? Number(form.minDecimalOdds) : null,
          maxDecimalOdds: form.maxDecimalOdds ? Number(form.maxDecimalOdds) : null,
          stakeReturned: form.stakeReturned,
          expiresAt: form.expiresAt || null,
          notes: form.notes || null,
        }),
      });
      setForm({ ...form, name: "", boostPercent: "", maxStake: "", minDecimalOdds: "", maxDecimalOdds: "", notes: "" });
      setOpen(false);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ New Promotion</Button>;
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">New promotion</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select className="filter-input" value={form.sportsbookId} onChange={(e) => setForm({ ...form, sportsbookId: e.target.value })}>
          <option value="">Sportsbook…</option>
          {sportsbooks.map((sb) => (
            <option key={sb.id} value={sb.id}>
              {sb.name}
            </option>
          ))}
        </select>
        <input className="filter-input" placeholder="Promotion name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="filter-input" value={form.promotionType} onChange={(e) => setForm({ ...form, promotionType: e.target.value })}>
          {PROMOTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input className="filter-input" type="number" placeholder="Boost %" value={form.boostPercent} onChange={(e) => setForm({ ...form, boostPercent: e.target.value })} />
        <input className="filter-input" type="number" placeholder="Max stake" value={form.maxStake} onChange={(e) => setForm({ ...form, maxStake: e.target.value })} />
        <input className="filter-input" type="number" step="0.01" placeholder="Min decimal odds" value={form.minDecimalOdds} onChange={(e) => setForm({ ...form, minDecimalOdds: e.target.value })} />
        <input className="filter-input" type="number" step="0.01" placeholder="Max decimal odds" value={form.maxDecimalOdds} onChange={(e) => setForm({ ...form, maxDecimalOdds: e.target.value })} />
        <input className="filter-input" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.stakeReturned} onChange={(e) => setForm({ ...form, stakeReturned: e.target.checked })} />
          Stake returned on loss
        </label>
        <input className="filter-input sm:col-span-3" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={submit} disabled={submitting || !form.sportsbookId || !form.name}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function PromotionOpportunities({ promotionId }: { promotionId: number }) {
  const { data, loading, error } = useFetch<{ opportunities: PromotionOpportunity[] }>(
    `/api/promotions/${promotionId}/opportunities`
  );
  if (loading) return <div className="px-4 py-3 text-xs text-zinc-400">Finding best current use…</div>;
  if (error) return <div className="px-4 py-3 text-xs text-rose-500">{error}</div>;
  if (!data || data.opportunities.length === 0) {
    return <div className="px-4 py-3 text-xs text-zinc-400">No qualifying opportunities right now.</div>;
  }
  return (
    <div className="space-y-1 px-4 py-3">
      {data.opportunities.slice(0, 5).map((opp, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="truncate">
            {opp.event?.name ?? opp.market} — {opp.outcome} ({formatAmericanOdds(opp.americanOdds)})
          </span>
          <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">
            {formatCurrency(opp.expectedProfit)} ({formatPercent(opp.expectedValuePercent)})
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PromotionsPage() {
  const { data, loading, error, refetch } = useFetch<{ promotions: Promotion[] }>("/api/promotions");
  const { data: sportsbooksData } = useFetch<{ sportsbooks: { id: number; name: string }[] }>("/api/sportsbooks");
  const [expanded, setExpanded] = useState<number | null>(null);

  async function toggleActive(promo: Promotion) {
    await fetch(`/api/promotions/${promo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !promo.active }),
    });
    refetch();
  }

  async function remove(promo: Promotion) {
    if (!confirm(`Delete "${promo.name}"?`)) return;
    await fetch(`/api/promotions/${promo.id}`, { method: "DELETE" });
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Promotions</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manually track sportsbook promotions and see the best current qualifying bet for each.
          </p>
        </div>
        <CreatePromotionForm sportsbooks={sportsbooksData?.sportsbooks ?? []} onCreated={refetch} />
      </div>

      {loading ? (
        <LoadingState label="Loading promotions…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data || data.promotions.length === 0 ? (
        <EmptyState message="No promotions yet — add one above." />
      ) : (
        <div className="space-y-3">
          {data.promotions.map((promo) => (
            <Card key={promo.id}>
              <CardHeader
                title={`${promo.name} — ${promo.sportsbook.name}`}
                action={
                  <div className="flex items-center gap-2">
                    <Badge tone={promo.active ? "positive" : "neutral"}>{promo.active ? "Active" : "Inactive"}</Badge>
                    <Badge tone="info">{promo.promotionType.replace(/_/g, " ")}</Badge>
                  </div>
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                <div className="space-x-3">
                  {promo.boostPercent !== null && <span>Boost {promo.boostPercent}%</span>}
                  {promo.maxStake !== null && <span>Max stake {formatCurrency(promo.maxStake)}</span>}
                  {promo.minDecimalOdds !== null && <span>Min odds {promo.minDecimalOdds}</span>}
                  {promo.expiresAt && <span>Expires {formatDateTime(promo.expiresAt)}</span>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setExpanded(expanded === promo.id ? null : promo.id)}>
                    {expanded === promo.id ? "Hide" : "Best use"}
                  </Button>
                  <Button variant="secondary" onClick={() => toggleActive(promo)}>
                    {promo.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button variant="danger" onClick={() => remove(promo)}>
                    Delete
                  </Button>
                </div>
              </div>
              {promo.notes && <div className="px-4 pb-3 text-xs text-zinc-400">{promo.notes}</div>}
              {expanded === promo.id && <PromotionOpportunities promotionId={promo.id} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

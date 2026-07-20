"use client";

import { useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { Card, CardHeader, LoadingState, ErrorState, Badge, Button } from "@/components/ui";

interface Settings {
  refreshFrequencySeconds: number;
  minEvPercentThreshold: number;
  maxQuoteAgeSeconds: number;
  bankroll: number;
  defaultStakeSize: number;
  consensusMethod: string;
  oddsApiKeyConfigured: boolean;
  oddsApiProvider: string;
}

interface Sportsbook {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  isSharp: boolean;
}

interface Sport {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  leagues: { id: number; name: string; active: boolean }[];
}

function SettingsForm({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  // `settings` is only truthy once loaded (parent renders this conditionally),
  // so the initial value is always fresh -- no need to resync via an effect.
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshFrequencySeconds: form.refreshFrequencySeconds,
          minEvPercentThreshold: form.minEvPercentThreshold,
          maxQuoteAgeSeconds: form.maxQuoteAgeSeconds,
          bankroll: form.bankroll,
          defaultStakeSize: form.defaultStakeSize,
          consensusMethod: form.consensusMethod,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="General" />
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <label className="text-sm">
          Refresh frequency (seconds)
          <input
            className="filter-input mt-1"
            type="number"
            value={form.refreshFrequencySeconds}
            onChange={(e) => setForm({ ...form, refreshFrequencySeconds: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Minimum EV threshold (%)
          <input
            className="filter-input mt-1"
            type="number"
            step="0.1"
            value={form.minEvPercentThreshold}
            onChange={(e) => setForm({ ...form, minEvPercentThreshold: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Maximum quote age (seconds)
          <input
            className="filter-input mt-1"
            type="number"
            value={form.maxQuoteAgeSeconds}
            onChange={(e) => setForm({ ...form, maxQuoteAgeSeconds: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Consensus method
          <select
            className="filter-input mt-1"
            value={form.consensusMethod}
            onChange={(e) => setForm({ ...form, consensusMethod: e.target.value })}
          >
            <option value="median">Median</option>
            <option value="weighted_average">Weighted average</option>
          </select>
        </label>
        <label className="text-sm">
          Bankroll
          <input
            className="filter-input mt-1"
            type="number"
            value={form.bankroll}
            onChange={(e) => setForm({ ...form, bankroll: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Default stake size
          <input
            className="filter-input mt-1"
            type="number"
            value={form.defaultStakeSize}
            onChange={(e) => setForm({ ...form, defaultStakeSize: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Odds provider:</span>
          <span className="font-medium">{settings.oddsApiProvider}</span>
          <Badge tone={settings.oddsApiKeyConfigured ? "positive" : "warning"}>
            {settings.oddsApiKeyConfigured ? "API key configured" : "No API key set"}
          </Badge>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          The odds provider API key is set via the <code>ODDS_API_KEY</code> environment variable on the server
          only — it is never stored in the database or sent to the browser. Update it in your deployment
          environment (Render) and restart the worker to change providers or rotate keys.
        </p>
      </div>
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </Card>
  );
}

function SportsbookToggle({ sb, onChanged }: { sb: Sportsbook; onChanged: () => void }) {
  async function patch(body: Partial<Pick<Sportsbook, "active" | "isSharp">>) {
    await fetch(`/api/sportsbooks/${sb.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged();
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm">
      <span>{sb.name}</span>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <input type="checkbox" checked={sb.isSharp} onChange={(e) => patch({ isSharp: e.target.checked })} />
          Sharp reference
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <input type="checkbox" checked={sb.active} onChange={(e) => patch({ active: e.target.checked })} />
          Enabled
        </label>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: settings, loading, error, refetch } = useFetch<Settings>("/api/settings");
  const { data: sportsbooksData, refetch: refetchSportsbooks } = useFetch<{ sportsbooks: Sportsbook[] }>(
    "/api/sportsbooks"
  );
  const { data: sportsData, refetch: refetchSports } = useFetch<{ sports: Sport[] }>("/api/sports");

  async function toggleSport(sport: Sport) {
    await fetch(`/api/sports/${sport.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !sport.active }),
    });
    refetchSports();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure sportsbooks, sports, bankroll, and thresholds used across the app and the background worker.
        </p>
      </div>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : settings && (
        <SettingsForm settings={settings} onSaved={refetch} />
      )}

      <Card>
        <CardHeader title="Sports & Leagues" />
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sportsData?.sports.map((sport) => (
            <div key={sport.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div>
                <span>{sport.name}</span>
                <span className="ml-2 text-xs text-zinc-400">{sport.leagues.map((l) => l.name).join(", ")}</span>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <input type="checkbox" checked={sport.active} onChange={() => toggleSport(sport)} />
                Enabled
              </label>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Sportsbooks" />
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sportsbooksData?.sportsbooks.map((sb) => (
            <SportsbookToggle key={sb.id} sb={sb} onChanged={refetchSportsbooks} />
          ))}
        </div>
      </Card>
    </div>
  );
}

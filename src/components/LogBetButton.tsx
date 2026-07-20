"use client";

import { useState } from "react";
import { Button } from "./ui";

interface LogBetButtonProps {
  outcomeId: number;
  sportsbookId: number;
  americanOdds: number;
}

export function LogBetButton({ outcomeId, sportsbookId, americanOdds }: LogBetButtonProps) {
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState("25");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  async function submit() {
    setStatus("saving");
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcomeId, sportsbookId, americanOdds, stake: Number(stake) }),
      });
      if (res.ok) {
        setStatus("done");
        setTimeout(() => {
          setOpen(false);
          setStatus("idle");
        }, 1000);
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  }

  if (status === "done") {
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Logged ✓</span>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Log bet
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        className="w-16 rounded border border-zinc-300 px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        autoFocus
      />
      <Button onClick={submit} disabled={status === "saving"} className="!px-2 !py-0.5 text-xs">
        {status === "saving" ? "…" : "Save"}
      </Button>
      <button onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600">
        ✕
      </button>
    </span>
  );
}

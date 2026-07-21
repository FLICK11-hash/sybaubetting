import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white/80 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/80 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h2>
      {action}
    </div>
  );
}

/**
 * Dashboard-style KPI tile: label + a large compact value, with an optional
 * signed delta and a tone-matched accent bar. See the dataviz skill's stat
 * tile contract -- proportional (non-tabular) figures at display size, one
 * clear value per tile.
 */
export function StatTile({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "info";
  hint?: string;
}) {
  const accent: Record<string, string> = {
    neutral: "from-zinc-400 to-zinc-300 dark:from-zinc-600 dark:to-zinc-700",
    positive: "from-emerald-500 to-emerald-300 dark:from-emerald-500 dark:to-emerald-700",
    negative: "from-rose-500 to-rose-300 dark:from-rose-500 dark:to-rose-700",
    info: "from-blue-500 to-blue-300 dark:from-blue-500 dark:to-blue-700",
  };
  const valueTone: Record<string, string> = {
    neutral: "text-zinc-900 dark:text-zinc-50",
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-rose-600 dark:text-rose-400",
    info: "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent[tone]}`} />
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold ${valueTone[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "info" | "warning";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
    positive:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30",
    negative: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/30",
    info: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/30",
    warning:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="px-4 py-10 text-center text-sm text-rose-600 dark:text-rose-400">
      <span aria-hidden="true">⚠</span> Something went wrong: {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">{message}</div>;
}

/** Small up/down triangle used next to signed values so direction never rides on color alone. */
function DirectionMark({ positive }: { positive: boolean }) {
  return (
    <span aria-hidden="true" className="text-[0.65rem] leading-none">
      {positive ? "▲" : "▼"}
    </span>
  );
}

export function EvValue({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-zinc-400">—</span>;
  const positive = value > 0;
  const tone = positive
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium tabular-nums ${tone}`}>
      {positive && <DirectionMark positive />}
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-zinc-900 text-white hover:bg-zinc-700 focus-visible:ring-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:ring-zinc-100",
    secondary:
      "bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 focus-visible:ring-zinc-400 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
    danger: "bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-600",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:ring-offset-zinc-950 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

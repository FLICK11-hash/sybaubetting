"use client";

interface HistoryPoint {
  sportsbook: string;
  sportsbookId: number;
  decimalOdds: number;
  capturedAt: string;
}

const LINE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

/** Dependency-free SVG line chart for odds history -- no charting library needed for this simple use case. */
export function OddsHistoryChart({ history }: { history: HistoryPoint[] }) {
  if (history.length === 0) {
    return <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">No history yet.</div>;
  }

  const bySportsbook = new Map<string, HistoryPoint[]>();
  for (const point of history) {
    const bucket = bySportsbook.get(point.sportsbook) ?? [];
    bucket.push(point);
    bySportsbook.set(point.sportsbook, bucket);
  }

  const times = history.map((p) => new Date(p.capturedAt).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = Math.max(maxTime - minTime, 1);

  const odds = history.map((p) => p.decimalOdds);
  const minOdds = Math.min(...odds) * 0.98;
  const maxOdds = Math.max(...odds) * 1.02;
  const oddsSpan = Math.max(maxOdds - minOdds, 0.01);

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const x = (t: number) => PADDING.left + ((t - minTime) / timeSpan) * innerWidth;
  const y = (v: number) => PADDING.top + innerHeight - ((v - minOdds) / oddsSpan) * innerHeight;

  const gridLines = 4;

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Odds history chart">
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const value = minOdds + (oddsSpan * i) / gridLines;
          const yPos = y(value);
          return (
            <g key={i}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={yPos} y2={yPos} stroke="currentColor" strokeOpacity={0.08} />
              <text x={4} y={yPos + 4} fontSize={10} fill="currentColor" opacity={0.6}>
                {value.toFixed(2)}
              </text>
            </g>
          );
        })}

        {Array.from(bySportsbook.entries()).map(([sportsbook, points], i) => {
          const sorted = [...points].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
          const path = sorted
            .map((p, idx) => `${idx === 0 ? "M" : "L"} ${x(new Date(p.capturedAt).getTime())} ${y(p.decimalOdds)}`)
            .join(" ");
          const color = LINE_COLORS[i % LINE_COLORS.length];
          return (
            <g key={sportsbook}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} />
              {sorted.map((p, idx) => (
                <circle key={idx} cx={x(new Date(p.capturedAt).getTime())} cy={y(p.decimalOdds)} r={2.5} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {Array.from(bySportsbook.keys()).map((sportsbook, i) => (
          <div key={sportsbook} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
            <span className="text-zinc-600 dark:text-zinc-300">{sportsbook}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

/**
 * Month-over-month spending, one view at a time: the household, then each
 * person. Lines are Total plus the top categories (ranked on household spend,
 * so a category keeps its colour across views); click a legend chip to hide a
 * line and rescale, or click a month on the chart to open that month's report.
 * Data comes from generated report snapshots, so a month with no report is a
 * gap in the line.
 */

interface SpendingTrendProps {
  month: number;
  year: number;
  onSelectMonth: (month: number, year: number) => void;
}

interface Series {
  key: string;
  name: string;
  slot: number | null;
  values: Array<number | null>;
}

const HEIGHT = 260;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 56 };
/** Keeps the first/last month off the plot edge so its band and dots fit. */
const INSET = 24;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);

const formatAxis = (amount: number) =>
  Math.abs(amount) >= 1000 ? `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k` : `$${amount}`;

const formatMonthShort = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

const formatMonthLong = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

function seriesColor(s: Series): string {
  if (s.key === "total") return "var(--foreground)";
  if (s.slot === null) return "var(--muted-foreground)";
  return `var(--series-${s.slot})`;
}

/** Round step (1, 2, 2.5, 5 × 10^n) giving about `count` ticks. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t <= max + step * 0.999; t += step) {
    ticks.push(Math.round(t * 100) / 100);
    if (t >= max) break;
  }
  return ticks;
}

/** Path segments split at gaps; a lone point between gaps gets no segment. */
function linePaths(
  values: Array<number | null>,
  x: (i: number) => number,
  y: (v: number) => number
): string[] {
  const paths: string[] = [];
  let current = "";
  let points = 0;
  values.forEach((v, i) => {
    if (v === null) {
      if (points > 1) paths.push(current);
      current = "";
      points = 0;
      return;
    }
    current += `${points === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    points += 1;
  });
  if (points > 1) paths.push(current);
  return paths;
}

export function SpendingTrend({ month, year, onSelectMonth }: SpendingTrendProps) {
  const trpc = useTRPC();
  const trendQuery = useQuery(trpc.reports.trend.queryOptions());
  const trend = trendQuery.data;

  const [viewKey, setViewKey] = useState("household");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  if (!trend || trend.months.length === 0) return null;

  const view = trend.views.find((v) => v.key === viewKey) ?? trend.views[0];
  const selectedKey = `${year}-${String(month).padStart(2, "0")}`;
  const missing = trend.months.filter((_, i) => view.series[0].values[i] === null);

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Spending Trend</CardTitle>
          <CardDescription>
            {view.key === "household"
              ? "Everything accepted, by month"
              : `Accepted items on ${view.label}'s statements, by month`}
            {missing.length > 0 && (
              <span className="ml-1">
                · no report for {missing.map(formatMonthShort).join(", ")}
              </span>
            )}
          </CardDescription>
        </div>
        <Tabs value={view.key} onValueChange={(v) => setViewKey(String(v))}>
          <TabsList>
            {trend.views.map((v) => (
              <TabsTrigger key={v.key} value={v.key} className="text-xs">
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lines shown">
          {view.series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() => toggle(s.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-muted ${
                  off ? "text-muted-foreground line-through opacity-60" : "text-foreground"
                }`}
              >
                <span
                  className="w-3"
                  style={{
                    borderTop: `2px ${s.key === "other" ? "dashed" : "solid"} ${seriesColor(s)}`,
                  }}
                />
                {s.name}
              </button>
            );
          })}
        </div>
        <TrendChart
          months={trend.months}
          series={view.series.filter((s) => !hidden.has(s.key))}
          selectedKey={selectedKey}
          onSelectMonth={onSelectMonth}
        />
      </CardContent>
    </Card>
  );
}

function TrendChart({
  months,
  series,
  selectedKey,
  onSelectMonth,
}: {
  months: string[];
  series: Series[];
  selectedKey: string;
  onSelectMonth: (month: number, year: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (containerRef.current) setWidth(containerRef.current.clientWidth);
  }, []);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const step = months.length > 1 ? (plotWidth - 2 * INSET) / (months.length - 1) : 0;
  const x = (i: number) => MARGIN.left + (months.length > 1 ? INSET + i * step : plotWidth / 2);

  const visibleValues = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const ticks = niceTicks(Math.min(0, ...visibleValues), Math.max(0, ...visibleValues));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const y = (v: number) => MARGIN.top + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

  const selectedIndex = months.indexOf(selectedKey);
  const bandWidth = months.length > 1 ? Math.min(step, 48) : 48;
  // Show every nth month label so they never collide (~56px each).
  const labelEvery = Math.max(1, Math.ceil(months.length / Math.max(1, Math.floor(plotWidth / 56))));

  const indexAt = (clientX: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const px = clientX - rect.left - MARGIN.left - INSET;
    if (months.length === 1) return 0;
    return Math.min(months.length - 1, Math.max(0, Math.round(px / step)));
  };

  const hoverRows =
    hoverIndex === null
      ? []
      : series
          .map((s) => ({ s, value: s.values[hoverIndex] }))
          .filter((r): r is { s: Series; value: number } => r.value !== null)
          .sort((a, b) =>
            a.s.key === "total" ? -1 : b.s.key === "total" ? 1 : b.value - a.value
          );

  const tooltipLeft = hoverIndex === null ? 0 : x(hoverIndex);
  const flip = tooltipLeft > width / 2;

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Monthly spending, ${formatMonthLong(months[0])} to ${formatMonthLong(months[months.length - 1])}`}
          className="cursor-pointer overflow-visible"
          onMouseMove={(e) => setHoverIndex(indexAt(e.clientX))}
          onMouseLeave={() => setHoverIndex(null)}
          onClick={(e) => {
            const [yy, mm] = months[indexAt(e.clientX)].split("-").map(Number);
            onSelectMonth(mm, yy);
          }}
        >
          {selectedIndex >= 0 && (
            <rect
              x={x(selectedIndex) - bandWidth / 2}
              y={MARGIN.top}
              width={bandWidth}
              height={plotHeight}
              rx={4}
              fill="var(--muted)"
            />
          )}

          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {formatAxis(t)}
              </text>
            </g>
          ))}

          {months.map((m, i) =>
            i % labelEvery === 0 || i === selectedIndex ? (
              <text
                key={m}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor="middle"
                className={`text-[11px] ${
                  i === selectedIndex ? "fill-foreground font-medium" : "fill-muted-foreground"
                }`}
              >
                {formatMonthShort(m)}
              </text>
            ) : null
          )}

          {series.map((s) =>
            linePaths(s.values, x, y).map((d, i) => (
              <path
                key={`${s.key}-${i}`}
                d={d}
                fill="none"
                stroke={seriesColor(s)}
                strokeWidth={s.key === "total" ? 2.5 : 2}
                strokeDasharray={s.key === "other" ? "4 3" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))
          )}

          {/* Points with no neighbour on either side would otherwise be invisible. */}
          {series.map((s) =>
            s.values.map((v, i) =>
              v !== null && (s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null ? (
                <circle key={`${s.key}-dot-${i}`} cx={x(i)} cy={y(v)} r={3} fill={seriesColor(s)} />
              ) : null
            )
          )}

          {hoverIndex !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hoverIndex)}
                x2={x(hoverIndex)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              {hoverRows.map(({ s, value }) => (
                <circle
                  key={s.key}
                  cx={x(hoverIndex)}
                  cy={y(value)}
                  r={4}
                  fill={seriesColor(s)}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>
      )}

      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[180px] rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={
            flip
              ? { right: width - tooltipLeft + 12 }
              : { left: tooltipLeft + 12 }
          }
        >
          <div className="mb-1 font-medium">{formatMonthLong(months[hoverIndex])}</div>
          {hoverRows.length === 0 ? (
            <div className="text-muted-foreground">No report generated</div>
          ) : (
            hoverRows.map(({ s, value }) => (
              <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: seriesColor(s) }} />
                  <span className={s.key === "total" ? "font-medium" : "text-muted-foreground"}>
                    {s.name}
                  </span>
                </span>
                <span className={`tabular-nums ${s.key === "total" ? "font-medium" : ""}`}>
                  {formatCurrency(value)}
                </span>
              </div>
            ))
          )}
          <div className="mt-1 border-t pt-1 text-[10px] text-muted-foreground">Click to open this month</div>
        </div>
      )}
    </div>
  );
}

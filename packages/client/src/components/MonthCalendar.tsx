import { useTRPC } from "../lib/trpc";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Lifecycle marks, legible without colour: a glyph per stage (see
 * `reports.status`) plus ⚠ when the report is outdated, a settled month
 * has an adjustment pending, or the month is not fully reviewed.
 */
const STAGE_GLYPH: Record<string, { glyph: string; label: string }> = {
  imported: { glyph: "○", label: "Imported" },
  reviewed: { glyph: "◐", label: "Reviewed" },
  reported: { glyph: "●", label: "Reported" },
  settled: { glyph: "✓", label: "Settled" },
};

interface MonthCalendarProps {
  month: number;
  year: number;
  onSelect: (month: number, year: number) => void;
}

export function MonthCalendar({
  month,
  year,
  onSelect,
}: MonthCalendarProps) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const trpc = useTRPC();
  const countsQuery = useQuery(
    trpc.lineItems.countByMonth.queryOptions({ year })
  );

  const counts = countsQuery.data ?? {};
  const statusQuery = useQuery(trpc.reports.status.queryOptions());
  const statusByMonth = new Map(
    (statusQuery.data?.months ?? []).filter((m) => m.year === year).map((m) => [m.month, m])
  );

  return (
    <div className="w-full">
      {/* Year navigation */}
      <div className="flex items-center justify-between mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => {
            const newYear = year - 1;
            onSelect(newYear === currentYear ? currentMonth : 12, newYear);
          }}
        >
          &larr;
        </Button>
        <span className="text-sm font-semibold">{year}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => {
            const newYear = year + 1;
            onSelect(newYear === currentYear ? currentMonth : 1, newYear);
          }}
        >
          &rarr;
        </Button>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-4 gap-1">
        {MONTH_LABELS.map((label, i) => {
          const m = i + 1;
          const isSelected = m === month;
          const count = counts[m] ?? 0;
          const status = statusByMonth.get(m);
          const stage = status ? STAGE_GLYPH[status.stage] : undefined;
          const warnings = status
            ? [
                status.flags.outdated && "report outdated",
                status.flags.adjustmentPending && "adjustment pending",
                status.flags.unreviewed && "not fully reviewed",
              ].filter((w): w is string => Boolean(w))
            : [];
          const title = [label, stage?.label, ...warnings].filter(Boolean).join(" · ");

          return (
            <button
              key={m}
              title={title}
              aria-label={title}
              onClick={() => onSelect(m, year)}
              className={`
                rounded-md px-2 py-2 text-center text-xs transition-colors
                ${
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "hover:bg-muted"
                }
              `}
            >
              <div className={isSelected ? "text-primary-foreground" : "text-foreground"}>
                {label}
              </div>
              {(count > 0 || stage) && (
                <div
                  className={`text-[10px] mt-0.5 flex items-center justify-center gap-1 ${
                    isSelected
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                  aria-hidden
                >
                  {stage && <span>{stage.glyph}</span>}
                  {count > 0 && <span>{count}</span>}
                  {warnings.length > 0 && (
                    <span className={isSelected ? "" : "text-amber-600"}>⚠</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-x-2 gap-y-0.5 border-t pt-2 text-[10px] text-muted-foreground">
        {Object.values(STAGE_GLYPH).map((s) => (
          <span key={s.label}>
            {s.glyph} {s.label.toLowerCase()}
          </span>
        ))}
        <span>⚠ needs attention</span>
      </div>
    </div>
  );
}

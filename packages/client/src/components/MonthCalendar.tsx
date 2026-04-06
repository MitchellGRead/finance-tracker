import { useTRPC } from "../lib/trpc";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

          return (
            <button
              key={m}
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
              {count > 0 && (
                <div
                  className={`text-[10px] mt-0.5 ${
                    isSelected
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  ({count})
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

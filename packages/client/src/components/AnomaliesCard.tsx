import { useState, type Ref } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useTRPC } from "../lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { formatCurrency, formatDay } from "../lib/format";
import type { WorkspaceFilterRequest } from "../lib/workspaceFilter";

/**
 * "Unusual this month": category spikes and large one-off items from
 * `reports.anomalies`. Each links to its line items in the workspace and can
 * be dismissed with an optional note; dismissed ones collapse into a toggle
 * rather than disappearing.
 */

interface AnomaliesCardProps {
  month: number;
  year: number;
  onOpenWorkspace: (filter: WorkspaceFilterRequest) => void;
  ref?: Ref<HTMLDivElement>;
}

export function AnomaliesCard({ month, year, onOpenWorkspace, ref }: AnomaliesCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const query = useQuery({ ...trpc.reports.anomalies.queryOptions({ month, year }), refetchOnMount: "always" });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.reports.anomalies.queryKey() });
  const dismiss = useMutation(
    trpc.reports.dismissAnomaly.mutationOptions({
      onSuccess: () => {
        setDismissing(null);
        setNote("");
        invalidate();
      },
    })
  );
  const undismiss = useMutation(trpc.reports.undismissAnomaly.mutationOptions({ onSuccess: invalidate }));

  const all = query.data ?? [];
  if (all.length === 0) return null;
  const active = all.filter((a) => !a.dismissal);
  const dismissed = all.filter((a) => a.dismissal);
  type Row = (typeof all)[number];

  const view = (a: Row) =>
    a.kind === "large_item"
      ? onOpenWorkspace({ itemIds: [a.lineItemId!], label: a.label })
      : onOpenWorkspace({
          status: "accepted",
          category: a.categoryId === null ? "uncategorized" : String(a.categoryId),
        });

  const subject = (a: Row) => ({ month, year, kind: a.kind, subjectKey: a.subjectKey });

  const describe = (a: Row) => {
    const typical =
      a.typical === null
        ? "no history in this category"
        : `typical ${formatCurrency(a.typical)} (median of ${a.baselineMonths} months)`;
    return a.kind === "category_spike"
      ? `Category ${typical}`
      : `${a.categoryName} · ${formatDay(a.date!)} · ${typical}`;
  };

  const renderRow = (a: Row) => (
    <li key={a.subjectKey} className="flex flex-col gap-1.5 py-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 rounded border px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {a.kind === "category_spike" ? "Spike" : "Large item"}
            </span>
            <span className="truncate text-sm font-medium">{a.label}</span>
            <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(a.amount)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{describe(a)}</p>
          {a.drivers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Incl.{" "}
              {a.drivers.map((d, i) => (
                <span key={d.lineItemId}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => onOpenWorkspace({ itemIds: [d.lineItemId], label: d.description })}
                  >
                    {d.description}
                  </button>{" "}
                  {formatCurrency(d.amount)}
                </span>
              ))}
            </p>
          )}
          {a.dismissal && (
            <p className="text-xs text-muted-foreground">
              Dismissed {formatDay(a.dismissal.dismissedAt)}
              {a.dismissal.note && <> — “{a.dismissal.note}”</>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => view(a)}>
            View
          </Button>
          {a.dismissal ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={undismiss.isPending}
              onClick={() => undismiss.mutate(subject(a))}
            >
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setDismissing(a.subjectKey);
                setNote("");
              }}
            >
              Dismiss
            </Button>
          )}
        </div>
      </div>
      {dismissing === a.subjectKey && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            dismiss.mutate({ ...subject(a), note: note.trim() || null });
          }}
        >
          <Input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note, e.g. expected — tax payment"
            className="h-7 flex-1 text-xs"
          />
          <Button type="submit" size="sm" className="h-7 text-xs" disabled={dismiss.isPending}>
            Dismiss
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDismissing(null)}>
            Cancel
          </Button>
        </form>
      )}
    </li>
  );

  return (
    <Card ref={ref}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
          Unusual this month
          <span className="text-sm font-normal text-muted-foreground">{active.length}</span>
        </CardTitle>
        <CardDescription>
          Categories well above their typical month, and large one-off charges. Dismiss what you expected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {active.length > 0 ? (
          <ul className="divide-y">{active.map(renderRow)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing unusual left to look at.</p>
        )}
        {dismissed.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              aria-expanded={showDismissed}
              onClick={() => setShowDismissed((v) => !v)}
            >
              {showDismissed ? "Hide" : "Show"} {dismissed.length} dismissed
            </button>
            {showDismissed && <ul className="divide-y opacity-70">{dismissed.map(renderRow)}</ul>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

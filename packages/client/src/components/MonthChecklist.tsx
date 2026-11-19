import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { useTRPC } from "../lib/trpc";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { describeOwed, formatCurrency, formatDay, formatMonthKey, formatMonthRange, whoOwes } from "../lib/format";
import type { WorkspaceFilterRequest } from "../lib/workspaceFilter";

/**
 * Imported → Reviewed → Reported → Settled for the selected month, each with
 * its detail and the next action. Every state is derived by `reports.status`
 * (never stored). Marks pair a glyph with a word so they read without colour.
 */

type StepState = "done" | "warn" | "todo";

const STATE_LABEL: Record<StepState, string> = { done: "Done", warn: "Needs attention", todo: "To do" };

function StepGlyph({ state }: { state: StepState }) {
  const cls = "h-4 w-4 shrink-0";
  if (state === "done") return <CheckCircle2 className={`${cls} text-emerald-600`} aria-hidden />;
  if (state === "warn") return <AlertTriangle className={`${cls} text-amber-600`} aria-hidden />;
  return <Circle className={`${cls} text-muted-foreground`} aria-hidden />;
}

function Step({
  title,
  state,
  children,
  actions,
}: {
  title: string;
  state: StepState;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <StepGlyph state={state} />
        {title}
        <span className="sr-only">: {STATE_LABEL[state]}</span>
        <span className="ml-auto text-[10px] font-normal uppercase tracking-wide text-muted-foreground" aria-hidden>
          {STATE_LABEL[state]}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{children}</div>
      {actions && <div className="mt-auto flex flex-wrap gap-1.5 pt-1">{actions}</div>}
    </div>
  );
}

interface MonthChecklistProps {
  month: number;
  year: number;
  onOpenWorkspace: (filter: WorkspaceFilterRequest) => void;
  /** Open the settle dialog; absent hides the action. */
  onSettle?: () => void;
  /** Scroll to the "Unusual this month" card. */
  onShowAnomalies?: () => void;
}

export function MonthChecklist({ month, year, onOpenWorkspace, onSettle, onShowAnomalies }: MonthChecklistProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Line item edits anywhere move these; always recheck when the page opens.
  const statusQuery = useQuery({ ...trpc.reports.status.queryOptions(), refetchOnMount: "always" });
  const anomaliesQuery = useQuery({
    ...trpc.reports.anomalies.queryOptions({ month, year }),
    refetchOnMount: "always",
  });

  const invalidateReports = () => queryClient.invalidateQueries({ queryKey: trpc.reports.pathKey() });
  const generate = useMutation(trpc.reports.generate.mutationOptions({ onSuccess: invalidateReports }));
  const regenerateAll = useMutation(
    trpc.reports.regenerateOutdated.mutationOptions({ onSuccess: invalidateReports })
  );

  const data = statusQuery.data;
  if (!data) return null;

  const key = `${year}-${String(month).padStart(2, "0")}`;
  const m = data.months.find((x) => x.key === key);
  const pair = data.pair;
  const outdatedMonths = data.months.filter((x) => x.flags.outdated);
  const anomalyCount = anomaliesQuery.data?.length ?? 0;

  const itemCount = m?.itemCount ?? 0;
  const imported: StepState = itemCount > 0 ? "done" : "todo";
  const reviewed: StepState = m?.reviewed ? "done" : itemCount > 0 ? "warn" : "todo";
  const reported: StepState = m?.report?.current ? "done" : m?.report ? "warn" : "todo";
  const settled: StepState = m?.settlement
    ? m.flags.adjustmentPending
      ? "warn"
      : "done"
    : "todo";

  const regenerate = (
    <Button
      size="sm"
      variant={m?.report ? "default" : "outline"}
      className="h-7 text-xs"
      disabled={generate.isPending || itemCount === 0}
      onClick={() => generate.mutate({ month, year })}
    >
      {generate.isPending ? "Generating…" : m?.report ? "Regenerate" : "Generate report"}
    </Button>
  );

  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <div className="grid grid-cols-2 divide-y lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <Step
            title="Imported"
            state={imported}
            actions={
              itemCount === 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenWorkspace({})}>
                  Open workspace
                </Button>
              )
            }
          >
            {itemCount > 0 ? `${itemCount} line items` : "No line items yet"}
          </Step>

          <Step
            title="Reviewed"
            state={reviewed}
            actions={
              m &&
              !m.reviewed &&
              itemCount > 0 && (
                <>
                  {m.pendingCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onOpenWorkspace({ status: "pending" })}
                    >
                      Review {m.pendingCount} pending
                    </Button>
                  )}
                  {m.uncategorizedCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onOpenWorkspace({ status: "accepted", category: "uncategorized" })}
                    >
                      Categorize {m.uncategorizedCount}
                    </Button>
                  )}
                </>
              )
            }
          >
            {itemCount === 0
              ? "Nothing to review"
              : m?.reviewed
                ? "Nothing pending, everything categorized"
                : [
                    m!.pendingCount > 0 && `${m!.pendingCount} pending`,
                    m!.uncategorizedCount > 0 && `${m!.uncategorizedCount} accepted without a category`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
          </Step>

          <Step
            title="Reported"
            state={reported}
            actions={reported !== "done" && regenerate}
          >
            {m?.report ? (
              m.report.current ? (
                <>Generated {formatDay(m.report.generatedAt)} · matches live data</>
              ) : (
                <>
                  <span className="font-medium text-foreground">Report outdated</span> —{" "}
                  {m.report.diff?.summary}
                </>
              )
            ) : (
              "No report generated"
            )}
            {anomalyCount > 0 && (
              <button
                type="button"
                className="mt-1 block text-left underline-offset-2 hover:underline"
                onClick={onShowAnomalies}
              >
                ⚠ {anomalyCount} unusual this month
              </button>
            )}
          </Step>

          <Step
            title="Settled"
            state={settled}
            actions={
              onSettle &&
              itemCount > 0 &&
              (!m?.settlement || m.flags.adjustmentPending) && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSettle}>
                  Settle…
                </Button>
              )
            }
          >
            {m?.settlement ? (
              <>
                Settled {formatDay(m.settlement.settledOn)} · covered{" "}
                {formatMonthRange(m.settlement.coveredMonths)} · paid in {m.settlement.paymentCount} transfer
                {m.settlement.paymentCount === 1 ? "" : "s"}
                {m.flags.adjustmentPending && (
                  <span className="mt-1 block font-medium text-foreground">
                    {formatCurrency(Math.abs(m.settlement.pendingAdjustment))} adjustment pending (
                    {whoOwes(m.settlement.pendingAdjustment, pair)})
                  </span>
                )}
              </>
            ) : itemCount > 0 ? (
              <>
                Open · {describeOwed(m!.share.live, pair)} this month
                {data.outstanding.openMonths.length > 1 && (
                  <span className="block">
                    Part of {formatCurrency(Math.abs(data.outstanding.total))} outstanding (
                    {formatMonthRange(data.outstanding.openMonths)})
                  </span>
                )}
              </>
            ) : (
              "Nothing to settle"
            )}
          </Step>
        </div>

        {outdatedMonths.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
            <span>
              {outdatedMonths.length} report{outdatedMonths.length === 1 ? "" : "s"} outdated:{" "}
              {outdatedMonths.map((x) => formatMonthKey(x.key)).join(", ")}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs"
              disabled={regenerateAll.isPending}
              onClick={() => regenerateAll.mutate()}
            >
              {regenerateAll.isPending ? "Regenerating…" : "Regenerate all outdated"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

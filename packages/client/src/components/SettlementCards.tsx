import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import type { ReportSnapshot } from "@finance-tracker/shared";
import { useTRPC } from "../lib/trpc";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { describeOwed, formatCurrency, formatDay, formatMonthRange, whoOwes } from "../lib/format";

/**
 * A month's settlement, following the snapshot-vs-live principle: the share
 * owed comes from the month's snapshot (a fact about its items); whether it
 * is settled, the transfers, adjustments and the outstanding balance are
 * live, from settlement records — never stored in the snapshot.
 */

const useMonthStatus = (month: number, year: number) => {
  const trpc = useTRPC();
  const query = useQuery({ ...trpc.reports.status.queryOptions(), refetchOnMount: "always" });
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return { data: query.data, month: query.data?.months.find((m) => m.key === key) };
};

/** The summary tile: this month's share plus where it stands now. */
export function SettlementSummaryCard({
  snapshot,
  month,
  year,
}: {
  snapshot: ReportSnapshot;
  month: number;
  year: number;
}) {
  const { data, month: m } = useMonthStatus(month, year);
  const share = snapshot.splitSummary.settlements[0];
  const outstanding = data?.outstanding;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>Settlement · this month</CardDescription>
        <CardTitle className="text-2xl">{share ? formatCurrency(share.amount) : "$0.00"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-xs text-muted-foreground">
        <p className="text-sm">{share ? `${share.fromUserName} owes ${share.toUserName}` : "Nothing owed this month"}</p>
        {m?.settlement ? (
          <p className="flex items-start gap-1 text-foreground">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
            <span>
              Settled {formatDay(m.settlement.settledOn)} · covered {formatMonthRange(m.settlement.coveredMonths)} · paid
              in {m.settlement.paymentCount} transfer{m.settlement.paymentCount === 1 ? "" : "s"}
            </span>
          </p>
        ) : (
          m &&
          outstanding && (
            <p className="flex items-start gap-1 text-foreground">
              <Circle className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                Open
                {outstanding.openMonths.length > 0 &&
                  ` · part of ${formatCurrency(Math.abs(outstanding.total))} outstanding (${formatMonthRange(outstanding.openMonths)})`}
              </span>
            </p>
          )
        )}
        {m?.flags.adjustmentPending && m.settlement && (
          <p className="flex items-start gap-1 text-foreground">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
            <span>
              {formatCurrency(Math.abs(m.settlement.pendingAdjustment))} adjustment pending (
              {whoOwes(m.settlement.pendingAdjustment, data?.pair)})
            </span>
          </p>
        )}
        {outstanding && Math.abs(outstanding.total) >= 0.005 && (
          <p>Outstanding overall: {describeOwed(outstanding.total, data?.pair)}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Detail card: the snapshot's share, and the covering settlement's transfers with Undo. */
export function SettlementDetailCard({
  snapshot,
  month,
  year,
}: {
  snapshot: ReportSnapshot;
  month: number;
  year: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, month: m } = useMonthStatus(month, year);
  const listQuery = useQuery({ ...trpc.settlements.list.queryOptions(), enabled: Boolean(m?.settlement) });
  const settlement = listQuery.data?.find((s) => s.id === m?.settlement?.settlementId);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const undo = useMutation(
    trpc.settlements.delete.mutationOptions({
      onSuccess: () => {
        setConfirmUndo(false);
        queryClient.invalidateQueries({ queryKey: trpc.reports.pathKey() });
        queryClient.invalidateQueries({ queryKey: trpc.settlements.pathKey() });
      },
    })
  );

  if (snapshot.splitSummary.settlements.length === 0 && !m?.settlement) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Settlement</CardTitle>
        <CardDescription>This month's share is from the report; settlement status is live.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {snapshot.splitSummary.settlements.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="font-medium">{s.fromUserName}</span>
            <span className="text-muted-foreground">owes</span>
            <span className="font-medium">{s.toUserName}</span>
            <span className="ml-2 text-lg font-semibold">{formatCurrency(s.amount)}</span>
            <span className="text-xs text-muted-foreground">this month</span>
          </div>
        ))}

        {m?.settlement && settlement && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">
                Settled {formatDay(m.settlement.settledOn)} · covered {formatMonthRange(m.settlement.coveredMonths)}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrency(settlement.amountOwed)} owed
              </span>
            </div>
            <ul className="space-y-0.5 text-xs">
              {settlement.payments.map((p) => (
                <li key={p.id} className="flex justify-between tabular-nums">
                  <span>Transfer {formatDay(p.paidOn)}</span>
                  <span>{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
            {settlement.difference !== 0 && (
              <p className="text-xs text-muted-foreground">
                Paid {formatCurrency(Math.abs(settlement.difference))} {settlement.difference > 0 ? "over" : "short"} —
                carried forward.
              </p>
            )}
            {settlement.note && <p className="text-xs text-muted-foreground">“{settlement.note}”</p>}
            {m.flags.adjustmentPending && (
              <p className="text-xs">
                This month changed after settling: {formatCurrency(Math.abs(m.settlement.pendingAdjustment))} adjustment
                pending ({whoOwes(m.settlement.pendingAdjustment, data?.pair)}). The next settlement includes it.
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              {confirmUndo ? (
                <>
                  <span className="text-xs">
                    Undo this settlement? {formatMonthRange(m.settlement.coveredMonths)} become open again.
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    disabled={undo.isPending}
                    onClick={() => undo.mutate({ id: settlement.id })}
                  >
                    Undo settlement
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmUndo(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmUndo(true)}>
                  Undo settlement…
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

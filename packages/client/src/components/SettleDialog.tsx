import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { useTRPC } from "../lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { describeOwed, formatCurrency, formatMonthKey, whoOwes } from "../lib/format";

/**
 * Record that the household settled up: pick open months (pending
 * adjustments and any carried difference come along automatically), check
 * their reports are current, and enter the transfers that paid it — often
 * several, since an e-transfer caps at $3,000. Whatever the transfers miss
 * or overshoot by carries forward. Amounts owed are computed by the server
 * (`settlements.plan`); this dialog only picks months and enters transfers.
 */

export const E_TRANSFER_LIMIT = 3000;

const PROBLEM_LABEL: Record<string, string> = {
  no_items: "no line items",
  no_report: "no report yet",
  report_outdated: "report outdated",
  already_settled: "already settled",
  no_household_pair: "needs two people in the household",
};

interface Transfer {
  amount: string;
  paidOn: string;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const toCents = (n: number) => Math.round(n * 100) / 100;

/** Equal-ish transfers no larger than the e-transfer limit. */
function splitByLimit(total: number): number[] {
  if (total <= 0) return [];
  const parts: number[] = [];
  let left = toCents(total);
  while (left > E_TRANSFER_LIMIT) {
    parts.push(E_TRANSFER_LIMIT);
    left = toCents(left - E_TRANSFER_LIMIT);
  }
  if (left > 0) parts.push(left);
  return parts;
}

interface SettleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The month the operator is looking at; the default covers open months up to it. */
  month: number;
  year: number;
}

export function SettleDialog({ open, onOpenChange, month, year }: SettleDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ ...trpc.reports.status.queryOptions(), enabled: open });
  const status = statusQuery.data;
  const pair = status?.pair;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [transfers, setTransfers] = useState<Transfer[]>([{ amount: "", paidOn: today() }]);
  const [transfersTouched, setTransfersTouched] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Default: every open month up to the one being viewed.
  const selectedKey = `${year}-${String(month).padStart(2, "0")}`;
  useEffect(() => {
    if (!open || !status) return;
    const openMonths = status.outstanding.openMonths;
    const upTo = openMonths.filter((k) => k <= selectedKey);
    setSelected(new Set(upTo.length > 0 ? upTo : openMonths));
    setTransfers([{ amount: "", paidOn: today() }]);
    setTransfersTouched(false);
    setNote("");
    setError(null);
  }, [open, status === undefined]);

  const selectedMonths = [...selected].sort().map((k) => {
    const [y, m] = k.split("-").map(Number);
    return { year: y, month: m };
  });
  const planQuery = useQuery({
    ...trpc.settlements.plan.queryOptions({ months: selectedMonths }),
    enabled: open && status !== undefined,
  });
  const plan = planQuery.data;

  // Until the operator edits transfers, propose paying the total in one go.
  useEffect(() => {
    if (!plan || transfersTouched) return;
    setTransfers([{ amount: plan.amountOwed > 0 ? plan.amountOwed.toFixed(2) : "", paidOn: today() }]);
  }, [plan?.amountOwed, transfersTouched]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.reports.pathKey() });
    queryClient.invalidateQueries({ queryKey: trpc.settlements.pathKey() });
  };

  const generate = useMutation(trpc.reports.generate.mutationOptions());
  const [regenerating, setRegenerating] = useState(false);
  const regenerateBlocking = async () => {
    if (!plan) return;
    setRegenerating(true);
    try {
      for (const p of plan.problems) {
        if (p.problem !== "no_report" && p.problem !== "report_outdated") continue;
        const [y, m] = p.key.split("-").map(Number);
        await generate.mutateAsync({ month: m, year: y });
      }
    } finally {
      setRegenerating(false);
      invalidate();
    }
  };

  const create = useMutation(
    trpc.settlements.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        onOpenChange(false);
      },
      onError: (e) => setError(e.message),
    })
  );

  const editTransfers = (next: Transfer[]) => {
    setTransfersTouched(true);
    setTransfers(next);
  };

  const parsed = transfers.map((t) => ({ amount: Number(t.amount), paidOn: t.paidOn }));
  const transfersValid =
    parsed.length > 0 && parsed.every((t) => Number.isFinite(t.amount) && t.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.paidOn));
  const paid = toCents(parsed.reduce((s, t) => s + (Number.isFinite(t.amount) ? t.amount : 0), 0));
  const difference = plan ? toCents(paid - plan.amountOwed) : 0;
  const fixable = plan?.problems.filter((p) => p.problem === "no_report" || p.problem === "report_outdated") ?? [];
  const nothingToSettle =
    plan !== undefined && plan.months.length === 0 && plan.adjustments.length === 0 && Math.abs(plan.carried) < 0.005;
  const canSave = plan !== undefined && plan.problems.length === 0 && !nothingToSettle && transfersValid && !create.isPending;

  const fromName = plan?.fromUserId === pair?.a.id ? pair?.a.name : pair?.b.name;
  const toName = plan?.toUserId === pair?.a.id ? pair?.a.name : pair?.b.name;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const liveShare = (key: string) => status?.months.find((m) => m.key === key)?.share.live ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settle up</DialogTitle>
          <DialogDescription>
            Record the transfers that settled these months. Nothing is matched to imported e-transfers.
          </DialogDescription>
        </DialogHeader>

        {!status ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1 text-sm">
            <section className="space-y-1.5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open months</h3>
              {status.outstanding.openMonths.length === 0 ? (
                <p className="text-xs text-muted-foreground">Every month with items is settled.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {status.outstanding.openMonths.map((key) => {
                    const problem = plan?.problems.find((p) => p.key === key);
                    return (
                      <li key={key}>
                        <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={() => toggle(key)}
                            className="rounded border-muted-foreground/40"
                          />
                          <span className="w-20">{formatMonthKey(key)}</span>
                          {problem && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              {PROBLEM_LABEL[problem.problem]}
                            </span>
                          )}
                          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                            {describeOwed(liveShare(key), pair)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {plan && plan.adjustments.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Adjustments included
                </h3>
                <p className="text-xs text-muted-foreground">
                  These settled months changed after they were settled; the difference is added here.
                </p>
                <ul className="space-y-0.5">
                  {plan.adjustments.map((a) => (
                    <li key={a.key} className="flex justify-between text-xs">
                      <span>{formatMonthKey(a.key)}</span>
                      <span className="tabular-nums">{describeOwed(a.amount, pair)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan && Math.abs(plan.carried) >= 0.005 && (
              <p className="flex justify-between text-xs">
                <span>Carried from earlier settlements</span>
                <span className="tabular-nums">{describeOwed(plan.carried, pair)}</span>
              </p>
            )}

            {plan && fixable.length > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span className="flex-1">
                  Settling records each month's share from its report, so{" "}
                  {fixable.map((p) => formatMonthKey(p.key)).join(", ")}{" "}
                  {fixable.length === 1 ? "needs its" : "need their"} report generated first.
                </span>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={regenerating} onClick={regenerateBlocking}>
                  {regenerating ? "Generating…" : `Generate ${fixable.length} report${fixable.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            )}

            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">Total owed</span>
              <span className="text-base font-semibold tabular-nums">
                {plan ? (plan.amountOwed > 0 ? `${whoOwes(plan.total, pair)} ${formatCurrency(plan.amountOwed)}` : "Nothing owed") : "…"}
              </span>
            </div>

            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Transfers{fromName && toName && plan && plan.amountOwed > 0 ? ` · ${fromName} → ${toName}` : ""}
                </h3>
                {plan && plan.amountOwed > E_TRANSFER_LIMIT && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() =>
                      editTransfers(
                        splitByLimit(plan.amountOwed).map((amount, i) => ({
                          amount: amount.toFixed(2),
                          paidOn: transfers[i]?.paidOn ?? today(),
                        }))
                      )
                    }
                  >
                    Split into {formatCurrency(E_TRANSFER_LIMIT)} transfers
                  </button>
                )}
              </div>
              {transfers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    aria-label={`Transfer ${i + 1} amount`}
                    placeholder="Amount"
                    value={t.amount}
                    onChange={(e) =>
                      editTransfers(transfers.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                    }
                    className="h-8 flex-1 tabular-nums"
                  />
                  <Input
                    type="date"
                    aria-label={`Transfer ${i + 1} date`}
                    value={t.paidOn}
                    onChange={(e) =>
                      editTransfers(transfers.map((x, j) => (j === i ? { ...x, paidOn: e.target.value } : x)))
                    }
                    className="h-8 w-40"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={`Remove transfer ${i + 1}`}
                    disabled={transfers.length === 1}
                    onClick={() => editTransfers(transfers.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => editTransfers([...transfers, { amount: "", paidOn: today() }])}
              >
                + Add transfer
              </Button>
              {plan && transfersValid && (
                <p className="text-xs text-muted-foreground">
                  {transfers.length} transfer{transfers.length === 1 ? "" : "s"} totalling {formatCurrency(paid)}
                  {Math.abs(difference) < 0.005
                    ? " — matches what is owed."
                    : ` — ${formatCurrency(Math.abs(difference))} ${difference > 0 ? "over" : "short"}; the difference carries forward to the next settlement.`}
                </p>
              )}
            </section>

            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="h-8"
            />

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              setError(null);
              create.mutate({ months: selectedMonths, payments: parsed, note: note.trim() || null });
            }}
          >
            {create.isPending ? "Saving…" : "Record settlement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { settlements, settlementPayments, settlementMonths } from "../db/schema";
import { monthKey } from "../lib/months";
import { MONEY_EPSILON, type MonthStatusReport, type Pair, type SettlementRecord } from "./monthStatus";

/**
 * Recording that the household settled up. A settlement covers one or more
 * open months plus every pending adjustment, records what was owed at settle
 * time, and is paid by one or more transfers (an e-transfer caps at $3,000,
 * so a catch-up is often several). Transfers may total more or less than
 * owed; the difference carries forward into the outstanding balance and the
 * next settlement's suggested total.
 *
 * The amounts a settlement records are always recomputed here from live
 * month status — the client only chooses months and enters transfers.
 * See .documentation/SOP/settlement.md.
 */

export type SettlementProblem =
  | "no_items"
  | "no_report"
  | "report_outdated"
  | "already_settled"
  | "no_household_pair";

export interface SettlementPlan {
  pair: Pair | null;
  /** Covered months with the share recorded for each (canonical sign). */
  months: Array<{ key: string; year: number; month: number; share: number }>;
  /** Pending adjustments on settled months, included automatically. */
  adjustments: Array<{ key: string; year: number; month: number; amount: number }>;
  /** Over/under-payments carried from earlier settlements (canonical). */
  carried: number;
  /** months + adjustments + carried (canonical; positive = pair.a owes pair.b). */
  total: number;
  fromUserId: number | null;
  toUserId: number | null;
  /** |total|, owed from → to. */
  amountOwed: number;
  /** Months that block settling, and why. Empty when the plan can be saved. */
  problems: Array<{ key: string; problem: SettlementProblem }>;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** What settling these months would record. Pure: derived from month status. */
export function planSettlement(status: MonthStatusReport, monthKeys: string[]): SettlementPlan {
  const byKey = new Map(status.months.map((m) => [m.key, m]));
  const problems: SettlementPlan["problems"] = [];
  const months: SettlementPlan["months"] = [];

  if (!status.pair) problems.push({ key: "", problem: "no_household_pair" });

  for (const key of [...new Set(monthKeys)].sort()) {
    const m = byKey.get(key);
    if (!m || m.itemCount === 0) problems.push({ key, problem: "no_items" });
    else if (m.settlement) problems.push({ key, problem: "already_settled" });
    else if (!m.report) problems.push({ key, problem: "no_report" });
    else if (!m.report.current) problems.push({ key, problem: "report_outdated" });
    // Current report, so the snapshot share equals the live one; record
    // only what is still due (an undone settlement may have left adjustment
    // rows for this month that were already paid).
    else months.push({ key, year: m.year, month: m.month, share: m.share.due });
  }

  const adjustments = status.months
    .filter((m) => m.flags.adjustmentPending)
    .map((m) => ({ key: m.key, year: m.year, month: m.month, amount: m.settlement!.pendingAdjustment }));

  const carried = status.outstanding.carried;
  const total = round(
    months.reduce((s, m) => s + m.share, 0) + adjustments.reduce((s, a) => s + a.amount, 0) + carried
  );

  const [from, to] =
    status.pair === null ? [null, null] : total >= 0 ? [status.pair.a, status.pair.b] : [status.pair.b, status.pair.a];

  return {
    pair: status.pair,
    months,
    adjustments,
    carried,
    total,
    fromUserId: from?.id ?? null,
    toUserId: to?.id ?? null,
    amountOwed: round(Math.abs(total)),
    problems,
  };
}

export function loadSettlementRecords(): SettlementRecord[] {
  const rows = db.select().from(settlements).orderBy(asc(settlements.createdAt), asc(settlements.id)).all();
  const months = db.select().from(settlementMonths).all();
  const payments = db.select().from(settlementPayments).orderBy(asc(settlementPayments.paidOn)).all();
  return rows.map((s) => ({
    id: s.id,
    fromUserId: s.fromUserId,
    toUserId: s.toUserId,
    amountOwed: s.amountOwed,
    note: s.note,
    createdAt: s.createdAt,
    months: months
      .filter((m) => m.settlementId === s.id)
      .map((m) => ({ year: m.periodYear, month: m.periodMonth, amountOwed: m.amountOwed, isAdjustment: m.isAdjustment }))
      .sort((a, b) => monthKey(a.year, a.month).localeCompare(monthKey(b.year, b.month))),
    payments: payments
      .filter((p) => p.settlementId === s.id)
      .map((p) => ({ id: p.id, amount: p.amount, paidOn: p.paidOn })),
  }));
}

/**
 * Save a plan with its transfers. The caller checks `plan.problems` first;
 * rows are stored in the settlement's from → to direction.
 */
export function saveSettlement(
  plan: SettlementPlan,
  payments: Array<{ amount: number; paidOn: string }>,
  note: string | null
): number {
  if (plan.problems.length > 0 || plan.fromUserId === null || plan.toUserId === null) {
    throw new Error("Settlement plan has problems");
  }
  const dir = plan.total >= 0 ? 1 : -1;
  return db.transaction((tx) => {
    const { id } = tx
      .insert(settlements)
      .values({ fromUserId: plan.fromUserId!, toUserId: plan.toUserId!, amountOwed: plan.amountOwed, note })
      .returning({ id: settlements.id })
      .get();
    const rows = [
      ...plan.months.map((m) => ({ year: m.year, month: m.month, amount: m.share, isAdjustment: false })),
      ...plan.adjustments.map((a) => ({ year: a.year, month: a.month, amount: a.amount, isAdjustment: true })),
    ];
    for (const r of rows) {
      tx.insert(settlementMonths)
        .values({
          settlementId: id,
          periodYear: r.year,
          periodMonth: r.month,
          amountOwed: round(dir * r.amount),
          isAdjustment: r.isAdjustment,
        })
        .run();
    }
    for (const p of payments) {
      tx.insert(settlementPayments).values({ settlementId: id, amount: round(p.amount), paidOn: p.paidOn }).run();
    }
    return id;
  });
}

/** Undo: the months (and adjustments) it covered become open again. */
export function deleteSettlement(id: number): boolean {
  return db.transaction((tx) => {
    tx.delete(settlementPayments).where(eq(settlementPayments.settlementId, id)).run();
    tx.delete(settlementMonths).where(eq(settlementMonths.settlementId, id)).run();
    return tx.delete(settlements).where(eq(settlements.id, id)).run().changes > 0;
  });
}

/** Paid − owed for a stored settlement, from → to. Positive = overpaid. */
export function paymentDifference(s: SettlementRecord): number {
  const paid = s.payments.reduce((t, p) => t + p.amount, 0);
  const diff = round(paid - s.amountOwed);
  return Math.abs(diff) < MONEY_EPSILON ? 0 : diff;
}

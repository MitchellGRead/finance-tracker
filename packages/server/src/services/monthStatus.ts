import type { ReportSnapshot } from "@finance-tracker/shared";
import { lineItems, categories, users } from "../db/schema";
import { computeReport } from "./computeReport";
import { monthKey, parseMonthKey } from "../lib/months";

/**
 * Where each month stands: Imported → Reviewed → Reported → Settled, plus
 * the flags on top (report outdated, adjustment pending, unreviewed). All of
 * it is derived — never stored as a status — from line items, report
 * snapshots and settlement records. One call covers every month so the
 * header calendar renders from a single query.
 *
 * Staleness is a **diff of numbers**: the month is recomputed live with
 * `computeReport` and compared against its snapshot. Timestamps are never
 * consulted — bulk backfills and rule re-application bump `updated_at`
 * without changing a figure, and must not flag anything.
 *
 * Settlement amounts are signed in one canonical direction for the
 * two-person household: positive means `pair.a` owes `pair.b`. N > 2 is out
 * of scope.
 */

type LineItemRow = typeof lineItems.$inferSelect;
type UserRow = typeof users.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;

/** Below this, money differences are rounding. */
export const MONEY_EPSILON = 0.005;

export type MonthStage = "empty" | "imported" | "reviewed" | "reported" | "settled";

export interface Pair {
  a: { id: number; name: string };
  b: { id: number; name: string };
}

/** A stored settlement with its months and payments (see settlements service). */
export interface SettlementRecord {
  id: number;
  fromUserId: number;
  toUserId: number;
  /** Total owed at settle time (months + adjustments + carried difference), from → to. */
  amountOwed: number;
  note: string | null;
  createdAt: string;
  months: Array<{ year: number; month: number; amountOwed: number; isAdjustment: boolean }>;
  payments: Array<{ id: number; amount: number; paidOn: string }>;
}

export interface ReportDiff {
  /** Plain-language parts, most important first. */
  changes: string[];
  /** `changes` joined: "2 items changed · total $13,101 → $13,128 · …" */
  summary: string;
  /** Null when the snapshot predates item digests. */
  itemsChanged: number | null;
  total: { from: number; to: number };
  share: { from: number; to: number };
}

export interface MonthStatus {
  key: string;
  year: number;
  month: number;
  itemCount: number;
  pendingCount: number;
  /** Accepted items with no category. */
  uncategorizedCount: number;
  reviewed: boolean;
  report: { generatedAt: string; current: boolean; diff: ReportDiff | null } | null;
  /**
   * Canonical signed share owed for the month, live and as snapshotted, and
   * — for an open month — what is still due: live minus anything already
   * recorded for it (adjustment rows left behind when the settlement that
   * covered it was undone).
   */
  share: { live: number; snapshot: number | null; due: number };
  settlement: {
    settlementId: number;
    /** Latest transfer date. */
    settledOn: string;
    paymentCount: number;
    coveredMonths: string[];
    /** Σ recorded for this month (share at settle time + included adjustments), canonical. */
    recorded: number;
    /** live − recorded: what the next settlement will include. */
    pendingAdjustment: number;
  } | null;
  stage: MonthStage;
  flags: { outdated: boolean; adjustmentPending: boolean; unreviewed: boolean };
}

export interface Outstanding {
  /** Canonical signed total: unsettled shares + pending adjustments + carried. */
  total: number;
  unsettledShares: number;
  pendingAdjustments: number;
  /** Σ recorded owed − Σ paid across settlements (over/under-payments). */
  carried: number;
  /** Months with items not yet covered by a settlement, oldest first. */
  openMonths: string[];
}

export interface MonthStatusReport {
  pair: Pair | null;
  months: MonthStatus[];
  outstanding: Outstanding;
}

const round = (n: number) => Math.round(n * 100) / 100;
const differs = (a: number, b: number) => Math.abs(a - b) > MONEY_EPSILON;

const dollars = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
const cents = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

export function pairOf(allUsers: Array<{ id: number; name: string }>): Pair | null {
  const [a, b] = [...allUsers].sort((x, y) => x.id - y.id);
  return a && b ? { a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } } : null;
}

/** The month's share owed, signed: positive = `pair.a` owes `pair.b`. */
export function shareOf(report: ReportSnapshot, pair: Pair | null): number {
  if (!pair) return 0;
  let net = 0;
  for (const s of report.splitSummary.settlements) {
    if (s.fromUserId === pair.a.id && s.toUserId === pair.b.id) net += s.amount;
    else if (s.fromUserId === pair.b.id && s.toUserId === pair.a.id) net -= s.amount;
  }
  return round(net);
}

/** +1 when a settlement's from → to is the canonical direction, else −1. */
export function directionOf(s: { fromUserId: number }, pair: Pair | null): 1 | -1 {
  return pair && s.fromUserId === pair.b.id ? -1 : 1;
}

/** "Jadyn owes Mitchell $12.00" for a canonical signed amount. */
export function describeShare(amount: number, pair: Pair | null): string {
  if (!pair || !differs(amount, 0)) return "$0.00";
  const [from, to] = amount > 0 ? [pair.a, pair.b] : [pair.b, pair.a];
  return `${from.name} owes ${to.name} ${cents(Math.abs(amount))}`;
}

const householdTotal = (r: ReportSnapshot) => round(r.categoryTotals.reduce((s, c) => s + c.total, 0));

/**
 * Null when the snapshot still matches live data. Compares accepted /
 * rejected counts, category totals, per-user totals and the share owed —
 * the numbers a report shows.
 */
export function diffReport(snapshot: ReportSnapshot, live: ReportSnapshot, pair: Pair | null): ReportDiff | null {
  const changes: string[] = [];

  let itemsChanged: number | null = null;
  if (snapshot.itemStates && live.itemStates) {
    const ids = new Set([...Object.keys(snapshot.itemStates), ...Object.keys(live.itemStates)]);
    itemsChanged = [...ids].filter((id) => snapshot.itemStates![id] !== live.itemStates![id]).length;
  }

  const catKey = (id: number | null) => (id === null ? "null" : String(id));
  const snapCats = new Map(snapshot.categoryTotals.map((c) => [catKey(c.categoryId), c]));
  const liveCats = new Map(live.categoryTotals.map((c) => [catKey(c.categoryId), c]));
  const categoryChanges = [...new Set([...snapCats.keys(), ...liveCats.keys()])]
    .map((k) => ({
      name: liveCats.get(k)?.categoryName ?? snapCats.get(k)!.categoryName,
      from: snapCats.get(k)?.total ?? 0,
      to: liveCats.get(k)?.total ?? 0,
    }))
    .filter((c) => differs(c.from, c.to))
    .sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from));

  const userChanges = live.userBreakdowns
    .map((u) => ({
      name: u.userName,
      from: snapshot.userBreakdowns.find((s) => s.userId === u.userId)?.totalSpent ?? 0,
      to: u.totalSpent,
    }))
    .filter((u) => differs(u.from, u.to));

  const total = { from: householdTotal(snapshot), to: householdTotal(live) };
  const share = { from: shareOf(snapshot, pair), to: shareOf(live, pair) };
  const countsChanged =
    snapshot.acceptedCount !== live.acceptedCount || snapshot.rejectedCount !== live.rejectedCount;

  const outdated =
    countsChanged ||
    categoryChanges.length > 0 ||
    userChanges.length > 0 ||
    differs(total.from, total.to) ||
    differs(share.from, share.to);
  if (!outdated) return null;

  if (itemsChanged !== null && itemsChanged > 0) {
    changes.push(`${itemsChanged} item${itemsChanged === 1 ? "" : "s"} changed`);
  } else if (countsChanged) {
    changes.push(
      `accepted ${snapshot.acceptedCount} → ${live.acceptedCount}, rejected ${snapshot.rejectedCount} → ${live.rejectedCount}`
    );
  }
  if (differs(total.from, total.to)) changes.push(`total ${dollars(total.from)} → ${dollars(total.to)}`);
  if (differs(share.from, share.to)) {
    const flipped = Math.sign(share.from) !== Math.sign(share.to) && differs(share.from, 0) && differs(share.to, 0);
    changes.push(
      flipped
        ? `settlement ${describeShare(share.from, pair)} → ${describeShare(share.to, pair)}`
        : `settlement ${cents(Math.abs(share.from))} → ${cents(Math.abs(share.to))}`
    );
  }
  for (const c of categoryChanges.slice(0, 3)) changes.push(`${c.name} ${dollars(c.from)} → ${dollars(c.to)}`);
  if (categoryChanges.length > 3) changes.push(`${categoryChanges.length - 3} more categories`);

  return { changes, summary: changes.join(" · "), itemsChanged, total, share };
}

export function computeMonthStatuses(input: {
  items: LineItemRow[];
  users: UserRow[];
  categories: CategoryRow[];
  snapshots: ReportSnapshot[];
  settlements: SettlementRecord[];
}): MonthStatusReport {
  const pair = pairOf(input.users);
  const snapshotByMonth = new Map(input.snapshots.map((s) => [monthKey(s.periodYear, s.periodMonth), s]));

  const itemsByMonth = new Map<string, LineItemRow[]>();
  for (const item of input.items) {
    const key = item.date.slice(0, 7);
    const list = itemsByMonth.get(key) ?? [];
    list.push(item);
    itemsByMonth.set(key, list);
  }

  // Which settlement covers each month, and everything recorded against it.
  const coverBy = new Map<string, SettlementRecord>();
  const recordedBy = new Map<string, number>();
  for (const s of input.settlements) {
    const dir = directionOf(s, pair);
    for (const m of s.months) {
      const key = monthKey(m.year, m.month);
      if (!m.isAdjustment) coverBy.set(key, s);
      recordedBy.set(key, round((recordedBy.get(key) ?? 0) + dir * m.amountOwed));
    }
  }

  const keys = [...new Set([...itemsByMonth.keys(), ...snapshotByMonth.keys(), ...coverBy.keys()])].sort();

  const months = keys.map((key): MonthStatus => {
    const { year, month } = parseMonthKey(key);
    const items = itemsByMonth.get(key) ?? [];
    const pendingCount = items.filter((i) => i.status === "pending").length;
    const uncategorizedCount = items.filter((i) => i.status === "accepted" && i.categoryId === null).length;
    const reviewed = items.length > 0 && pendingCount === 0 && uncategorizedCount === 0;

    // computeReport filters to the month itself; pass only this month's items.
    const live = computeReport(items, input.users, input.categories, month, year);
    const snapshot = snapshotByMonth.get(key) ?? null;
    const diff = snapshot ? diffReport(snapshot, live, pair) : null;
    const report = snapshot ? { generatedAt: snapshot.generatedAt, current: diff === null, diff } : null;
    const liveShare = shareOf(live, pair);

    const cover = coverBy.get(key);
    const recorded = recordedBy.get(key) ?? 0;
    const settlement = cover
      ? {
          settlementId: cover.id,
          settledOn: cover.payments.map((p) => p.paidOn).sort().at(-1) ?? cover.createdAt.slice(0, 10),
          paymentCount: cover.payments.length,
          coveredMonths: cover.months
            .filter((m) => !m.isAdjustment)
            .map((m) => monthKey(m.year, m.month))
            .sort(),
          recorded,
          pendingAdjustment: round(liveShare - recorded),
        }
      : null;

    const stage: MonthStage =
      items.length === 0 && !snapshot && !settlement
        ? "empty"
        : settlement
          ? "settled"
          : report?.current
            ? "reported"
            : reviewed
              ? "reviewed"
              : items.length > 0
                ? "imported"
                : "empty";

    return {
      key,
      year,
      month,
      itemCount: items.length,
      pendingCount,
      uncategorizedCount,
      reviewed,
      report,
      share: {
        live: liveShare,
        snapshot: snapshot ? shareOf(snapshot, pair) : null,
        due: settlement ? 0 : round(liveShare - recorded),
      },
      settlement,
      stage,
      flags: {
        outdated: report !== null && !report.current,
        adjustmentPending: settlement !== null && differs(settlement.pendingAdjustment, 0),
        unreviewed: items.length > 0 && !reviewed,
      },
    };
  });

  const open = months.filter((m) => !m.settlement && m.itemCount > 0);
  const unsettledShares = round(open.reduce((s, m) => s + m.share.due, 0));
  const pendingAdjustments = round(
    months.reduce((s, m) => s + (m.flags.adjustmentPending ? m.settlement!.pendingAdjustment : 0), 0)
  );
  let carried = 0;
  for (const s of input.settlements) {
    const dir = directionOf(s, pair);
    carried += dir * s.months.reduce((t, m) => t + m.amountOwed, 0);
    carried -= dir * s.payments.reduce((t, p) => t + p.amount, 0);
  }
  carried = round(carried);

  return {
    pair,
    months,
    outstanding: {
      total: round(unsettledShares + pendingAdjustments + carried),
      unsettledShares,
      pendingAdjustments,
      carried,
      openMonths: open.map((m) => m.key),
    },
  };
}

import { describe, it, expect, vi } from "vitest";

// planSettlement is pure; keep the module's DB import from opening a file.
vi.mock("../db", () => ({ db: {} }));

import { computeReport } from "./computeReport";
import { computeMonthStatuses, type SettlementRecord } from "./monthStatus";
import { paymentDifference, planSettlement } from "./settlements";
import { category, lineItem, user, type LineItemRow } from "../test/builders";

const MITCHELL = user(1, "Mitchell");
const JADYN = user(2, "Jadyn");
const USERS = [MITCHELL, JADYN];
const GROCERIES = category(2, "Groceries");

// Each month Mitchell pays $200 of shared groceries: Jadyn owes $100.
const MONTHS = [4, 5, 6, 7, 8, 9];
const itemsFor = (months: number[], amount = 200): LineItemRow[] =>
  months.map((m) =>
    lineItem({ date: `2026-${String(m).padStart(2, "0")}-05`, amount, userId: MITCHELL.id, categoryId: GROCERIES.id })
  );
const snap = (items: LineItemRow[], m: number) => computeReport(items, USERS, [GROCERIES], m, 2026);
const status = (items: LineItemRow[], reported: number[], settlements: SettlementRecord[] = []) =>
  computeMonthStatuses({
    items,
    users: USERS,
    categories: [GROCERIES],
    snapshots: reported.map((m) => snap(items, m)),
    settlements,
  });
const keys = (months: number[]) => months.map((m) => `2026-${String(m).padStart(2, "0")}`);

describe("planSettlement", () => {
  it("settles Apr–Sep: Jadyn owes Mitchell the sum of the six shares", () => {
    const items = itemsFor(MONTHS);
    const plan = planSettlement(status(items, MONTHS), keys(MONTHS));
    expect(plan.problems).toEqual([]);
    expect(plan.months.map((m) => [m.key, m.share])).toEqual(keys(MONTHS).map((k) => [k, -100]));
    expect(plan).toMatchObject({ total: -600, amountOwed: 600, fromUserId: JADYN.id, toUserId: MITCHELL.id });
  });

  it("refuses months whose report is missing or outdated, or that are settled or empty", () => {
    const items = itemsFor(MONTHS);
    const snapshots = [4, 5].map((m) => snap(items, m));
    const edited = items.map((i) => (i.date.startsWith("2026-05") ? { ...i, amount: 300 } : i));
    const settled: SettlementRecord = {
      id: 1,
      fromUserId: JADYN.id,
      toUserId: MITCHELL.id,
      amountOwed: 100,
      note: null,
      createdAt: "2026-05-01",
      months: [{ year: 2026, month: 4, amountOwed: 100, isAdjustment: false }],
      payments: [{ id: 1, amount: 100, paidOn: "2026-05-01" }],
    };
    const s = computeMonthStatuses({ items: edited, users: USERS, categories: [GROCERIES], snapshots, settlements: [settled] });
    expect(planSettlement(s, ["2026-04", "2026-05", "2026-06", "2026-12"]).problems).toEqual([
      { key: "2026-04", problem: "already_settled" },
      { key: "2026-05", problem: "report_outdated" },
      { key: "2026-06", problem: "no_report" },
      { key: "2026-12", problem: "no_items" },
    ]);
  });

  it("includes pending adjustments and the carried difference", () => {
    const items = itemsFor([4, 5]);
    const first: SettlementRecord = {
      id: 1,
      fromUserId: JADYN.id,
      toUserId: MITCHELL.id,
      amountOwed: 100,
      note: null,
      createdAt: "2026-05-01",
      months: [{ year: 2026, month: 4, amountOwed: 100, isAdjustment: false }],
      // Paid $10 short.
      payments: [{ id: 1, amount: 90, paidOn: "2026-05-01" }],
    };
    // April later grows from $200 to $228 shared: $14 more owed.
    const edited = items.map((i) => (i.date.startsWith("2026-04") ? { ...i, amount: 228 } : i));
    const s = computeMonthStatuses({
      items: edited,
      users: USERS,
      categories: [GROCERIES],
      snapshots: [4, 5].map((m) => snap(edited, m)),
      settlements: [first],
    });
    const plan = planSettlement(s, ["2026-05"]);
    expect(plan.adjustments).toEqual([{ key: "2026-04", year: 2026, month: 4, amount: -14 }]);
    expect(plan.carried).toBe(-10);
    expect(plan).toMatchObject({ total: -124, amountOwed: 124, fromUserId: JADYN.id });
  });

  it("flips direction when the other person owes overall", () => {
    const items = itemsFor([4]).map((i) => ({ ...i, userId: JADYN.id }));
    const plan = planSettlement(status(items, [4]), ["2026-04"]);
    expect(plan).toMatchObject({ total: 100, fromUserId: MITCHELL.id, toUserId: JADYN.id, amountOwed: 100 });
  });
});

describe("paymentDifference", () => {
  const base: SettlementRecord = {
    id: 1,
    fromUserId: 2,
    toUserId: 1,
    amountOwed: 6000,
    note: null,
    createdAt: "2026-10-26",
    months: [],
    payments: [
      { id: 1, amount: 3000, paidOn: "2026-10-26" },
      { id: 2, amount: 3000, paidOn: "2026-10-27" },
    ],
  };
  it("is zero when transfers cover what was owed", () => expect(paymentDifference(base)).toBe(0));
  it("is negative when underpaid", () =>
    expect(paymentDifference({ ...base, payments: [{ id: 1, amount: 5990, paidOn: "2026-10-26" }] })).toBe(-10));
});

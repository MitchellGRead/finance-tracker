import { describe, it, expect } from "vitest";
import { lineItems, users, categories } from "../db/schema";
import { computeReport } from "./computeReport";
import { computeMonthStatuses, diffReport, pairOf, type SettlementRecord } from "./monthStatus";

type LineItemRow = typeof lineItems.$inferSelect;
type UserRow = typeof users.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;

const TS = "2026-04-01T00:00:00.000Z";
const MITCHELL: UserRow = { id: 1, name: "Mitchell", createdAt: TS, updatedAt: TS };
const JADYN: UserRow = { id: 2, name: "Jadyn", createdAt: TS, updatedAt: TS };
const USERS = [MITCHELL, JADYN];
const GROCERIES: CategoryRow = { id: 2, name: "Groceries", defaultSplitRatio: null, createdAt: TS, updatedAt: TS };
const DINE: CategoryRow = { id: 3, name: "Dine", defaultSplitRatio: null, createdAt: TS, updatedAt: TS };
const CATEGORIES = [GROCERIES, DINE];

let nextId = 1;
const item = (o: Partial<LineItemRow> & Pick<LineItemRow, "date" | "amount">): LineItemRow => ({
  id: nextId++,
  statementId: null,
  userId: MITCHELL.id,
  description: "item",
  categoryId: GROCERIES.id,
  splitRatio: 0.5,
  status: "accepted",
  statusOverride: false,
  categoryOverride: false,
  splitRatioOverride: false,
  note: null,
  isManual: false,
  isCredit: false,
  fingerprint: null,
  suggestedCategoryId: null,
  suggestedCategoryConfidence: null,
  suggestedSplitRatio: null,
  suggestedSplitConfidence: null,
  suggestionStatus: null,
  suggestionModel: null,
  suggestedAt: null,
  createdAt: TS,
  updatedAt: TS,
  ...o,
});

const snap = (items: LineItemRow[], month: number, year = 2026) =>
  computeReport(items, USERS, CATEGORIES, month, year);

const statuses = (items: LineItemRow[], snapshots = [] as ReturnType<typeof snap>[], settlements: SettlementRecord[] = []) =>
  computeMonthStatuses({ items, users: USERS, categories: CATEGORIES, snapshots, settlements });

// Mitchell paid $200 of shared groceries in April: Jadyn owes him $100.
const april = () => [
  item({ date: "2026-04-03", amount: 120 }),
  item({ date: "2026-04-10", amount: 80 }),
];

describe("report staleness", () => {
  it("is current right after generating, and not reported without a snapshot", () => {
    const items = april();
    expect(statuses(items).months[0]).toMatchObject({ report: null, stage: "reviewed" });
    const m = statuses(items, [snap(items, 4)]).months[0];
    expect(m.report).toMatchObject({ current: true, diff: null });
    expect(m.stage).toBe("reported");
  });

  it("flags an edit with an accurate diff, and clears when the edit is reverted", () => {
    const items = april();
    const snapshot = snap(items, 4);
    const edited = items.map((i, n) => (n === 0 ? { ...i, amount: 147.7 } : i));
    const m = statuses(edited, [snapshot]).months[0];
    expect(m.flags.outdated).toBe(true);
    expect(m.stage).toBe("reviewed");
    expect(m.report!.diff!.summary).toBe(
      "1 item changed · total $200 → $228 · settlement $100.00 → $113.85 · Groceries $200 → $228"
    );
    expect(statuses(items, [snapshot]).months[0].flags.outdated).toBe(false);
  });

  it("flags nothing when a bulk touch bumps updated_at without changing data", () => {
    const items = april();
    const snapshot = snap(items, 4);
    const touched = items.map((i) => ({ ...i, updatedAt: "2026-10-25T23:54:00.000Z", note: "backfilled" }));
    expect(statuses(touched, [snapshot]).months[0].flags.outdated).toBe(false);
  });

  it("diffs old snapshots without an item digest by their counts", () => {
    const items = april();
    const { itemStates: _drop, ...legacy } = snap(items, 4);
    const rejected = items.map((i, n) => (n === 1 ? { ...i, status: "rejected" } : i));
    const diff = diffReport(legacy, snap(rejected, 4), pairOf(USERS));
    expect(diff!.itemsChanged).toBeNull();
    expect(diff!.changes[0]).toBe("accepted 2 → 1, rejected 0 → 1");
  });

  it("names both people when the settlement direction flips", () => {
    const items = april();
    const flipped = items.map((i) => ({ ...i, userId: JADYN.id }));
    const diff = diffReport(snap(items, 4), snap(flipped, 4), pairOf(USERS));
    expect(diff!.changes).toContain("settlement Jadyn owes Mitchell $100.00 → Mitchell owes Jadyn $100.00");
  });
});

describe("review", () => {
  it("is not reviewed with a pending item", () => {
    const items = [...april(), item({ date: "2026-04-20", amount: 5, status: "pending" })];
    expect(statuses(items).months[0]).toMatchObject({ reviewed: false, pendingCount: 1, stage: "imported" });
  });

  it("is not reviewed with an accepted uncategorized item", () => {
    const items = [...april(), item({ date: "2026-04-20", amount: 5, categoryId: null })];
    const m = statuses(items).months[0];
    expect(m).toMatchObject({ reviewed: false, uncategorizedCount: 1 });
    expect(m.flags.unreviewed).toBe(true);
  });

  it("ignores rejected uncategorized items", () => {
    const items = [...april(), item({ date: "2026-04-20", amount: 5, categoryId: null, status: "rejected" })];
    expect(statuses(items).months[0].reviewed).toBe(true);
  });
});

describe("settlement", () => {
  // Apr–Sep, each month Mitchell pays $200 shared: Jadyn owes $100 per month.
  const months = [4, 5, 6, 7, 8, 9];
  const halfYear = () =>
    months.flatMap((m) => [item({ date: `2026-0${m}-05`, amount: 200 })]);
  // Canonical direction is Mitchell (id 1) → Jadyn (id 2); Jadyn owes, so the
  // settlement is from Jadyn to Mitchell and stored positive.
  const settlement = (over: Partial<SettlementRecord> = {}): SettlementRecord => ({
    id: 1,
    fromUserId: JADYN.id,
    toUserId: MITCHELL.id,
    amountOwed: 600,
    note: null,
    createdAt: "2026-10-26 01:00:00",
    months: months.map((m) => ({ year: 2026, month: m, amountOwed: 100, isAdjustment: false })),
    payments: [
      { id: 1, amount: 300, paidOn: "2026-10-24" },
      { id: 2, amount: 200, paidOn: "2026-10-26" },
      { id: 3, amount: 100, paidOn: "2026-10-25" },
    ],
    ...over,
  });

  it("before settling, every month is open and owed", () => {
    const items = halfYear();
    const report = statuses(items, months.map((m) => snap(items, m)));
    expect(report.outstanding).toMatchObject({ total: -600, unsettledShares: -600, carried: 0 });
    expect(report.outstanding.openMonths).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  });

  it("settling Apr–Sep in 3 transfers settles all six months", () => {
    const items = halfYear();
    const report = statuses(items, months.map((m) => snap(items, m)), [settlement()]);
    expect(report.months.every((m) => m.stage === "settled")).toBe(true);
    expect(report.months.at(-1)!.settlement).toMatchObject({
      settledOn: "2026-10-26",
      paymentCount: 3,
      recorded: -100,
      pendingAdjustment: 0,
      coveredMonths: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
    });
    expect(report.outstanding).toMatchObject({ total: 0, openMonths: [] });
  });

  it("an edit to a settled month shows an adjustment that the next settlement clears", () => {
    const items = halfYear();
    const edited = items.map((i) => (i.date.startsWith("2026-06") ? { ...i, amount: 228 } : i));
    const before = statuses(edited, months.map((m) => snap(edited, m)), [settlement()]);
    const june = before.months.find((m) => m.key === "2026-06")!;
    expect(june.flags.adjustmentPending).toBe(true);
    expect(june.settlement!.pendingAdjustment).toBe(-14);
    expect(before.outstanding.total).toBe(-14);

    const next = settlement({
      id: 2,
      amountOwed: 14,
      months: [{ year: 2026, month: 6, amountOwed: 14, isAdjustment: true }],
      payments: [{ id: 4, amount: 14, paidOn: "2026-11-01" }],
    });
    const after = statuses(edited, months.map((m) => snap(edited, m)), [settlement(), next]);
    const juneAfter = after.months.find((m) => m.key === "2026-06")!;
    expect(juneAfter.flags.adjustmentPending).toBe(false);
    // Still reported as settled by the settlement that covered it.
    expect(juneAfter.settlement!.settlementId).toBe(1);
    expect(after.outstanding.total).toBe(0);
  });

  it("carries a short payment forward, and clears it when the next settlement pays it", () => {
    const items = halfYear();
    const short = settlement({ payments: [{ id: 1, amount: 550, paidOn: "2026-10-26" }] });
    const report = statuses(items, months.map((m) => snap(items, m)), [short]);
    expect(report.outstanding).toMatchObject({ carried: -50, total: -50 });

    const october = [...items, item({ date: "2026-10-05", amount: 200 })];
    const catchUp = settlement({
      id: 2,
      amountOwed: 150,
      months: [{ year: 2026, month: 10, amountOwed: 100, isAdjustment: false }],
      payments: [{ id: 2, amount: 150, paidOn: "2026-11-02" }],
    });
    const later = statuses(october, [...months, 10].map((m) => snap(october, m)), [short, catchUp]);
    expect(later.outstanding.total).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { computeReport } from "./computeReport";
import { lineItems, users, categories } from "../db/schema";

type LineItemRow = typeof lineItems.$inferSelect;
type UserRow = typeof users.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;

const TS = "2026-04-01T00:00:00.000Z";

const user = (id: number, name: string): UserRow => ({
  id,
  name,
  createdAt: TS,
  updatedAt: TS,
});

const category = (id: number, name: string): CategoryRow => ({
  id,
  name,
  defaultSplitRatio: null,
  createdAt: TS,
  updatedAt: TS,
});

const item = (overrides: Partial<LineItemRow> & Pick<LineItemRow, "userId" | "amount">): LineItemRow => ({
  id: overrides.id ?? Math.floor(Math.random() * 1_000_000),
  statementId: null,
  userId: overrides.userId,
  date: overrides.date ?? "2026-04-15",
  description: overrides.description ?? "test item",
  amount: overrides.amount,
  categoryId: overrides.categoryId ?? null,
  splitRatio: overrides.splitRatio ?? 0.5,
  status: overrides.status ?? "accepted",
  statusOverride: overrides.statusOverride ?? false,
  categoryOverride: overrides.categoryOverride ?? false,
  splitRatioOverride: overrides.splitRatioOverride ?? false,
  note: overrides.note ?? null,
  isManual: overrides.isManual ?? false,
  isCredit: overrides.isCredit ?? false,
  suggestedCategoryId: overrides.suggestedCategoryId ?? null,
  suggestedCategoryConfidence: overrides.suggestedCategoryConfidence ?? null,
  suggestedSplitRatio: overrides.suggestedSplitRatio ?? null,
  suggestedSplitConfidence: overrides.suggestedSplitConfidence ?? null,
  suggestionStatus: overrides.suggestionStatus ?? null,
  suggestionModel: overrides.suggestionModel ?? null,
  suggestedAt: overrides.suggestedAt ?? null,
  createdAt: TS,
  updatedAt: TS,
});

const alice = user(1, "Alice");
const bob = user(2, "Bob");
const carol = user(3, "Carol");

const groceries = category(10, "Groceries");
const hobby = category(20, "Hobby");

describe("computeReport", () => {
  it("treats splitRatio=1.0 as personal with no settlement", () => {
    const result = computeReport(
      [item({ userId: 1, amount: 100, splitRatio: 1.0, categoryId: 20 })],
      [alice, bob],
      [groceries, hobby],
      4,
      2026
    );

    const aliceBreakdown = result.userBreakdowns.find((u) => u.userId === 1)!;
    expect(aliceBreakdown.personalSpending).toBe(100);
    expect(aliceBreakdown.sharedSpending).toBe(0);
    expect(aliceBreakdown.effectiveTotal).toBe(100);

    const hobbyTotals = result.categoryTotals.find((c) => c.categoryId === 20)!;
    expect(hobbyTotals.personalTotal).toBe(100);
    expect(hobbyTotals.sharedTotal).toBe(0);

    expect(result.splitSummary.settlements).toEqual([]);
  });

  it("splits 2-user default 50/50 and creates a settlement", () => {
    const result = computeReport(
      [item({ userId: 1, amount: 100, splitRatio: 0.5, categoryId: 10 })],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    expect(result.splitSummary.settlements).toEqual([
      {
        fromUserId: 2,
        fromUserName: "Bob",
        toUserId: 1,
        toUserName: "Alice",
        amount: 50,
      },
    ]);

    const aliceBreakdown = result.userBreakdowns.find((u) => u.userId === 1)!;
    // Alice's effective cost is her 50% share of the $100 she paid
    expect(aliceBreakdown.effectiveTotal).toBe(50);
  });

  it("handles custom split ratio (0.3 owner / 0.7 other)", () => {
    const result = computeReport(
      [item({ userId: 1, amount: 100, splitRatio: 0.3, categoryId: 10 })],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    expect(result.splitSummary.settlements).toEqual([
      {
        fromUserId: 2,
        fromUserName: "Bob",
        toUserId: 1,
        toUserName: "Alice",
        amount: 70,
      },
    ]);

    const aliceBreakdown = result.userBreakdowns.find((u) => u.userId === 1)!;
    expect(aliceBreakdown.effectiveTotal).toBe(30);
  });

  it("negates amount for credit items", () => {
    const result = computeReport(
      [
        item({ userId: 1, amount: 100, splitRatio: 0.5, categoryId: 10 }),
        item({ userId: 1, amount: 40, splitRatio: 0.5, categoryId: 10, isCredit: true }),
      ],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    const groceryCat = result.categoryTotals.find((c) => c.categoryId === 10)!;
    expect(groceryCat.total).toBe(60);
    expect(groceryCat.sharedTotal).toBe(60);

    expect(result.splitSummary.settlements).toEqual([
      {
        fromUserId: 2,
        fromUserName: "Bob",
        toUserId: 1,
        toUserName: "Alice",
        amount: 30,
      },
    ]);
  });

  it("excludes rejected items from monetary fields but counts them", () => {
    const result = computeReport(
      [
        item({ userId: 1, amount: 100, splitRatio: 0.5, status: "accepted" }),
        item({ userId: 1, amount: 500, splitRatio: 0.5, status: "rejected" }),
      ],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    expect(result.lineItemCount).toBe(2);
    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);

    const totalFromCats = result.categoryTotals.reduce((s, c) => s + c.total, 0);
    expect(totalFromCats).toBe(100);
  });

  it("excludes pending items from monetary fields but counts them", () => {
    const result = computeReport(
      [
        item({ userId: 1, amount: 100, splitRatio: 0.5, status: "accepted" }),
        item({ userId: 1, amount: 300, splitRatio: 0.5, status: "pending" }),
      ],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    expect(result.lineItemCount).toBe(2);
    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);

    const totalFromCats = result.categoryTotals.reduce((s, c) => s + c.total, 0);
    expect(totalFromCats).toBe(100);
  });

  it("evenly distributes shared amount across non-owner users (3-user)", () => {
    // $300 with splitRatio=0.2 paid by Alice:
    //   Alice keeps 0.2 * 300 = $60
    //   Remaining $240 split evenly between Bob and Carol = $120 each
    const result = computeReport(
      [item({ userId: 1, amount: 300, splitRatio: 0.2, categoryId: 10 })],
      [alice, bob, carol],
      [groceries],
      4,
      2026
    );

    const settlements = [...result.splitSummary.settlements].sort(
      (a, b) => a.fromUserId - b.fromUserId
    );
    expect(settlements).toEqual([
      {
        fromUserId: 2,
        fromUserName: "Bob",
        toUserId: 1,
        toUserName: "Alice",
        amount: 120,
      },
      {
        fromUserId: 3,
        fromUserName: "Carol",
        toUserId: 1,
        toUserName: "Alice",
        amount: 120,
      },
    ]);
  });

  it("nets pairwise settlements so only the difference remains", () => {
    // Alice paid $100 @ 50% (Bob owes Alice $50)
    // Bob paid $60 @ 50% (Alice owes Bob $30)
    // Net: Bob owes Alice $20
    const result = computeReport(
      [
        item({ userId: 1, amount: 100, splitRatio: 0.5 }),
        item({ userId: 2, amount: 60, splitRatio: 0.5 }),
      ],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    expect(result.splitSummary.settlements).toEqual([
      {
        fromUserId: 2,
        fromUserName: "Bob",
        toUserId: 1,
        toUserName: "Alice",
        amount: 20,
      },
    ]);
  });

  it("drops zero-net pairs (under 1 cent)", () => {
    // Equal reciprocal debts → no settlement
    const result = computeReport(
      [
        item({ userId: 1, amount: 40, splitRatio: 0.5 }),
        item({ userId: 2, amount: 40, splitRatio: 0.5 }),
      ],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    expect(result.splitSummary.settlements).toEqual([]);
  });

  it("buckets items with categoryId=null under Uncategorized", () => {
    const result = computeReport(
      [item({ userId: 1, amount: 50, splitRatio: 0.5, categoryId: null })],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    expect(result.categoryTotals).toHaveLength(1);
    expect(result.categoryTotals[0]).toMatchObject({
      categoryId: null,
      categoryName: "Uncategorized",
      total: 50,
    });
  });

  it("only includes items in the requested month/year", () => {
    const result = computeReport(
      [
        item({ userId: 1, amount: 100, date: "2026-04-01" }),
        item({ userId: 1, amount: 999, date: "2026-03-31" }),
        item({ userId: 1, amount: 888, date: "2026-05-01" }),
        item({ userId: 1, amount: 777, date: "2025-04-15" }),
      ],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    expect(result.lineItemCount).toBe(1);
    expect(result.acceptedCount).toBe(1);
    const total = result.categoryTotals.reduce((s, c) => s + c.total, 0);
    expect(total).toBe(100);
  });

  it("keeps category math consistent: personal + shared === total", () => {
    const result = computeReport(
      [
        item({ userId: 1, amount: 100, splitRatio: 0.5, categoryId: 10 }),
        item({ userId: 1, amount: 40, splitRatio: 1.0, categoryId: 10 }),
        item({ userId: 2, amount: 70, splitRatio: 0.5, categoryId: 10 }),
      ],
      [alice, bob],
      [groceries],
      4,
      2026
    );

    for (const cat of result.categoryTotals) {
      const sum =
        Math.round(((cat.personalTotal ?? 0) + (cat.sharedTotal ?? 0)) * 100) /
        100;
      expect(sum).toBeCloseTo(cat.total, 2);
    }
  });

  it("returns zeroed snapshot for empty input", () => {
    const result = computeReport([], [alice, bob], [], 4, 2026);

    expect(result.categoryTotals).toEqual([]);
    expect(result.splitSummary.settlements).toEqual([]);
    expect(result.lineItemCount).toBe(0);
    expect(result.acceptedCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.userBreakdowns).toHaveLength(2);
    for (const u of result.userBreakdowns) {
      expect(u.totalSpent).toBe(0);
      expect(u.personalSpending).toBe(0);
      expect(u.sharedSpending).toBe(0);
      expect(u.effectiveTotal).toBe(0);
      expect(u.byCategory).toEqual([]);
    }
  });
});

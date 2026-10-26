import { describe, it, expect } from "vitest";
import type { ReportSnapshot } from "@finance-tracker/shared";
import { buildReportTrend, MAX_CATEGORIES } from "./reportTrend";

type Cat = ReportSnapshot["categoryTotals"][number];

const cat = (categoryId: number | null, categoryName: string, total: number): Cat => ({
  categoryId,
  categoryName,
  total,
});

const snapshot = (
  year: number,
  month: number,
  household: Cat[],
  users: Array<{ userId: number; userName: string; byCategory: Cat[] }> = []
): ReportSnapshot => ({
  periodMonth: month,
  periodYear: year,
  generatedAt: "2026-01-01T00:00:00Z",
  categoryTotals: household,
  userBreakdowns: users.map((u) => ({
    ...u,
    totalSpent: u.byCategory.reduce((s, c) => s + c.total, 0),
  })),
  splitSummary: { settlements: [] },
  lineItemCount: 0,
  acceptedCount: 0,
  rejectedCount: 0,
});

const series = (trend: ReturnType<typeof buildReportTrend>, view: string, key: string) =>
  trend.views.find((v) => v.key === view)?.series.find((s) => s.key === key);

describe("buildReportTrend", () => {
  it("returns nothing without snapshots", () => {
    expect(buildReportTrend([])).toEqual({ months: [], views: [] });
  });

  it("spans a year boundary and leaves missing months as gaps", () => {
    const trend = buildReportTrend([
      snapshot(2025, 11, [cat(1, "Dine", 10)]),
      snapshot(2026, 2, [cat(1, "Dine", 30)]),
    ]);
    expect(trend.months).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(series(trend, "household", "total")?.values).toEqual([10, null, null, 30]);
  });

  it("ranks categories by household total over the range and folds the rest into Other", () => {
    const many = Array.from({ length: MAX_CATEGORIES + 2 }, (_, i) =>
      cat(i + 1, `C${i + 1}`, 100 - i)
    );
    const trend = buildReportTrend([snapshot(2026, 1, many)]);
    const household = trend.views[0].series;
    expect(household.map((s) => s.key)).toEqual([
      "total",
      ...many.slice(0, MAX_CATEGORIES).map((c) => `cat:${c.categoryId}`),
      "other",
    ]);
    expect(household[1]).toMatchObject({ name: "C1", slot: 1 });
    expect(series(trend, "household", "other")?.values).toEqual([93 + 92]);
  });

  it("keeps a category's slot in each person's view and zero-fills their months", () => {
    const trend = buildReportTrend([
      snapshot(2026, 1, [cat(1, "Rent", 2000), cat(2, "Dine", 50)], [
        { userId: 1, userName: "Mitchell", byCategory: [cat(2, "Dine", 50)] },
        { userId: 2, userName: "Jadyn", byCategory: [cat(1, "Rent", 2000)] },
      ]),
    ]);
    expect(trend.views.map((v) => v.label)).toEqual(["Household", "Mitchell", "Jadyn"]);
    expect(series(trend, "user:1", "cat:2")).toMatchObject({ slot: 2, values: [50] });
    expect(series(trend, "user:1", "cat:1")?.values).toEqual([0]);
    expect(series(trend, "user:2", "total")?.values).toEqual([2000]);
  });

  it("nets credits so a refund month can dip", () => {
    const trend = buildReportTrend([
      snapshot(2026, 1, [cat(1, "Dine", 40), cat(null, "Uncategorized", -15)]),
    ]);
    expect(series(trend, "household", "total")?.values).toEqual([25]);
    expect(series(trend, "household", "cat:null")?.values).toEqual([-15]);
  });
});

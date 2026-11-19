import { describe, it, expect } from "vitest";
import { computeRunRate } from "./runRate";
import type { ReportTrend } from "./reportTrend";

const trend = (months: string[], household: Array<number | null>, mitchell?: Array<number | null>): ReportTrend => ({
  months,
  views: [
    { key: "household", label: "Household", series: [{ key: "total", name: "Total", slot: null, values: household }] },
    ...(mitchell
      ? [{ key: "user:1", label: "Mitchell", series: [{ key: "total", name: "Total", slot: null, values: mitchell }] }]
      : []),
  ],
});

describe("computeRunRate", () => {
  it("averages the three months ending at the selected month", () => {
    const rr = computeRunRate(
      trend(["2026-06", "2026-07", "2026-08", "2026-09"], [100, 12000, 14000, 15142], [50, 6000, 7000, 8000]),
      "2026-09"
    );
    expect(rr.window).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(rr.monthsUsed).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(rr.figures[0]).toMatchObject({ key: "household", average: 13714, current: 15142 });
    expect(rr.figures[0].vsAverage).toBeCloseTo(1428 / 13714);
    expect(rr.figures[1]).toMatchObject({ key: "user:1", average: 7000, current: 8000 });
  });

  it("leaves out months without a snapshot instead of counting zero", () => {
    const rr = computeRunRate(trend(["2026-07", "2026-08", "2026-09"], [9000, null, 11000]), "2026-09");
    expect(rr.monthsUsed).toEqual(["2026-07", "2026-09"]);
    expect(rr.figures[0].average).toBe(10000);
  });

  it("has no comparison when the selected month has no snapshot", () => {
    const rr = computeRunRate(trend(["2026-07", "2026-08"], [9000, 11000]), "2026-09");
    expect(rr.monthsUsed).toEqual(["2026-07", "2026-08"]);
    expect(rr.figures[0]).toMatchObject({ average: 10000, current: null, vsAverage: null });
  });

  it("is empty before any report exists", () => {
    const rr = computeRunRate({ months: [], views: [] }, "2026-09");
    expect(rr).toEqual({ window: ["2026-07", "2026-08", "2026-09"], monthsUsed: [], figures: [] });
  });

  it("crosses a year boundary", () => {
    expect(computeRunRate({ months: [], views: [] }, "2026-01").window).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

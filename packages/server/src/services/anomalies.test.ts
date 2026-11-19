import { describe, it, expect } from "vitest";
import type { ReportSnapshot } from "@finance-tracker/shared";
import { detectAnomalies, merchantKey, median, type AnomalyItem } from "./anomalies";

// Synthetic fixtures shaped on the live cases the PRD names: Sep 2026
// (Shambhala + ICBC renewal) and Apr 2026 (a CRA payment).
const RECREATION = 15;
const CAR = 13;
const RENT = 9;
const GROCERIES = 2;
const TAXES = 30;
const NAMES: Record<number, string> = {
  [RECREATION]: "Recreation",
  [CAR]: "Car",
  [RENT]: "Rent",
  [GROCERIES]: "Groceries",
  [TAXES]: "Taxes",
};
const categoryName = (id: number | null) => (id === null ? "Uncategorized" : NAMES[id] ?? "?");

const snapshot = (year: number, month: number, totals: Record<number, number>): ReportSnapshot => ({
  periodMonth: month,
  periodYear: year,
  generatedAt: "2026-10-01T00:00:00Z",
  categoryTotals: Object.entries(totals).map(([id, total]) => ({
    categoryId: Number(id),
    categoryName: categoryName(Number(id)),
    total,
  })),
  userBreakdowns: [],
  splitSummary: { settlements: [] },
  lineItemCount: 0,
  acceptedCount: 0,
  rejectedCount: 0,
});

let nextId = 1;
const item = (date: string, description: string, amount: number, categoryId: number | null, extra: Partial<AnomalyItem> = {}): AnomalyItem => ({
  id: nextId++,
  date,
  description,
  amount,
  isCredit: false,
  status: "accepted",
  categoryId,
  ...extra,
});

// Mar–Aug 2026 baseline: Recreation typical ≈ $446, Car ≈ $58, Rent $2,175.
const baseline: Array<[number, Record<number, number>]> = [
  [3, { [RECREATION]: 775, [CAR]: 30, [RENT]: 2175, [GROCERIES]: 569 }],
  [4, { [RECREATION]: 215, [CAR]: 44, [RENT]: 2175, [GROCERIES]: 700 }],
  [5, { [RECREATION]: 801, [CAR]: 72, [RENT]: 2175, [GROCERIES]: 1359 }],
  [6, { [RECREATION]: 246, [CAR]: 552, [RENT]: 2175, [GROCERIES]: 899 }],
  [7, { [RECREATION]: 540, [CAR]: 58, [RENT]: 2175, [GROCERIES]: 1005 }],
  [8, { [RECREATION]: 351, [CAR]: 59, [RENT]: 2175, [GROCERIES]: 1350 }],
];
const snapshots = [
  ...baseline.map(([m, totals]) => snapshot(2026, m, totals)),
  snapshot(2026, 9, { [RECREATION]: 3291, [CAR]: 1313, [RENT]: 2175, [GROCERIES]: 950 }),
];
const rentHistory = baseline.map(([m]) => item(`2026-0${m}-01`, "RENT", 2175, RENT));
const costcoHistory = baseline.map(([m]) => item(`2026-0${m}-12`, "COSTCO WHOLESAL #123", 420, GROCERIES));

const shambhala = item("2026-09-05", "SHAMBHALA MUSIC FESTIVAL", 2101.08, RECREATION);
const tent = item("2026-09-05", "SHAMS TENT SITE", 900, RECREATION);
const icbc = item("2026-09-14", "ICBC #20514 VANCOUVER    VANCOUVER", 1261, CAR);
const septemberItems = [
  ...rentHistory,
  ...costcoHistory,
  shambhala,
  tent,
  icbc,
  item("2026-09-01", "RENT", 2175, RENT),
  item("2026-09-12", "COSTCO WHOLESAL #456", 540, GROCERIES),
  item("2026-09-20", "SOME REFUND", 900, null, { isCredit: true }),
  item("2026-09-21", "BIG BUT REJECTED", 5000, null, { status: "rejected" }),
];

describe("detectAnomalies — Sep 2026", () => {
  const anomalies = detectAnomalies({
    month: 9,
    year: 2026,
    snapshots,
    items: septemberItems,
    categoryName,
  });

  it("flags Recreation and Car as spikes, with Shambhala and ICBC behind them", () => {
    expect(anomalies.map((a) => [a.kind, a.label])).toEqual([
      ["category_spike", "Recreation"],
      ["category_spike", "Car"],
    ]);
    const [recreation, car] = anomalies;
    expect(recreation).toMatchObject({ subjectKey: `cat:${RECREATION}`, amount: 3291, typical: 445.5, baselineMonths: 6 });
    expect(recreation.drivers.map((d) => d.description)).toEqual(["SHAMBHALA MUSIC FESTIVAL", "SHAMS TENT SITE"]);
    expect(car.drivers).toEqual([
      { lineItemId: icbc.id, date: "2026-09-14", description: "ICBC #20514 VANCOUVER VANCOUVER", amount: 1261 },
    ]);
  });

  it("never flags recurring charges, credits or rejected items", () => {
    const labels = JSON.stringify(anomalies);
    expect(labels).not.toContain("RENT");
    expect(labels).not.toContain("COSTCO");
    expect(labels).not.toContain("REFUND");
    expect(labels).not.toContain("REJECTED");
  });

  it("lists a large item on its own when its category did not spike", () => {
    const quiet = snapshots.map((s) =>
      s.periodMonth === 9 ? snapshot(2026, 9, { [RECREATION]: 2400, [CAR]: 58, [RENT]: 2175 }) : s
    );
    const result = detectAnomalies({ month: 9, year: 2026, snapshots: quiet, items: septemberItems, categoryName });
    // Recreation still spikes ($2,400 vs $446); Car no longer does, so ICBC stands alone.
    expect(result.map((a) => [a.kind, a.subjectKey])).toEqual([
      ["category_spike", `cat:${RECREATION}`],
      ["large_item", `item:${icbc.id}`],
    ]);
    expect(result[1]).toMatchObject({ label: "ICBC #20514 VANCOUVER VANCOUVER", categoryName: "Car", typical: 58.5 });
  });
});

describe("detectAnomalies — Apr 2026 CRA payment", () => {
  const priorMonthsSnapshots = [11, 12].map((m) => snapshot(2025, m, { [RENT]: 2175, [GROCERIES]: 600 }))
    .concat([1, 2, 3].map((m) => snapshot(2026, m, { [RENT]: 2175, [GROCERIES]: 600 })));
  const cra = item("2026-04-30", "PAY TO: CRA       _V", 3979.17, TAXES);

  it("flags a large charge in a category with no history", () => {
    const result = detectAnomalies({
      month: 4,
      year: 2026,
      snapshots: [...priorMonthsSnapshots, snapshot(2026, 4, { [RENT]: 2175, [GROCERIES]: 640, [TAXES]: 3979.17 })],
      items: [cra],
      categoryName,
    });
    // Taxes has no track record, so it cannot "spike" — the item carries it.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "large_item", subjectKey: `item:${cra.id}`, categoryName: "Taxes", typical: null });
  });

  it("still flags large items before there is enough history for spikes", () => {
    const result = detectAnomalies({
      month: 4,
      year: 2026,
      snapshots: [snapshot(2026, 3, { [RENT]: 2175 }), snapshot(2026, 4, { [TAXES]: 3979.17 })],
      items: [cra],
      categoryName,
    });
    expect(result.map((a) => a.kind)).toEqual(["large_item"]);
  });
});

describe("baselines", () => {
  it("leave out months without a report rather than counting them as zero", () => {
    // Only Jun–Aug have reports; Recreation at $500 typical, $900 is not 2×.
    const sparse = [
      snapshot(2026, 6, { [RECREATION]: 500 }),
      snapshot(2026, 7, { [RECREATION]: 480 }),
      snapshot(2026, 8, { [RECREATION]: 520 }),
      snapshot(2026, 9, { [RECREATION]: 900 }),
    ];
    expect(detectAnomalies({ month: 9, year: 2026, snapshots: sparse, items: [], categoryName })).toEqual([]);
  });

  it("need the category to have spend in enough prior months to spike", () => {
    const thin = [
      snapshot(2026, 6, { [RECREATION]: 100, [RENT]: 1 }),
      snapshot(2026, 7, { [RENT]: 1 }),
      snapshot(2026, 8, { [RENT]: 1 }),
      snapshot(2026, 9, { [RECREATION]: 2000 }),
    ];
    expect(detectAnomalies({ month: 9, year: 2026, snapshots: thin, items: [], categoryName })).toEqual([]);
  });
});

describe("helpers", () => {
  it("merchantKey drops reference tokens", () => {
    expect(merchantKey("SEND E-TFR ***pRp")).toBe("send e-tfr");
    expect(merchantKey("SEND E-TFR   ***84e")).toBe("send e-tfr");
    expect(merchantKey("AIRBNB * HM3KP5HWRH LONDON")).toBe("airbnb london");
  });

  it("median handles even and odd lengths", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

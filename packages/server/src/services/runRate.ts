import type { ReportTrend } from "./reportTrend";
import { trailingMonths } from "../lib/months";

/**
 * What the household is operating at: the average monthly spend over the
 * `RUN_RATE_MONTHS` months ending at (and including) the selected month, for
 * the household and each person, and how the selected month compares.
 *
 * Built from the trend (report snapshots), so it agrees with the chart.
 * Months in the window without a snapshot are left out, never counted as
 * zero, and `monthsUsed` says which months made the average. Derived at view
 * time — never stored in a snapshot.
 */

export const RUN_RATE_MONTHS = 3;

export interface RunRateFigure {
  /** `household` or `user:<id>` — the trend view it comes from. */
  key: string;
  label: string;
  /** Null when no month in the window has a snapshot. */
  average: number | null;
  /** The selected month's total; null when it has no snapshot. */
  current: number | null;
  /** (current − average) / average; null when either is missing or average is 0. */
  vsAverage: number | null;
}

export interface RunRate {
  /** The window, oldest first. */
  window: string[];
  /** Window months that have a snapshot. */
  monthsUsed: string[];
  figures: RunRateFigure[];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computeRunRate(trend: ReportTrend, selectedKey: string): RunRate {
  const window = trailingMonths(selectedKey, RUN_RATE_MONTHS);
  const indexOf = new Map(trend.months.map((m, i) => [m, i]));
  const household = trend.views.find((v) => v.key === "household");
  const totalOf = (values: Array<number | null> | undefined, month: string) => {
    const i = indexOf.get(month);
    return i === undefined || !values ? null : values[i];
  };

  const householdTotals = household?.series.find((s) => s.key === "total")?.values;
  const monthsUsed = window.filter((m) => totalOf(householdTotals, m) !== null);

  const figures = trend.views.map((view): RunRateFigure => {
    const totals = view.series.find((s) => s.key === "total")?.values;
    const values = monthsUsed
      .map((m) => totalOf(totals, m))
      .filter((v): v is number => v !== null);
    const average = values.length > 0 ? round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    const current = totalOf(totals, selectedKey);
    const vsAverage =
      average !== null && current !== null && average !== 0 ? (current - average) / average : null;
    return { key: view.key, label: view.label, average, current, vsAverage };
  });

  return { window, monthsUsed, figures };
}

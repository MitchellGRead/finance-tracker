import type { ReportSnapshot } from "@finance-tracker/shared";

/**
 * Month-over-month series for the Reports trend chart, built from generated
 * snapshots (not live line items), so the chart agrees with the reports below
 * it. Months between the first and last snapshot with no snapshot are `null`
 * gaps, never zero.
 *
 * Categories are ranked once, on household totals across the whole range, and
 * the top `MAX_CATEGORIES` keep that rank in every view so a category keeps its
 * colour when switching between household and a person. The rest fold into
 * "Other".
 */

export const MAX_CATEGORIES = 7;

export interface TrendSeries {
  /** `total`, `other`, or `cat:<id|null>` */
  key: string;
  name: string;
  /** Colour slot 1..MAX_CATEGORIES for ranked categories; null for total/other. */
  slot: number | null;
  values: Array<number | null>;
}

export interface TrendView {
  /** `household` or `user:<id>` */
  key: string;
  label: string;
  series: TrendSeries[];
}

export interface ReportTrend {
  /** `YYYY-MM`, contiguous */
  months: string[];
  views: TrendView[];
}

type CategoryRow = ReportSnapshot["categoryTotals"][number];

const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

const catKey = (id: number | null) => `cat:${id === null ? "null" : id}`;

const round = (n: number) => Math.round(n * 100) / 100;

function monthRange(first: string, last: string): string[] {
  const months: string[] = [];
  let [year, month] = first.split("-").map(Number);
  for (;;) {
    const key = monthKey(year, month);
    months.push(key);
    if (key === last) return months;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

export function buildReportTrend(snapshots: ReportSnapshot[]): ReportTrend {
  if (snapshots.length === 0) return { months: [], views: [] };

  const byMonth = new Map(
    snapshots.map((s) => [monthKey(s.periodYear, s.periodMonth), s])
  );
  const sortedKeys = [...byMonth.keys()].sort();
  const months = monthRange(sortedKeys[0], sortedKeys[sortedKeys.length - 1]);

  // Rank categories on household totals over the whole range.
  const rankTotals = new Map<string, { name: string; total: number }>();
  for (const s of snapshots) {
    for (const c of s.categoryTotals) {
      const key = catKey(c.categoryId);
      const entry = rankTotals.get(key) ?? { name: c.categoryName, total: 0 };
      entry.total += c.total;
      rankTotals.set(key, entry);
    }
  }
  const ranked = [...rankTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, MAX_CATEGORIES);
  const slotOf = new Map(ranked.map(([key], i) => [key, i + 1]));
  const hasOther = rankTotals.size > ranked.length;

  function buildView(
    key: string,
    label: string,
    rowsFor: (s: ReportSnapshot) => CategoryRow[] | null
  ): TrendView {
    const total: Array<number | null> = [];
    const other: Array<number | null> = [];
    const perCategory = new Map(ranked.map(([k]) => [k, [] as Array<number | null>]));

    for (const month of months) {
      const snapshot = byMonth.get(month);
      const rows = snapshot ? rowsFor(snapshot) : null;
      if (rows === null) {
        total.push(null);
        other.push(null);
        for (const values of perCategory.values()) values.push(null);
        continue;
      }
      let monthTotal = 0;
      let monthOther = 0;
      const monthByCat = new Map<string, number>();
      for (const row of rows) {
        const k = catKey(row.categoryId);
        monthTotal += row.total;
        if (slotOf.has(k)) monthByCat.set(k, (monthByCat.get(k) ?? 0) + row.total);
        else monthOther += row.total;
      }
      total.push(round(monthTotal));
      other.push(round(monthOther));
      for (const [k, values] of perCategory) values.push(round(monthByCat.get(k) ?? 0));
    }

    const series: TrendSeries[] = [
      { key: "total", name: "Total", slot: null, values: total },
      ...ranked.map(([k, { name }]) => ({
        key: k,
        name,
        slot: slotOf.get(k)!,
        values: perCategory.get(k)!,
      })),
    ];
    if (hasOther) series.push({ key: "other", name: "Other", slot: null, values: other });
    return { key, label, series };
  }

  // Users in the order the most recent snapshot lists them.
  const latest = byMonth.get(sortedKeys[sortedKeys.length - 1])!;
  const users = new Map<number, string>();
  for (const s of [latest, ...snapshots]) {
    for (const u of s.userBreakdowns) if (!users.has(u.userId)) users.set(u.userId, u.userName);
  }

  return {
    months,
    views: [
      buildView("household", "Household", (s) => s.categoryTotals),
      ...[...users].map(([userId, name]) =>
        buildView(`user:${userId}`, name, (s) =>
          s.userBreakdowns.find((u) => u.userId === userId)?.byCategory ?? []
        )
      ),
    ],
  };
}

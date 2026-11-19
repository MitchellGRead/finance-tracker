import { normalizeForMatch, type ReportSnapshot } from "@finance-tracker/shared";
import { monthKey, priorMonths } from "../lib/months";

/**
 * Deterministic "unusual this month" heuristics (v1, no AI).
 *
 * - **Category spike** — the month's category total is over `spikeRatio` ×
 *   its typical month (the median of the prior `baselineMonths` months) **and**
 *   more than `spikeMinDelta` above it. Needs `minHistory` prior months with
 *   a report, in at least `minHistory` of which the category had spend — a
 *   category with no track record has no "typical" to spike above (a large
 *   charge in it is still caught below).
 * - **Large one-off item** — a single accepted charge over `largeItemMin`
 *   that is more than `largeItemRatio` × its category's typical month (or the
 *   category has no history), **and** is a one-off: the merchant was not paid
 *   at least `recurringShare` of this amount in any baseline month. Rent and
 *   loan payments are big but not unusual.
 *
 * A large item in a category that spiked is listed under that spike
 * (`drivers`) instead of separately: "Recreation $3,291 vs $446 typical —
 * incl. Shambhala $2,101" is one thing to look at, not two.
 *
 * Category figures come from report snapshots — the same data the trend
 * uses. Baselines come from the snapshots of prior months; a prior month
 * without a report is left out, a month with a report but no spend in the
 * category counts as zero. Items come from live accepted line items. All of
 * it is derived at view time; only the operator's dismissals are stored.
 *
 * Tuned against the live DB (Nov 2026): ≤ 3 per month from Feb 2026 on,
 * except months that really were unusual (Mar 2026 travel).
 */

export interface AnomalyThresholds {
  baselineMonths: number;
  minHistory: number;
  spikeRatio: number;
  spikeMinDelta: number;
  largeItemMin: number;
  largeItemRatio: number;
  recurringShare: number;
}

export const ANOMALY_THRESHOLDS: AnomalyThresholds = {
  baselineMonths: 6,
  minHistory: 3,
  spikeRatio: 2,
  spikeMinDelta: 400,
  largeItemMin: 250,
  largeItemRatio: 2,
  recurringShare: 0.5,
};

export type AnomalyKind = "category_spike" | "large_item";

export interface AnomalyDriver {
  lineItemId: number;
  date: string;
  description: string;
  amount: number;
}

export interface Anomaly {
  kind: AnomalyKind;
  /** `cat:<id|null>` for a spike, `item:<id>` for a large item — the dismissal key. */
  subjectKey: string;
  /** Category name for a spike; the item's description for a large item. */
  label: string;
  categoryId: number | null;
  categoryName: string;
  amount: number;
  /** The category's median month over the baseline; null with no history. */
  typical: number | null;
  /** Prior months with a report that made the baseline. */
  baselineMonths: number;
  /** Large one-off items behind a spike (empty for a large item). */
  drivers: AnomalyDriver[];
  /** The item, for a large item; null for a spike. */
  lineItemId: number | null;
  date: string | null;
}

export interface AnomalyItem {
  id: number;
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
  status: string;
  categoryId: number | null;
}

const catKey = (id: number | null) => `cat:${id === null ? "null" : id}`;
const round = (n: number) => Math.round(n * 100) / 100;
const cleanDescription = (d: string) => d.replace(/\s+/g, " ").trim();

/**
 * The merchant part of a description: normalized, with reference tokens
 * (anything containing a digit or `*`) dropped, so `SEND E-TFR ***pRp` and
 * `SEND E-TFR ***84e` are the same payee.
 */
export function merchantKey(description: string): string {
  return normalizeForMatch(description)
    .split(" ")
    .filter((token) => !/[\d*#]/.test(token))
    .join(" ");
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectAnomalies(input: {
  month: number;
  year: number;
  snapshots: ReportSnapshot[];
  /** Line items for the month and the baseline months (more is fine). */
  items: AnomalyItem[];
  categoryName: (id: number | null) => string;
  thresholds?: AnomalyThresholds;
}): Anomaly[] {
  const t = input.thresholds ?? ANOMALY_THRESHOLDS;
  const selectedKey = monthKey(input.year, input.month);
  const byMonth = new Map(input.snapshots.map((s) => [monthKey(s.periodYear, s.periodMonth), s]));
  const baselineKeys = priorMonths(selectedKey, t.baselineMonths).filter((m) => byMonth.has(m));
  const baseline = baselineKeys.map((m) => byMonth.get(m)!);

  /** Per category, its total in each baseline month (zero when absent). */
  const history = (categoryId: number | null): number[] =>
    baseline.map(
      (s) => s.categoryTotals.find((c) => catKey(c.categoryId) === catKey(categoryId))?.total ?? 0
    );

  const inMonth = (item: AnomalyItem, key: string) => item.date.startsWith(`${key}-`);
  const accepted = input.items.filter((i) => i.status === "accepted" && !i.isCredit);

  // Largest amount paid to each merchant in the baseline.
  const paidBefore = new Map<string, number>();
  for (const item of accepted) {
    if (!baselineKeys.some((k) => inMonth(item, k))) continue;
    const key = merchantKey(item.description);
    paidBefore.set(key, Math.max(paidBefore.get(key) ?? 0, item.amount));
  }

  const largeItems: Array<AnomalyItem & { typical: number | null }> = [];
  for (const item of accepted) {
    if (!inMonth(item, selectedKey) || item.amount <= t.largeItemMin) continue;
    const h = history(item.categoryId);
    const typical = h.some((v) => v > 0) ? median(h) : null;
    if (typical !== null && item.amount <= t.largeItemRatio * typical) continue;
    if ((paidBefore.get(merchantKey(item.description)) ?? 0) >= t.recurringShare * item.amount) continue;
    largeItems.push({ ...item, typical });
  }

  const anomalies: Anomaly[] = [];
  const spikedCategories = new Set<string>();

  const current = byMonth.get(selectedKey);
  if (current && baseline.length >= t.minHistory) {
    for (const cat of current.categoryTotals) {
      const h = history(cat.categoryId);
      if (h.filter((v) => v > 0).length < t.minHistory) continue;
      const typical = median(h);
      if (cat.total <= t.spikeRatio * typical || cat.total - typical <= t.spikeMinDelta) continue;
      spikedCategories.add(catKey(cat.categoryId));
      anomalies.push({
        kind: "category_spike",
        subjectKey: catKey(cat.categoryId),
        label: cat.categoryName,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        amount: round(cat.total),
        typical: round(typical),
        baselineMonths: baseline.length,
        drivers: largeItems
          .filter((i) => catKey(i.categoryId) === catKey(cat.categoryId))
          .sort((a, b) => b.amount - a.amount)
          .map((i) => ({
            lineItemId: i.id,
            date: i.date,
            description: cleanDescription(i.description),
            amount: round(i.amount),
          })),
        lineItemId: null,
        date: null,
      });
    }
  }

  for (const item of largeItems) {
    if (spikedCategories.has(catKey(item.categoryId))) continue;
    anomalies.push({
      kind: "large_item",
      subjectKey: `item:${item.id}`,
      label: cleanDescription(item.description),
      categoryId: item.categoryId,
      categoryName: input.categoryName(item.categoryId),
      amount: round(item.amount),
      typical: item.typical === null ? null : round(item.typical),
      baselineMonths: baseline.length,
      drivers: [],
      lineItemId: item.id,
      date: item.date,
    });
  }

  return anomalies.sort((a, b) => b.amount - a.amount);
}

export interface AnomalyDismissal {
  periodYear: number;
  periodMonth: number;
  kind: string;
  subjectKey: string;
  note: string | null;
  createdAt: string;
}

/**
 * Attach the operator's dismissals. Matching is by month + kind + subject
 * only, so a dismissal survives regenerating the report or a moved baseline.
 */
export function applyDismissals(
  anomalies: Anomaly[],
  dismissals: AnomalyDismissal[],
  month: number,
  year: number
): Array<Anomaly & { dismissal: { note: string | null; dismissedAt: string } | null }> {
  const byKey = new Map(
    dismissals
      .filter((d) => d.periodYear === year && d.periodMonth === month)
      .map((d) => [`${d.kind}|${d.subjectKey}`, d])
  );
  return anomalies.map((a) => {
    const d = byKey.get(`${a.kind}|${a.subjectKey}`);
    return { ...a, dismissal: d ? { note: d.note, dismissedAt: d.createdAt } : null };
  });
}

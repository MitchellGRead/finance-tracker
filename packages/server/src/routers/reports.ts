import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { reportSnapshots, lineItems, categories, users, anomalyDismissals } from "../db/schema";
import { loadSnapshots, saveSnapshot } from "../services/reportGenerator";
import { buildReportTrend } from "../services/reportTrend";
import { computeRunRate } from "../services/runRate";
import { applyDismissals, detectAnomalies } from "../services/anomalies";
import { computeMonthStatuses } from "../services/monthStatus";
import { monthKey } from "../lib/months";

const periodInput = z.object({
  month: z.number().min(1).max(12),
  year: z.number(),
});

const anomalySubject = periodInput.extend({
  kind: z.enum(["category_spike", "large_item"]),
  subjectKey: z.string().regex(/^(cat:(\d+|null)|item:\d+)$/),
});

function loadMonthStatuses() {
  return computeMonthStatuses({
    items: db.select().from(lineItems).all(),
    users: db.select().from(users).all(),
    categories: db.select().from(categories).all(),
    snapshots: loadSnapshots(),
    settlements: [],
  });
}

export const reportsRouter = router({
  generate: publicProcedure.input(periodInput).mutation(async ({ input }) => {
    return saveSnapshot(input.month, input.year);
  }),

  /** Regenerate every month whose snapshot no longer matches live data. */
  regenerateOutdated: publicProcedure.mutation(async () => {
    const outdated = loadMonthStatuses().months.filter((m) => m.flags.outdated);
    for (const m of outdated) saveSnapshot(m.month, m.year);
    return { regenerated: outdated.map((m) => m.key) };
  }),

  get: publicProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12),
        year: z.number(),
      })
    )
    .query(async ({ input }) => {
      const snapshot = db
        .select()
        .from(reportSnapshots)
        .where(
          and(
            eq(reportSnapshots.periodMonth, input.month),
            eq(reportSnapshots.periodYear, input.year)
          )
        )
        .get();

      if (!snapshot) return null;
      return {
        ...snapshot,
        parsed: JSON.parse(snapshot.data),
      };
    }),

  list: publicProcedure.query(async () => {
    return db
      .select({
        id: reportSnapshots.id,
        periodMonth: reportSnapshots.periodMonth,
        periodYear: reportSnapshots.periodYear,
        generatedAt: reportSnapshots.generatedAt,
      })
      .from(reportSnapshots)
      .orderBy(desc(reportSnapshots.periodYear), desc(reportSnapshots.periodMonth));
  }),

  /** Month-over-month series for the trend chart, from every snapshot. */
  trend: publicProcedure.query(async () => {
    return buildReportTrend(loadSnapshots());
  }),

  /** Trailing average monthly spend ending at the month, from snapshots. */
  runRate: publicProcedure.input(periodInput).query(async ({ input }) => {
    return computeRunRate(buildReportTrend(loadSnapshots()), monthKey(input.year, input.month));
  }),

  /**
   * Every month's lifecycle stage and flags (outdated report, adjustment
   * pending, unreviewed), plus the outstanding balance. One call for all
   * months; a full live recompute is cheap at household scale.
   */
  status: publicProcedure.query(async () => loadMonthStatuses()),

  /**
   * "Unusual this month": category spikes and large one-off items, each with
   * the operator's dismissal (if any) attached.
   */
  anomalies: publicProcedure.input(periodInput).query(async ({ input }) => {
    const allCategories = db.select({ id: categories.id, name: categories.name }).from(categories).all();
    const anomalies = detectAnomalies({
      month: input.month,
      year: input.year,
      snapshots: loadSnapshots(),
      items: db
        .select({
          id: lineItems.id,
          date: lineItems.date,
          description: lineItems.description,
          amount: lineItems.amount,
          isCredit: lineItems.isCredit,
          status: lineItems.status,
          categoryId: lineItems.categoryId,
        })
        .from(lineItems)
        .all(),
      categoryName: (id) =>
        id === null ? "Uncategorized" : allCategories.find((c) => c.id === id)?.name ?? "Unknown",
    });
    const dismissals = db
      .select()
      .from(anomalyDismissals)
      .where(
        and(eq(anomalyDismissals.periodYear, input.year), eq(anomalyDismissals.periodMonth, input.month))
      )
      .all();
    return applyDismissals(anomalies, dismissals, input.month, input.year);
  }),

  /** Mark an anomaly as expected, with an optional note. Idempotent. */
  dismissAnomaly: publicProcedure
    .input(anomalySubject.extend({ note: z.string().trim().max(500).nullable().optional() }))
    .mutation(async ({ input }) => {
      const note = input.note ? input.note : null;
      return db
        .insert(anomalyDismissals)
        .values({
          periodYear: input.year,
          periodMonth: input.month,
          kind: input.kind,
          subjectKey: input.subjectKey,
          note,
        })
        .onConflictDoUpdate({
          target: [
            anomalyDismissals.periodYear,
            anomalyDismissals.periodMonth,
            anomalyDismissals.kind,
            anomalyDismissals.subjectKey,
          ],
          set: { note },
        })
        .returning()
        .get();
    }),

  undismissAnomaly: publicProcedure.input(anomalySubject).mutation(async ({ input }) => {
    return db
      .delete(anomalyDismissals)
      .where(
        and(
          eq(anomalyDismissals.periodYear, input.year),
          eq(anomalyDismissals.periodMonth, input.month),
          eq(anomalyDismissals.kind, input.kind),
          eq(anomalyDismissals.subjectKey, input.subjectKey)
        )
      )
      .run();
  }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db
        .delete(reportSnapshots)
        .where(eq(reportSnapshots.id, input.id))
        .run();
    }),
});

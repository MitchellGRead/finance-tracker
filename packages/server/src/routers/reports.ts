import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { reportSnapshots } from "../db/schema";
import { generateReportData } from "../services/reportGenerator";

export const reportsRouter = router({
  generate: publicProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12),
        year: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const data = generateReportData(input.month, input.year);

      // Delete existing snapshot for this period (upsert)
      db.delete(reportSnapshots)
        .where(
          and(
            eq(reportSnapshots.periodMonth, input.month),
            eq(reportSnapshots.periodYear, input.year)
          )
        )
        .run();

      // Insert new snapshot
      const snapshot = db
        .insert(reportSnapshots)
        .values({
          periodMonth: input.month,
          periodYear: input.year,
          generatedAt: data.generatedAt,
          data: JSON.stringify(data),
        })
        .returning()
        .get();

      return { ...snapshot, parsed: data };
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

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db
        .delete(reportSnapshots)
        .where(eq(reportSnapshots.id, input.id))
        .run();
    }),
});

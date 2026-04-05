import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { statements, lineItems } from "../db/schema";
import { parseCsv } from "../parsers";
import { GLOBAL_DEFAULT_SPLIT_RATIO } from "@finance-tracker/shared";

export const statementsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12).optional(),
        year: z.number().optional(),
        userId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      let query = db.select().from(statements);
      const conditions = [];

      if (input.month !== undefined) {
        conditions.push(eq(statements.periodMonth, input.month));
      }
      if (input.year !== undefined) {
        conditions.push(eq(statements.periodYear, input.year));
      }
      if (input.userId !== undefined) {
        conditions.push(eq(statements.userId, input.userId));
      }

      if (conditions.length > 0) {
        return query.where(and(...conditions));
      }
      return query;
    }),

  upload: publicProcedure
    .input(
      z.object({
        userId: z.number(),
        sourceType: z.enum(["amex", "td"]),
        fileName: z.string(),
        content: z.string(),
        periodMonth: z.number().min(1).max(12),
        periodYear: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const parsed = parseCsv(input.content, input.sourceType);

      const statement = db
        .insert(statements)
        .values({
          userId: input.userId,
          sourceType: input.sourceType,
          fileName: input.fileName,
          periodMonth: input.periodMonth,
          periodYear: input.periodYear,
        })
        .returning()
        .get();

      if (parsed.length > 0) {
        db.insert(lineItems)
          .values(
            parsed.map((item) => ({
              statementId: statement.id,
              userId: input.userId,
              date: item.date,
              description: item.description,
              amount: item.amount,
              splitRatio: GLOBAL_DEFAULT_SPLIT_RATIO,
              status: "pending" as const,
              isCredit: item.isCredit,
            }))
          )
          .run();
      }

      return {
        statement,
        lineItemCount: parsed.length,
      };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      db.delete(lineItems)
        .where(eq(lineItems.statementId, input.id))
        .run();
      return db.delete(statements).where(eq(statements.id, input.id)).run();
    }),
});

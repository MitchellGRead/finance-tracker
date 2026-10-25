import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { statements, lineItems } from "../db/schema";
import { TRPCError } from "@trpc/server";
import { SourceType } from "@finance-tracker/shared";
import { reapplyRulesForPeriod } from "../services/ruleEngine";
import {
  commitImportBatch,
  ImportRejectedError,
  planImportBatch,
  summarizePlan,
} from "../services/importStatements";

const importBatchInput = z.object({
  files: z
    .array(
      z.object({
        fileName: z.string(),
        content: z.string(),
        userId: z.number().nullable(),
        institution: z.enum([SourceType.AMEX, SourceType.TD]).nullable(),
      })
    )
    .min(1),
});

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

  /** Parse and dedupe a batch of files without writing anything. */
  previewImport: publicProcedure
    .input(importBatchInput)
    .mutation(({ input }) => planImportBatch(input.files).map(summarizePlan)),

  /** Import a batch atomically; rejects it whole if any file has an error. */
  commitImport: publicProcedure
    .input(importBatchInput)
    .mutation(({ input }) => {
      try {
        return commitImportBatch(input.files);
      } catch (error) {
        if (error instanceof ImportRejectedError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  reapplyRules: publicProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12),
        year: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      return reapplyRulesForPeriod(input.month, input.year);
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

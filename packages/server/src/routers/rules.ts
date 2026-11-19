import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { rules, categories, lineItems } from "../db/schema";
import { computeRuleCoverage } from "../services/ruleCoverage";

export const rulesRouter = router({
  list: publicProcedure.query(async () => {
    return db
      .select({
        id: rules.id,
        pattern: rules.pattern,
        ruleType: rules.ruleType,
        userId: rules.userId,
        action: rules.action,
        categoryId: rules.categoryId,
        categoryName: categories.name,
        createdByUserId: rules.createdByUserId,
        createdAt: rules.createdAt,
      })
      .from(rules)
      .leftJoin(categories, eq(rules.categoryId, categories.id))
      .orderBy(rules.pattern)
      .all();
  }),

  /**
   * Per rule: items it matches and wins, the rules that beat it or tie with
   * it, and how many items deleting it would change. Across every stored line
   * item, regardless of month or status. Rules are created from line items
   * (`lineItems.acceptAndCreateRules`), never directly.
   */
  coverage: publicProcedure.query(async () => {
    return computeRuleCoverage(
      db.select().from(rules).all(),
      db
        .select({ description: lineItems.description, userId: lineItems.userId })
        .from(lineItems)
        .all()
    );
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        pattern: z.string().min(1).optional(),
        ruleType: z.enum(["split", "personal"]).optional(),
        userId: z.number().nullable().optional(),
        action: z.enum(["accept", "reject"]).nullable().optional(),
        categoryId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;

      // Fetch current rule to merge with partial updates for validation
      const current = await db
        .select()
        .from(rules)
        .where(eq(rules.id, id))
        .get();
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      }

      const merged = { ...current, ...updates };
      if (merged.ruleType === "personal" && merged.userId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Personal rules require a userId",
        });
      }
      if (merged.ruleType === "split" && merged.userId != null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Split rules must not have a userId",
        });
      }
      if (merged.action == null && merged.categoryId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Rule must set at least an action or a category",
        });
      }

      return db
        .update(rules)
        .set(updates)
        .where(eq(rules.id, id))
        .returning()
        .get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db.delete(rules).where(eq(rules.id, input.id)).run();
    }),
});

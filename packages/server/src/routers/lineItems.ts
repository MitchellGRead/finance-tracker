import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import {
  lineItems,
  categories,
  statements,
  categoryRules,
  acceptRejectRules,
} from "../db/schema";
import { GLOBAL_DEFAULT_SPLIT_RATIO } from "@finance-tracker/shared";
import { applyRulesToLineItems } from "../services/ruleEngine";

export const lineItemsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12).optional(),
        year: z.number().optional(),
        userId: z.number().optional(),
        status: z.enum(["pending", "accepted", "rejected"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const allItems = await db
        .select({
          id: lineItems.id,
          statementId: lineItems.statementId,
          userId: lineItems.userId,
          date: lineItems.date,
          description: lineItems.description,
          amount: lineItems.amount,
          categoryId: lineItems.categoryId,
          categoryName: categories.name,
          splitRatio: lineItems.splitRatio,
          status: lineItems.status,
          statusOverride: lineItems.statusOverride,
          categoryOverride: lineItems.categoryOverride,
          splitRatioOverride: lineItems.splitRatioOverride,
          note: lineItems.note,
          isManual: lineItems.isManual,
          isCredit: lineItems.isCredit,
          createdAt: lineItems.createdAt,
          updatedAt: lineItems.updatedAt,
        })
        .from(lineItems)
        .leftJoin(categories, eq(lineItems.categoryId, categories.id))
        .orderBy(desc(lineItems.date));

      return allItems.filter((item) => {
        if (input.year !== undefined && input.month !== undefined) {
          const prefix = `${input.year}-${String(input.month).padStart(2, "0")}`;
          if (!item.date.startsWith(prefix)) return false;
        }
        if (input.userId !== undefined && item.userId !== input.userId)
          return false;
        if (input.status !== undefined && item.status !== input.status)
          return false;
        return true;
      });
    }),

  countByMonth: publicProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const allItems = db.select({ date: lineItems.date }).from(lineItems).all();
      const counts: Record<number, number> = {};
      const prefix = String(input.year);
      for (const item of allItems) {
        if (item.date.startsWith(prefix)) {
          const month = parseInt(item.date.substring(5, 7));
          counts[month] = (counts[month] ?? 0) + 1;
        }
      }
      return counts;
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "accepted", "rejected"]).optional(),
        statusOverride: z.boolean().optional(),
        categoryId: z.number().nullable().optional(),
        categoryOverride: z.boolean().optional(),
        splitRatio: z.number().min(0).max(1).optional(),
        splitRatioOverride: z.boolean().optional(),
        note: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      return db
        .update(lineItems)
        .set(updates)
        .where(eq(lineItems.id, id))
        .returning()
        .get();
    }),

  bulkUpdateStatus: publicProcedure
    .input(
      z.object({
        ids: z.array(z.number()),
        status: z.enum(["pending", "accepted", "rejected"]),
      })
    )
    .mutation(async ({ input }) => {
      for (const id of input.ids) {
        db.update(lineItems)
          .set({ status: input.status, statusOverride: true })
          .where(eq(lineItems.id, id))
          .run();
      }
      return { updated: input.ids.length };
    }),

  clearOverrides: publicProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12),
        year: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const prefix = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const allItems = db.select().from(lineItems).all();
      const overriddenItems = allItems.filter(
        (item) =>
          item.date.startsWith(prefix) &&
          (item.statusOverride || item.categoryOverride || item.splitRatioOverride)
      );

      // Reset all overrides to defaults
      for (const item of overriddenItems) {
        db.update(lineItems)
          .set({
            status: "pending",
            statusOverride: false,
            categoryId: null,
            categoryOverride: false,
            splitRatio: GLOBAL_DEFAULT_SPLIT_RATIO,
            splitRatioOverride: false,
          })
          .where(eq(lineItems.id, item.id))
          .run();
      }

      // Re-apply rules to these items
      const ids = overriddenItems.map((item) => item.id);
      let rulesApplied = 0;
      if (ids.length > 0) {
        const result = applyRulesToLineItems(ids);
        rulesApplied = result.applied;
      }

      return { cleared: overriddenItems.length, rulesApplied };
    }),

  clearMonth: publicProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12),
        year: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const prefix = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const allItems = db.select().from(lineItems).all();
      const idsToDelete = allItems
        .filter((item) => item.date.startsWith(prefix))
        .map((item) => item.id);

      for (const id of idsToDelete) {
        db.delete(lineItems).where(eq(lineItems.id, id)).run();
      }

      db.delete(statements)
        .where(
          sql`${statements.periodMonth} = ${input.month} AND ${statements.periodYear} = ${input.year}`
        )
        .run();

      return { deleted: idsToDelete.length };
    }),

  acceptAndCreateRules: publicProcedure
    .input(
      z.object({
        lineItemId: z.number(),
        pattern: z.string().min(1),
        userId: z.number(),
        categoryId: z.number().nullable(),
        status: z.enum(["accepted", "rejected"]),
      })
    )
    .mutation(async ({ input }) => {
      // Update the line item status
      db.update(lineItems)
        .set({ status: input.status, statusOverride: true })
        .where(eq(lineItems.id, input.lineItemId))
        .run();

      const action = input.status === "accepted" ? "accept" : "reject";

      // Create accept/reject rule for this user (if pattern not already covered)
      const existingAR = db
        .select()
        .from(acceptRejectRules)
        .all()
        .find(
          (r) =>
            r.userId === input.userId &&
            r.pattern.toLowerCase() === input.pattern.toLowerCase() &&
            r.action === action
        );

      if (!existingAR) {
        db.insert(acceptRejectRules)
          .values({
            userId: input.userId,
            pattern: input.pattern,
            action,
          })
          .run();
      }

      // Create category rule only if a category is set
      if (input.categoryId !== null) {
        const existingCat = db
          .select()
          .from(categoryRules)
          .all()
          .find(
            (r) => r.pattern.toLowerCase() === input.pattern.toLowerCase()
          );

        if (!existingCat) {
          db.insert(categoryRules)
            .values({
              pattern: input.pattern,
              categoryId: input.categoryId,
              createdByUserId: input.userId,
            })
            .run();
        }
      }

      return { success: true };
    }),

  create: publicProcedure
    .input(
      z.object({
        userId: z.number(),
        date: z.string(),
        description: z.string(),
        amount: z.number(),
        categoryId: z.number().nullable().optional(),
        splitRatio: z.number().min(0).max(1).default(GLOBAL_DEFAULT_SPLIT_RATIO),
        status: z
          .enum(["pending", "accepted", "rejected"])
          .default("accepted"),
        note: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return db
        .insert(lineItems)
        .values({
          ...input,
          isManual: true,
        })
        .returning()
        .get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db.delete(lineItems).where(eq(lineItems.id, input.id)).run();
    }),
});

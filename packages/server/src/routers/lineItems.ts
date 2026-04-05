import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { lineItems, categories } from "../db/schema";
import { GLOBAL_DEFAULT_SPLIT_RATIO } from "@finance-tracker/shared";

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

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "accepted", "rejected"]).optional(),
        statusOverride: z.boolean().optional(),
        categoryId: z.number().nullable().optional(),
        categoryOverride: z.boolean().optional(),
        splitRatio: z.number().min(0).max(1).optional(),
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

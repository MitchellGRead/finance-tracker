import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { categoryRules, categories } from "../db/schema";

export const categoryRulesRouter = router({
  list: publicProcedure.query(async () => {
    return db
      .select({
        id: categoryRules.id,
        pattern: categoryRules.pattern,
        categoryId: categoryRules.categoryId,
        categoryName: categories.name,
        createdByUserId: categoryRules.createdByUserId,
        createdAt: categoryRules.createdAt,
      })
      .from(categoryRules)
      .leftJoin(categories, eq(categoryRules.categoryId, categories.id))
      .orderBy(categoryRules.pattern);
  }),

  create: publicProcedure
    .input(
      z.object({
        pattern: z.string().min(1),
        categoryId: z.number(),
        createdByUserId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      return db
        .insert(categoryRules)
        .values(input)
        .returning()
        .get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db
        .delete(categoryRules)
        .where(eq(categoryRules.id, input.id))
        .run();
    }),
});

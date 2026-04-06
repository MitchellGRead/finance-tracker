import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
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
        ruleType: categoryRules.ruleType,
        userId: categoryRules.userId,
        createdAt: categoryRules.createdAt,
      })
      .from(categoryRules)
      .leftJoin(categories, eq(categoryRules.categoryId, categories.id))
      .orderBy(categoryRules.pattern)
      .all();
  }),

  create: publicProcedure
    .input(
      z.object({
        pattern: z.string().min(1),
        categoryId: z.number(),
        createdByUserId: z.number(),
        ruleType: z.enum(["split", "personal"]).default("split"),
        userId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Validate: personal rules require userId, split rules must not have one
      if (input.ruleType === "personal" && input.userId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Personal rules require a userId",
        });
      }
      if (input.ruleType === "split" && input.userId != null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Split rules must not have a userId",
        });
      }

      return db
        .insert(categoryRules)
        .values({
          pattern: input.pattern,
          categoryId: input.categoryId,
          createdByUserId: input.createdByUserId,
          ruleType: input.ruleType,
          userId: input.userId ?? null,
        })
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

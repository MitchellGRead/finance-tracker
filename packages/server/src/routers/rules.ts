import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { rules, categories } from "../db/schema";

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

  create: publicProcedure
    .input(
      z.object({
        pattern: z.string().min(1),
        ruleType: z.enum(["split", "personal"]).default("split"),
        userId: z.number().nullable().optional(),
        action: z.enum(["accept", "reject"]).nullable().optional(),
        categoryId: z.number().nullable().optional(),
        createdByUserId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
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
      if (input.action == null && input.categoryId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Rule must set at least an action or a category",
        });
      }

      return db
        .insert(rules)
        .values({
          pattern: input.pattern,
          ruleType: input.ruleType,
          userId: input.userId ?? null,
          action: input.action ?? null,
          categoryId: input.categoryId ?? null,
          createdByUserId: input.createdByUserId,
        })
        .returning()
        .get();
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

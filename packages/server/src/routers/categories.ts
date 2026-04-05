import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { categories } from "../db/schema";

export const categoriesRouter = router({
  list: publicProcedure.query(async () => {
    return db.select().from(categories).orderBy(categories.name);
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        defaultSplitRatio: z.number().min(0).max(1).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return db
        .insert(categories)
        .values({
          name: input.name,
          defaultSplitRatio: input.defaultSplitRatio ?? null,
        })
        .returning()
        .get();
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        defaultSplitRatio: z.number().min(0).max(1).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      return db
        .update(categories)
        .set(updates)
        .where(eq(categories.id, id))
        .returning()
        .get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db.delete(categories).where(eq(categories.id, input.id)).run();
    }),
});

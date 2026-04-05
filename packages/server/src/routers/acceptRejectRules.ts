import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { acceptRejectRules } from "../db/schema";

export const acceptRejectRulesRouter = router({
  list: publicProcedure
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.userId !== undefined) {
        return db
          .select()
          .from(acceptRejectRules)
          .where(eq(acceptRejectRules.userId, input.userId))
          .orderBy(acceptRejectRules.pattern);
      }
      return db
        .select()
        .from(acceptRejectRules)
        .orderBy(acceptRejectRules.pattern);
    }),

  create: publicProcedure
    .input(
      z.object({
        userId: z.number(),
        pattern: z.string().min(1),
        action: z.enum(["accept", "reject"]),
      })
    )
    .mutation(async ({ input }) => {
      return db
        .insert(acceptRejectRules)
        .values(input)
        .returning()
        .get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db
        .delete(acceptRejectRules)
        .where(eq(acceptRejectRules.id, input.id))
        .run();
    }),
});

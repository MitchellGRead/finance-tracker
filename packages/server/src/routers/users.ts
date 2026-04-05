import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { db } from "../db";
import { users } from "../db/schema";

export const usersRouter = router({
  list: publicProcedure.query(async () => {
    return db.select().from(users).orderBy(users.name);
  }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const result = db.insert(users).values({ name: input.name }).returning();
      return result.get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db.delete(users).where(eq(users.id, input.id));
    }),
});

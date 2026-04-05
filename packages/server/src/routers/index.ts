import { router } from "../trpc";
import { usersRouter } from "./users";
import { statementsRouter } from "./statements";
import { lineItemsRouter } from "./lineItems";
import { categoriesRouter } from "./categories";

export const appRouter = router({
  users: usersRouter,
  statements: statementsRouter,
  lineItems: lineItemsRouter,
  categories: categoriesRouter,
});

export type AppRouter = typeof appRouter;

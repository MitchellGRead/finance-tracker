import { router } from "../trpc";
import { usersRouter } from "./users";
import { statementsRouter } from "./statements";
import { lineItemsRouter } from "./lineItems";
import { categoriesRouter } from "./categories";
import { rulesRouter } from "./rules";
import { reportsRouter } from "./reports";

export const appRouter = router({
  users: usersRouter,
  statements: statementsRouter,
  lineItems: lineItemsRouter,
  categories: categoriesRouter,
  rules: rulesRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;

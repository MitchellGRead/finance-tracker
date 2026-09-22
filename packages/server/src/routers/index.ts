import { router } from "../trpc";
import { usersRouter } from "./users";
import { statementsRouter } from "./statements";
import { lineItemsRouter } from "./lineItems";
import { categoriesRouter } from "./categories";
import { rulesRouter } from "./rules";
import { reportsRouter } from "./reports";
import { suggestionsRouter } from "./suggestions";

export const appRouter = router({
  users: usersRouter,
  statements: statementsRouter,
  lineItems: lineItemsRouter,
  categories: categoriesRouter,
  rules: rulesRouter,
  reports: reportsRouter,
  suggestions: suggestionsRouter,
});

export type AppRouter = typeof appRouter;

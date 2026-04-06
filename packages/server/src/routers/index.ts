import { router } from "../trpc";
import { usersRouter } from "./users";
import { statementsRouter } from "./statements";
import { lineItemsRouter } from "./lineItems";
import { categoriesRouter } from "./categories";
import { categoryRulesRouter } from "./categoryRules";
import { acceptRejectRulesRouter } from "./acceptRejectRules";
import { reportsRouter } from "./reports";

export const appRouter = router({
  users: usersRouter,
  statements: statementsRouter,
  lineItems: lineItemsRouter,
  categories: categoriesRouter,
  categoryRules: categoryRulesRouter,
  acceptRejectRules: acceptRejectRulesRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;

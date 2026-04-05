import { router } from "../trpc";
import { usersRouter } from "./users";
import { statementsRouter } from "./statements";
import { lineItemsRouter } from "./lineItems";
import { categoriesRouter } from "./categories";
import { categoryRulesRouter } from "./categoryRules";
import { acceptRejectRulesRouter } from "./acceptRejectRules";

export const appRouter = router({
  users: usersRouter,
  statements: statementsRouter,
  lineItems: lineItemsRouter,
  categories: categoriesRouter,
  categoryRules: categoryRulesRouter,
  acceptRejectRules: acceptRejectRulesRouter,
});

export type AppRouter = typeof appRouter;

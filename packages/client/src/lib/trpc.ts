import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@finance-tracker/server/routers/index";

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@finance-tracker/server/routers/index";
import { TRPCProvider } from "./lib/trpc";
import { App } from "./App";
import "./app.css";

function Root() {
  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 60 * 1000 },
      },
      // Month status (header calendar marks, checklist) and anomalies derive
      // from line items, reports and settlements, which many mutations touch
      // (inline edits, import, clear month, re-apply rules). Both are cheap,
      // so refresh them after any mutation rather than at every call site.
      mutationCache: new MutationCache({
        onSuccess: () => {
          client.invalidateQueries({ queryKey: [["reports", "status"]] });
          client.invalidateQueries({ queryKey: [["reports", "anomalies"]] });
        },
      }),
    });
    return client;
  });

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: "/trpc",
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <App />
      </TRPCProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

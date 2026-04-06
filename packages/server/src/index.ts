import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./routers";

const app = new Hono();

app.use("/*", cors({ origin: "http://localhost:5173" }));

app.use("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({}),
  });
  return response;
});

app.get("/health", (c) => c.json({ status: "ok" }));

const port = 3200;
console.log(`Server running on http://localhost:${port}`);
const server = serve({ fetch: app.fetch, port });

// Graceful shutdown — release the port when the process is killed
const shutdown = () => {
  // closeAllConnections is available in Node 18.2+ but not in all type defs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (server as any).closeAllConnections === "function") {
    (server as any).closeAllConnections();
  }
  server.close(() => {
    process.exit(0);
  });
  // Fallback in case close callback doesn't fire
  setTimeout(() => process.exit(0), 1000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

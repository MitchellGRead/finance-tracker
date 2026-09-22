import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { config } from "../lib/config";
import {
  clearSuggestions,
  generateSuggestionsForLineItems,
  startSuggestionRun,
} from "../services/suggestionEngine";
import { getSuggestionRun } from "../services/suggestionQueue";
import { isSuggestionsEnabled } from "../services/typesafeClient";

export const suggestionsRouter = router({
  /** Lets the client hide the whole feature when no API key is configured. */
  config: publicProcedure.query(() => ({
    enabled: isSuggestionsEnabled(),
    model: config.typesafe.model,
    suggestOnImport: config.typesafe.suggestOnImport,
  })),

  generate: publicProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1),
        force: z.boolean().default(false),
        /** Run inline and return final counts. The client uses this for small chunks. */
        wait: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      if (!isSuggestionsEnabled()) {
        return {
          runId: null,
          generated: 0,
          skipped: input.ids.length,
          failed: 0,
          disabled: true,
          error: null,
        };
      }

      if (!input.wait) {
        const run = startSuggestionRun(input.ids, input.force);
        return {
          runId: run.runId,
          generated: 0,
          skipped: 0,
          failed: 0,
          disabled: false,
          error: null,
        };
      }

      const result = await generateSuggestionsForLineItems(input.ids, { force: input.force });
      if (result.error !== null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      }
      return { runId: null, ...result };
    }),

  runStatus: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ input }) => getSuggestionRun(input.runId)),

  clear: publicProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(({ input }) => ({ cleared: clearSuggestions(input.ids) })),
});

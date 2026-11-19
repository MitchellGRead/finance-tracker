import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { loadMonthStatuses } from "../services/loadMonthStatuses";
import {
  deleteSettlement,
  loadSettlementRecords,
  paymentDifference,
  planSettlement,
  saveSettlement,
} from "../services/settlements";
import { monthKey } from "../lib/months";

const monthsInput = z
  .array(z.object({ month: z.number().int().min(1).max(12), year: z.number().int() }))
  .min(1);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const keysOf = (months: Array<{ month: number; year: number }>) => months.map((m) => monthKey(m.year, m.month));

export const settlementsRouter = router({
  /** Every settlement, newest first, with its transfers and paid − owed. */
  list: publicProcedure.query(async () => {
    return loadSettlementRecords()
      .map((s) => ({
        ...s,
        paid: Math.round(s.payments.reduce((t, p) => t + p.amount, 0) * 100) / 100,
        difference: paymentDifference(s),
      }))
      .reverse();
  }),

  /** Outstanding balance: unsettled shares + pending adjustments + carried. */
  outstanding: publicProcedure.query(async () => {
    const { pair, outstanding } = loadMonthStatuses();
    return { pair, ...outstanding };
  }),

  /**
   * What settling these months would record (shares, pending adjustments,
   * carried difference, direction) and anything blocking it.
   */
  plan: publicProcedure.input(z.object({ months: monthsInput })).query(async ({ input }) => {
    return planSettlement(loadMonthStatuses(), keysOf(input.months));
  }),

  /**
   * Record a settlement. Amounts owed are recomputed server-side from live
   * month status; covered months must have current reports.
   */
  create: publicProcedure
    .input(
      z.object({
        months: monthsInput,
        payments: z.array(z.object({ amount: z.number().positive(), paidOn: isoDate })).min(1),
        note: z.string().trim().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const plan = planSettlement(loadMonthStatuses(), keysOf(input.months));
      if (plan.problems.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot settle: ${plan.problems.map((p) => `${p.key || "household"} ${p.problem.replace(/_/g, " ")}`).join(", ")}`,
        });
      }
      const id = saveSettlement(plan, input.payments, input.note || null);
      return { id, plan };
    }),

  /** Undo a settlement; its months revert to unsettled. */
  delete: publicProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    if (!deleteSettlement(input.id)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Settlement not found" });
    }
    return { id: input.id };
  }),
});

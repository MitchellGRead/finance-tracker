import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { lineItems, categories, users, reportSnapshots } from "../db/schema";
import { computeReport } from "./computeReport";
import type { ReportSnapshot } from "@finance-tracker/shared";

export function generateReportData(
  month: number,
  year: number
): ReportSnapshot {
  return computeReport(
    db.select().from(lineItems).all(),
    db.select().from(users).all(),
    db.select().from(categories).all(),
    month,
    year
  );
}

/** Every stored report snapshot, parsed. */
export function loadSnapshots(): ReportSnapshot[] {
  return db
    .select({ data: reportSnapshots.data })
    .from(reportSnapshots)
    .all()
    .map((s) => JSON.parse(s.data) as ReportSnapshot);
}

/**
 * Recompute a month and replace its snapshot. Regeneration is always an
 * explicit operator action — never automatic.
 */
export function saveSnapshot(month: number, year: number) {
  const data = generateReportData(month, year);
  return db.transaction((tx) => {
    tx.delete(reportSnapshots)
      .where(and(eq(reportSnapshots.periodMonth, month), eq(reportSnapshots.periodYear, year)))
      .run();
    const snapshot = tx
      .insert(reportSnapshots)
      .values({
        periodMonth: month,
        periodYear: year,
        generatedAt: data.generatedAt,
        data: JSON.stringify(data),
      })
      .returning()
      .get();
    return { ...snapshot, parsed: data };
  });
}

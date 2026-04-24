import { db } from "../db";
import { lineItems, categories, users } from "../db/schema";
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

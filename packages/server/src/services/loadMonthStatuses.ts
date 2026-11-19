import { db } from "../db";
import { lineItems, categories, users } from "../db/schema";
import { computeMonthStatuses } from "./monthStatus";
import { loadSnapshots } from "./reportGenerator";
import { loadSettlementRecords } from "./settlements";

/** Every month's status from the database (full live recompute). */
export function loadMonthStatuses() {
  return computeMonthStatuses({
    items: db.select().from(lineItems).all(),
    users: db.select().from(users).all(),
    categories: db.select().from(categories).all(),
    snapshots: loadSnapshots(),
    settlements: loadSettlementRecords(),
  });
}

import { db } from "../db";
import { rules, categories, lineItems } from "../db/schema";
import { eq } from "drizzle-orm";
import { PERSONAL_SPLIT_RATIO, bestRuleFor } from "@finance-tracker/shared";

/**
 * Apply all rules to a set of line item IDs.
 * Called after import to auto-categorize and auto-accept/reject.
 * Uses a single-pass match against the unified rules table.
 */
export function applyRulesToLineItems(
  lineItemIds: number[]
): { applied: number; conflicts: number } {
  const allRules = db.select().from(rules).all();
  const allCategories = db.select().from(categories).all();

  const items = lineItemIds
    .map((id) =>
      db.select().from(lineItems).where(eq(lineItems.id, id)).get()
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  let applied = 0;
  let conflicts = 0;

  for (const item of items) {
    const updates: Record<string, unknown> = {};

    // Longest pattern wins; personal beats split at equal length; then
    // first-created. A same-type tie is a conflict.
    const result = bestRuleFor(item.description, allRules, item.userId);
    if (result.match) {
      applied++;

      if (result.hasConflict) {
        conflicts++;
        updates.note = `[Rule conflict] Multiple rules matched — auto-assigned by first-created rule`;
      }

      // Apply status action
      if (result.match.action) {
        updates.status =
          result.match.action === "accept" ? "accepted" : "rejected";
      }

      // Apply category
      if (result.match.categoryId) {
        updates.categoryId = result.match.categoryId;
      }

      // Apply split ratio
      if (result.match.ruleType === "personal") {
        updates.splitRatio = PERSONAL_SPLIT_RATIO;
      } else if (result.match.categoryId) {
        const category = allCategories.find(
          (c) => c.id === result.match!.categoryId
        );
        if (
          category?.defaultSplitRatio !== null &&
          category?.defaultSplitRatio !== undefined
        ) {
          updates.splitRatio = category.defaultSplitRatio;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      db.update(lineItems)
        .set(updates)
        .where(eq(lineItems.id, item.id))
        .run();
    }
  }

  return { applied, conflicts };
}

/**
 * Re-apply rules to all line items for a given month/year.
 * Only applies to items that haven't been manually overridden.
 */
export function reapplyRulesForPeriod(
  month: number,
  year: number
): { applied: number; conflicts: number } {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const allItems = db.select().from(lineItems).all();
  const periodItems = allItems.filter(
    (item) =>
      item.date.startsWith(prefix) &&
      !item.statusOverride &&
      !item.categoryOverride &&
      !item.splitRatioOverride
  );

  const ids = periodItems.map((item) => item.id);
  if (ids.length === 0) return { applied: 0, conflicts: 0 };
  return applyRulesToLineItems(ids);
}

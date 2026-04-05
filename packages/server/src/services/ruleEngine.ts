import { db } from "../db";
import {
  categoryRules,
  acceptRejectRules,
  categories,
  lineItems,
} from "../db/schema";
import { eq } from "drizzle-orm";
interface RuleMatch<T> {
  rule: T;
  patternLength: number;
}

/**
 * Find the best matching rule for a description using case-insensitive
 * substring matching. Longest pattern wins. If multiple rules match with
 * the same length, first-created wins and `hasConflict` is set.
 */
function findBestMatch<T extends { pattern: string; createdAt: string }>(
  description: string,
  rules: T[]
): { match: T | null; hasConflict: boolean } {
  const descLower = description.toLowerCase();
  const matches: RuleMatch<T>[] = [];

  for (const rule of rules) {
    if (descLower.includes(rule.pattern.toLowerCase())) {
      matches.push({ rule, patternLength: rule.pattern.length });
    }
  }

  if (matches.length === 0) return { match: null, hasConflict: false };

  // Sort by pattern length descending, then by createdAt ascending
  matches.sort((a, b) => {
    if (b.patternLength !== a.patternLength) {
      return b.patternLength - a.patternLength;
    }
    return a.rule.createdAt.localeCompare(b.rule.createdAt);
  });

  const longest = matches[0].patternLength;
  const topMatches = matches.filter((m) => m.patternLength === longest);
  const hasConflict = topMatches.length > 1;

  return { match: matches[0].rule, hasConflict };
}

/**
 * Apply all rules to a set of line item IDs.
 * Called after import to auto-categorize and auto-accept/reject.
 */
export function applyRulesToLineItems(
  lineItemIds: number[],
  userId: number
): { applied: number; conflicts: number } {
  // Fetch all rules
  const allCategoryRules = db.select().from(categoryRules).all();
  const userAcceptRejectRules = db
    .select()
    .from(acceptRejectRules)
    .where(eq(acceptRejectRules.userId, userId))
    .all();
  const allCategories = db.select().from(categories).all();

  // Fetch the line items to process
  const items = lineItemIds
    .map((id) =>
      db.select().from(lineItems).where(eq(lineItems.id, id)).get()
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  let applied = 0;
  let conflicts = 0;

  for (const item of items) {
    const updates: Record<string, unknown> = {};

    // 1. Accept/Reject rules (per-user, longest match)
    const arResult = findBestMatch(item.description, userAcceptRejectRules);
    if (arResult.match) {
      updates.status = arResult.match.action === "accept" ? "accepted" : "rejected";
      applied++;
    }

    // 2. Category rules (global, longest match, conflict flagging)
    const catResult = findBestMatch(item.description, allCategoryRules);
    if (catResult.match) {
      updates.categoryId = catResult.match.categoryId;
      applied++;

      if (catResult.hasConflict) {
        conflicts++;
        // Add a note indicating conflict for user review
        updates.note = `[Category conflict] Multiple rules matched — auto-assigned by first-created rule`;
      }

      // 3. Apply category's default split ratio if it has one
      const category = allCategories.find(
        (c) => c.id === catResult.match!.categoryId
      );
      if (category?.defaultSplitRatio !== null && category?.defaultSplitRatio !== undefined) {
        updates.splitRatio = category.defaultSplitRatio;
      }
    }

    // Apply updates if any rules matched
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
      !item.categoryOverride
  );

  // Group by user and apply rules per user
  const byUser = new Map<number, number[]>();
  for (const item of periodItems) {
    const ids = byUser.get(item.userId) ?? [];
    ids.push(item.id);
    byUser.set(item.userId, ids);
  }

  let totalApplied = 0;
  let totalConflicts = 0;

  for (const [userId, ids] of byUser) {
    const result = applyRulesToLineItems(ids, userId);
    totalApplied += result.applied;
    totalConflicts += result.conflicts;
  }

  return { applied: totalApplied, conflicts: totalConflicts };
}

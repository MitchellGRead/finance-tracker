import { db } from "../db";
import { rules, categories, lineItems } from "../db/schema";
import { eq } from "drizzle-orm";
import { PERSONAL_SPLIT_RATIO } from "@finance-tracker/shared";

interface RuleMatch<T> {
  rule: T;
  patternLength: number;
}

/**
 * Find the best matching rule for a description using case-insensitive
 * substring matching. Longest pattern wins. Personal rules win over split
 * rules at equal pattern length. If multiple rules of the same type match
 * with the same length, first-created wins and `hasConflict` is set.
 */
function findBestMatch<
  T extends { pattern: string; createdAt: string; ruleType?: string },
>(
  description: string,
  ruleList: T[]
): { match: T | null; hasConflict: boolean } {
  const descLower = description.toLowerCase();
  const matches: RuleMatch<T>[] = [];

  for (const rule of ruleList) {
    if (descLower.includes(rule.pattern.toLowerCase())) {
      matches.push({ rule, patternLength: rule.pattern.length });
    }
  }

  if (matches.length === 0) return { match: null, hasConflict: false };

  // Sort by pattern length descending, personal before split at equal length,
  // then by createdAt ascending
  matches.sort((a, b) => {
    if (b.patternLength !== a.patternLength) {
      return b.patternLength - a.patternLength;
    }
    const aPersonal = a.rule.ruleType === "personal" ? 0 : 1;
    const bPersonal = b.rule.ruleType === "personal" ? 0 : 1;
    if (aPersonal !== bPersonal) return aPersonal - bPersonal;
    return a.rule.createdAt.localeCompare(b.rule.createdAt);
  });

  const longest = matches[0].patternLength;
  const topMatches = matches.filter((m) => m.patternLength === longest);
  const topType = topMatches[0].rule.ruleType;
  const sameTypeTopMatches = topMatches.filter(
    (m) => m.rule.ruleType === topType
  );
  const hasConflict = sameTypeTopMatches.length > 1;

  return { match: matches[0].rule, hasConflict };
}

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

    // Filter applicable rules: split rules + personal rules for this user
    const applicableRules = allRules.filter(
      (r) =>
        r.ruleType === "split" ||
        (r.ruleType === "personal" && r.userId === item.userId)
    );

    const result = findBestMatch(item.description, applicableRules);
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

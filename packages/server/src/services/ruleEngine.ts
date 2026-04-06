import { db } from "../db";
import {
  categoryRules,
  acceptRejectRules,
  categories,
  lineItems,
} from "../db/schema";
import { eq } from "drizzle-orm";
import { PERSONAL_SPLIT_RATIO } from "@finance-tracker/shared";

interface RuleMatch<T> {
  rule: T;
  patternLength: number;
}

/**
 * Find the best matching rule for a description using case-insensitive
 * substring matching. Longest pattern wins. For category rules, personal
 * rules win over split rules at equal pattern length. If multiple rules
 * of the same type match with the same length, first-created wins and
 * `hasConflict` is set.
 */
function findBestMatch<
  T extends { pattern: string; createdAt: string; ruleType?: string },
>(
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

  // Sort by pattern length descending, personal before split at equal length,
  // then by createdAt ascending
  matches.sort((a, b) => {
    if (b.patternLength !== a.patternLength) {
      return b.patternLength - a.patternLength;
    }
    // Personal rules win over split rules at equal length
    const aPersonal = a.rule.ruleType === "personal" ? 0 : 1;
    const bPersonal = b.rule.ruleType === "personal" ? 0 : 1;
    if (aPersonal !== bPersonal) return aPersonal - bPersonal;
    return a.rule.createdAt.localeCompare(b.rule.createdAt);
  });

  const longest = matches[0].patternLength;
  const topMatches = matches.filter((m) => m.patternLength === longest);
  // Only flag conflict between rules of the same type at equal length
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
 */
export function applyRulesToLineItems(
  lineItemIds: number[]
): { applied: number; conflicts: number } {
  // Fetch all rules (accept/reject rules are global — applied to all users)
  const allCategoryRules = db.select().from(categoryRules).all();
  const allAcceptRejectRules = db.select().from(acceptRejectRules).all();
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

    // 1. Accept/Reject rules (global, longest match)
    const arResult = findBestMatch(item.description, allAcceptRejectRules);
    if (arResult.match) {
      updates.status = arResult.match.action === "accept" ? "accepted" : "rejected";
      applied++;
    }

    // 2. Category rules (filter applicable rules per item, longest match, conflict flagging)
    const applicableRules = allCategoryRules.filter(
      (r) =>
        r.ruleType === "split" ||
        (r.ruleType === "personal" && r.userId === item.userId)
    );
    const catResult = findBestMatch(item.description, applicableRules);
    if (catResult.match) {
      updates.categoryId = catResult.match.categoryId;
      applied++;

      if (catResult.hasConflict) {
        conflicts++;
        updates.note = `[Category conflict] Multiple rules matched — auto-assigned by first-created rule`;
      }

      if (catResult.match.ruleType === "personal") {
        // Personal rules always set split ratio to 100% (no split)
        updates.splitRatio = PERSONAL_SPLIT_RATIO;
      } else {
        // 3. Apply category's default split ratio if it has one
        const category = allCategories.find(
          (c) => c.id === catResult.match!.categoryId
        );
        if (
          category?.defaultSplitRatio !== null &&
          category?.defaultSplitRatio !== undefined
        ) {
          updates.splitRatio = category.defaultSplitRatio;
        }
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
      !item.categoryOverride &&
      !item.splitRatioOverride
  );

  const ids = periodItems.map((item) => item.id);
  if (ids.length === 0) return { applied: 0, conflicts: 0 };
  return applyRulesToLineItems(ids);
}

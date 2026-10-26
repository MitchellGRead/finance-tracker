/**
 * Pure helpers for reasoning about a line item's rules and overrides.
 * Moved out of LineItemsTable so they can be tested and shared; none need React.
 */

import { bestRuleFor } from "@finance-tracker/shared";

export interface MatchedRule {
  id: number;
  pattern: string;
  action: string | null;
  categoryName: string | null;
  isPersonal: boolean;
}

/** The rule the engine would apply to this item (same precedence, via shared). */
export function findMatchingRule(
  description: string,
  allRules: Array<{
    id: number;
    pattern: string;
    ruleType: string;
    userId: number | null;
    action: string | null;
    categoryName: string | null;
    createdAt: string;
  }>,
  itemUserId: number
): MatchedRule | null {
  const best = bestRuleFor(description, allRules, itemUserId).match;
  if (!best) return null;
  return {
    id: best.id,
    pattern: best.pattern,
    action: best.action,
    categoryName: best.categoryName,
    isPersonal: best.ruleType === "personal",
  };
}

export function isRealOverride(item: {
  statusOverride: boolean;
  status: string;
  categoryOverride: boolean;
  categoryId: number | null;
  splitRatioOverride: boolean;
  splitRatio: number;
}): boolean {
  if (item.statusOverride && item.status !== "pending") return true;
  if (item.categoryOverride && item.categoryId !== null) return true;
  if (item.splitRatioOverride && Math.abs(item.splitRatio - 0.5) > 0.001)
    return true;
  return false;
}

/**
 * Check whether the item's current state diverges from what the matching
 * rule would produce.
 */
export function itemDivergesFromRule(
  item: {
    status: string;
    categoryName: string | null;
    splitRatio: number;
  },
  rule: MatchedRule
): boolean {
  if (rule.action) {
    const expectedStatus = rule.action === "accept" ? "accepted" : "rejected";
    if (item.status !== expectedStatus) return true;
  }

  if (rule.categoryName) {
    if (item.categoryName !== rule.categoryName) return true;
  }

  if (rule.isPersonal && item.splitRatio !== 1.0) return true;

  return false;
}

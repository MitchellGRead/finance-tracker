/**
 * Which rule wins for a line item. Shared so the engine that applies rules,
 * the table that shows which rule matched, the row editor's save preview and
 * the Rules dialog's coverage counts all rank rules the same way — when they
 * disagreed, saving a rule could silently change a different one than the
 * operator was looking at.
 *
 * Precedence: longest normalized pattern, then personal over split, then
 * first-created.
 */

import {
  descriptionMatchesPattern,
  patternMatchLength,
  patternsAreEquivalent,
} from "./matching";

export interface RankableRule {
  pattern: string;
  ruleType: string;
  userId: number | null;
  createdAt: string;
}

/** Split rules apply to everyone; personal rules only to their user. */
export function ruleAppliesToUser(rule: RankableRule, userId: number): boolean {
  return rule.ruleType === "split" || (rule.ruleType === "personal" && rule.userId === userId);
}

/** Negative when `a` beats `b`. */
export function compareRulePrecedence(a: RankableRule, b: RankableRule): number {
  const byLength = patternMatchLength(b.pattern) - patternMatchLength(a.pattern);
  if (byLength !== 0) return byLength;
  const aPersonal = a.ruleType === "personal" ? 0 : 1;
  const bPersonal = b.ruleType === "personal" ? 0 : 1;
  if (aPersonal !== bPersonal) return aPersonal - bPersonal;
  return a.createdAt.localeCompare(b.createdAt);
}

/** Every rule that matches the description for this user, best first. */
export function rankMatchingRules<T extends RankableRule>(
  description: string,
  rules: T[],
  userId: number
): T[] {
  return rules
    .filter((r) => ruleAppliesToUser(r, userId) && descriptionMatchesPattern(description, r.pattern))
    .sort(compareRulePrecedence);
}

/**
 * The winning rule, and whether another rule of the same type and length tied
 * with it (the engine notes a conflict on the item).
 */
export function bestRuleFor<T extends RankableRule>(
  description: string,
  rules: T[],
  userId: number
): { match: T | null; hasConflict: boolean } {
  const ranked = rankMatchingRules(description, rules, userId);
  const [first, second] = ranked;
  if (!first) return { match: null, hasConflict: false };
  const hasConflict =
    second !== undefined &&
    patternMatchLength(second.pattern) === patternMatchLength(first.pattern) &&
    second.ruleType === first.ruleType;
  return { match: first, hasConflict };
}

/**
 * The stored rule that saving `{pattern, ruleType, userId}` from a line item
 * updates instead of inserting: same pattern (normalized) and scope.
 */
export function findEquivalentRule<T extends RankableRule>(
  rules: T[],
  target: { pattern: string; ruleType: string; userId: number }
): T | undefined {
  return rules.find(
    (r) =>
      patternsAreEquivalent(r.pattern, target.pattern) &&
      r.ruleType === target.ruleType &&
      (target.ruleType === "split" || r.userId === target.userId)
  );
}

export interface SavableRule extends RankableRule {
  id: number;
  action: string | null;
  categoryId: number | null;
}

export interface RuleSaveInput {
  pattern: string;
  ruleType: "split" | "personal";
  /** The line item's user; becomes the rule's user for a personal rule. */
  userId: number;
  action: "accept" | "reject";
  categoryId: number | null;
}

export interface RuleSavePlan<T> {
  /** The rule that will be updated, or null when a new one is created. */
  existing: T | null;
  /** Fields that change on `existing`, or that a new rule sets. */
  changes: {
    action?: { from: string | null; to: string };
    categoryId?: { from: number | null; to: number };
  };
  /** False when the pattern does not match the item it is saved from. */
  matchesItem: boolean;
  /** A rule that will still outrank the saved one on this item. */
  beatenBy: T | null;
}

/**
 * What saving a rule from a line item will do — the row editor previews it
 * and `lineItems.acceptAndCreateRules` executes it, so they cannot disagree.
 * A null category leaves an existing rule's category alone.
 */
export function planRuleSave<T extends SavableRule>(
  rules: T[],
  input: RuleSaveInput,
  item: { description: string; userId: number }
): RuleSavePlan<T> {
  const existing = findEquivalentRule(rules, input) ?? null;

  const changes: RuleSavePlan<T>["changes"] = {};
  if (existing?.action !== input.action) {
    changes.action = { from: existing?.action ?? null, to: input.action };
  }
  if (input.categoryId !== null && existing?.categoryId !== input.categoryId) {
    changes.categoryId = { from: existing?.categoryId ?? null, to: input.categoryId };
  }

  const saved: RankableRule = existing ?? {
    pattern: input.pattern,
    ruleType: input.ruleType,
    userId: input.ruleType === "personal" ? input.userId : null,
    // A new rule is the newest, so it loses every tie on creation order.
    createdAt: "9999-12-31",
  };
  const matchesItem =
    ruleAppliesToUser(saved, item.userId) &&
    rankMatchingRules(item.description, [saved], item.userId).length > 0;
  const beatenBy =
    rankMatchingRules(item.description, rules, item.userId).find(
      (r) => r !== existing && compareRulePrecedence(r, saved) < 0
    ) ?? null;

  return { existing, changes, matchesItem, beatenBy };
}

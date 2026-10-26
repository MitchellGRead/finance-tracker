/**
 * Plain-language text for what saving a rule from a line item will do (the
 * row editor's preview) and did (the notice after saving). Saving updates
 * whichever rule has that exact pattern and scope — not necessarily the rule
 * the item matched — so both say which rule, and warn when a more specific
 * rule will still win on the item.
 */

import type { RuleSavePlan, SavableRule } from "@finance-tracker/shared";

export interface RuleNotice {
  ruleId: number;
  text: string;
  /** A more specific rule still wins on the item. */
  warning: string | null;
}

export interface RulePreview {
  text: string;
  warning: string | null;
}

/** Mirrors the `acceptAndCreateRules` result. */
interface SaveResult {
  outcome: "created" | "updated";
  rule: { id: number; pattern: string; action: string | null; categoryName: string | null };
  changes: {
    action: { from: string | null; to: string } | null;
    category: { from: string | null; to: string | null } | null;
  };
  wins: number;
  beatenBy: { id: number; pattern: string } | null;
}

const quote = (pattern: string) => `“${pattern.replace(/\s+/g, " ").trim()}”`;

function changeList(
  action: { from: string | null; to: string } | null | undefined,
  category: { from: string | null; to: string | null } | null | undefined,
  isNew: boolean
): string {
  const parts: string[] = [];
  if (action) parts.push(isNew ? action.to : `${action.from ?? "no action"} → ${action.to}`);
  if (category) parts.push(isNew ? `${category.to}` : `${category.from ?? "no category"} → ${category.to}`);
  return parts.join(", ");
}

function beatenWarning(pattern: string): string {
  return `${quote(pattern)} is more specific and still decides this item`;
}

export function describeSavePlan(
  plan: RuleSavePlan<SavableRule>,
  pattern: string,
  ruleType: "split" | "personal",
  categoryName: (id: number | null) => string | null
): RulePreview {
  const category = plan.changes.categoryId
    ? {
        from: categoryName(plan.changes.categoryId.from),
        to: categoryName(plan.changes.categoryId.to),
      }
    : null;
  const changes = changeList(plan.changes.action, category, plan.existing === null);

  const text = plan.existing
    ? `Updates ${quote(plan.existing.pattern)}: ${changes || "no change"}`
    : `Creates ${ruleType} rule ${quote(pattern)}${changes ? `: ${changes}` : ""}`;

  let warning: string | null = null;
  if (!plan.matchesItem) warning = "Pattern doesn’t match this item";
  else if (plan.beatenBy) warning = beatenWarning(plan.beatenBy.pattern);

  return { text, warning };
}

export function describeSaveResult(result: SaveResult): RuleNotice {
  const changes = changeList(
    result.changes.action,
    result.changes.category,
    result.outcome === "created"
  );
  const verb = result.outcome === "created" ? "Created" : "Updated";
  const covers = `applies to ${result.wins} item${result.wins === 1 ? "" : "s"}`;
  return {
    ruleId: result.rule.id,
    text: `${verb} ${quote(result.rule.pattern)}${changes ? ` (${changes})` : ""} · ${covers}`,
    warning: result.beatenBy ? beatenWarning(result.beatenBy.pattern) : null,
  };
}

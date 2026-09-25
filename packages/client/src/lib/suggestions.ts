import {
  PERSONAL_SPLIT_RATIO,
  SPLIT_RATIO_EPSILON,
  SUGGESTION_CONFIDENCE_TIER,
  hasShadowCategory,
  hasShadowSplit,
  type SuggestionBearing,
} from "@finance-tracker/shared";
import type { MatchedRule } from "./lineItemRules";

/**
 * Decides what, if anything, the AI suggestion should render as for one row.
 * Every suppression rule lives here so the cells stay dumb.
 */

export interface CategoryFacet {
  categoryId: number;
  categoryName: string;
  confidence: number | null;
  /**
   * "ghost" — the cell is empty, so the suggestion renders in place.
   * "badge" — the cell already has a different value, so it renders as a small
   * marker in the actions column instead of arguing with the visible value.
   */
  mode: "ghost" | "badge";
}

export interface SplitFacet {
  ratio: number;
  isPersonal: boolean;
  confidence: number | null;
}

export interface LiveSuggestion {
  category: CategoryFacet | null;
  split: SplitFacet | null;
}

const EMPTY: LiveSuggestion = { category: null, split: null };

export type SuggestionRow = SuggestionBearing & {
  status: string;
  suggestedCategoryName: string | null;
  suggestedCategoryConfidence: number | null;
  suggestedSplitConfidence: number | null;
};

export function getLiveSuggestion(
  item: SuggestionRow,
  categories: Array<{ id: number; name: string }>,
  matchedRule: MatchedRule | null
): LiveSuggestion {
  // Once an item is accepted or rejected the decision is made; suggestions on it
  // have either been materialized or deliberately passed over.
  if (item.status !== "pending") return EMPTY;

  return {
    category: categoryFacet(item, categories, matchedRule),
    split: splitFacet(item, matchedRule),
  };
}

function categoryFacet(
  item: SuggestionRow,
  categories: Array<{ id: number; name: string }>,
  matchedRule: MatchedRule | null
): CategoryFacet | null {
  if (item.suggestedCategoryId === null) return null;
  // A rule is deterministic and already has its own divergence UI. Two competing
  // opinions in one cell would make "Update Rule" mean something ambiguous.
  if (matchedRule?.categoryName) return null;
  if (item.categoryOverride) return null;

  // Resolve the name from the live category list: the denormalized name on the
  // row goes stale when a category is renamed, and a deleted category means the
  // suggestion no longer refers to anything.
  const category = categories.find((c) => c.id === item.suggestedCategoryId);
  if (category === undefined) return null;

  const base = {
    categoryId: category.id,
    categoryName: category.name,
    confidence: item.suggestedCategoryConfidence,
  };

  if (item.categoryId === null) {
    return hasShadowCategory(item) ? { ...base, mode: "ghost" } : null;
  }
  // Already categorized: only worth showing when the model disagrees.
  if (item.categoryId === item.suggestedCategoryId) return null;
  return { ...base, mode: "badge" };
}

function splitFacet(item: SuggestionRow, matchedRule: MatchedRule | null): SplitFacet | null {
  if (item.suggestedSplitRatio === null) return null;
  if (matchedRule?.isPersonal) return null;
  if (!hasShadowSplit(item)) return null;

  return {
    ratio: item.suggestedSplitRatio,
    isPersonal:
      Math.abs(item.suggestedSplitRatio - PERSONAL_SPLIT_RATIO) < SPLIT_RATIO_EPSILON,
    confidence: item.suggestedSplitConfidence,
  };
}

export function hasLiveSuggestion(suggestion: LiveSuggestion): boolean {
  return suggestion.category !== null || suggestion.split !== null;
}

/** Low-confidence suggestions render dimmer rather than being hidden outright. */
export function isLowConfidence(confidence: number | null): boolean {
  return confidence !== null && confidence < SUGGESTION_CONFIDENCE_TIER;
}

export function formatConfidence(confidence: number | null): string {
  return confidence === null ? "" : `${Math.round(confidence * 100)}%`;
}

import { GLOBAL_DEFAULT_SPLIT_RATIO, SPLIT_RATIO_EPSILON } from "./constants";
import { SuggestionStatus } from "./enums";

/**
 * Whether a line item currently has a *live* AI suggestion for a given facet.
 *
 * These are derived, never stored. That is the point: a manual edit writes a
 * real value, which makes the predicate false, so the ghost disappears without
 * any code having to dismiss it. The suggestion itself is retained so we can
 * later measure how often the operator kept the model's guess.
 *
 * An override flag means a human already decided — a ghost there would be
 * arguing with the user — so it always suppresses the suggestion.
 */
export interface SuggestionBearing {
  categoryId: number | null;
  splitRatio: number;
  categoryOverride: boolean;
  splitRatioOverride: boolean;
  suggestedCategoryId: number | null;
  suggestedSplitRatio: number | null;
  suggestionStatus: string | null;
}

export function isDefaultSplitRatio(splitRatio: number): boolean {
  return Math.abs(splitRatio - GLOBAL_DEFAULT_SPLIT_RATIO) < SPLIT_RATIO_EPSILON;
}

export function hasShadowCategory(item: SuggestionBearing): boolean {
  return (
    item.suggestionStatus === SuggestionStatus.SHADOW &&
    item.suggestedCategoryId !== null &&
    item.categoryId === null &&
    !item.categoryOverride
  );
}

export function hasShadowSplit(item: SuggestionBearing): boolean {
  return (
    item.suggestionStatus === SuggestionStatus.SHADOW &&
    item.suggestedSplitRatio !== null &&
    !item.splitRatioOverride &&
    isDefaultSplitRatio(item.splitRatio) &&
    Math.abs(item.suggestedSplitRatio - item.splitRatio) >= SPLIT_RATIO_EPSILON
  );
}

export function hasShadowSuggestion(item: SuggestionBearing): boolean {
  return hasShadowCategory(item) || hasShadowSplit(item);
}

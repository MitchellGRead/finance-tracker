import { Check, Sparkles } from "lucide-react";
import { CategoryPicker } from "./CategoryPicker";
import { formatConfidence, isLowConfidence, type CategoryFacet } from "../lib/suggestions";

interface CategoryCellProps {
  categoryName: string | null;
  suggestion: CategoryFacet | null;
  onSelect: (categoryId: number | null) => void;
  onAcceptSuggestion: () => void;
  isSuggesting?: boolean;
}

/**
 * The category cell, with Jev's suggestion rendered as a ghost value.
 *
 * Clicking the ghost opens the picker rather than committing it: a suggestion is
 * by definition uncertain, so the largest, easiest-to-hit target should not be
 * the irreversible one. The small check accepts it.
 */
export function CategoryCell({
  categoryName,
  suggestion,
  onSelect,
  onAcceptSuggestion,
  isSuggesting = false,
}: CategoryCellProps) {
  const ghost = suggestion?.mode === "ghost" ? suggestion : null;

  if (ghost === null) {
    return (
      <CategoryPicker
        currentCategoryName={categoryName}
        onSelect={onSelect}
        trigger={
          isSuggesting
            ? ({ toggle }) => (
                <button
                  className="h-7 w-full flex items-center gap-1 text-left text-xs px-1 rounded hover:bg-muted text-muted-foreground"
                  onClick={toggle}
                  title="Jev is reviewing this item"
                >
                  <Sparkles className="h-3 w-3 animate-pulse text-cyan-500" aria-hidden />
                  <span className="truncate">{categoryName ?? "—"}</span>
                </button>
              )
            : undefined
        }
      />
    );
  }

  const confidence = formatConfidence(ghost.confidence);
  const title = confidence
    ? `Jev suggests: ${ghost.categoryName} (${confidence} confidence) — click to review, or use the check to apply`
    : `Jev suggests: ${ghost.categoryName} — click to review, or use the check to apply`;

  return (
    <CategoryPicker
      currentCategoryName={categoryName}
      onSelect={onSelect}
      suggested={{
        categoryId: ghost.categoryId,
        categoryName: ghost.categoryName,
        confidence: ghost.confidence,
      }}
      onAcceptSuggestion={onAcceptSuggestion}
      trigger={({ toggle, close }) => (
        <div className="group flex items-center gap-0.5">
          <button
            className={`h-7 min-w-0 flex-1 flex items-center gap-1 text-left text-xs px-1 rounded border border-dashed border-cyan-300 italic text-cyan-700/80 hover:bg-cyan-50 ${
              isLowConfidence(ghost.confidence) ? "opacity-60" : ""
            }`}
            onClick={toggle}
            title={title}
          >
            <Sparkles className="h-3 w-3 shrink-0 text-cyan-600" aria-hidden />
            <span className="truncate">{ghost.categoryName}</span>
          </button>
          <button
            className="h-7 px-1 rounded text-cyan-600 opacity-0 group-hover:opacity-100 hover:bg-cyan-50 focus:opacity-100"
            aria-label={`Apply suggested category ${ghost.categoryName}`}
            title={`Apply ${ghost.categoryName}`}
            onClick={() => {
              onAcceptSuggestion();
              close();
            }}
          >
            <Check className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}
    />
  );
}

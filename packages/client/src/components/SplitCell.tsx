import { Sparkles } from "lucide-react";
import { Input } from "./ui/input";
import { formatConfidence, isLowConfidence, type SplitFacet } from "../lib/suggestions";

interface SplitCellProps {
  splitRatio: number;
  splitRatioOverride: boolean;
  suggestion: SplitFacet | null;
  onChange: (splitRatio: number) => void;
}

/**
 * The split cell.
 *
 * The existing controls already perform exactly what a suggestion proposes —
 * the "P" button sets 100%, the "Personal" button sets 50% — so the shadow
 * state is pure restyling and the interaction is unchanged. The sparkle takes
 * the same slot as the override asterisk, which can never render at the same
 * time (an override always suppresses a suggestion), so nothing shifts.
 */
export function SplitCell({
  splitRatio,
  splitRatioOverride,
  suggestion,
  onChange,
}: SplitCellProps) {
  const suggestsPersonal = suggestion?.isPersonal === true;
  const suggestsShared = suggestion !== null && !suggestion.isPersonal;
  const confidence = formatConfidence(suggestion?.confidence ?? null);
  const dim = isLowConfidence(suggestion?.confidence ?? null);

  const hint = (base: string) => {
    if (suggestion === null) return base;
    const what = suggestion.isPersonal
      ? "Personal (100%)"
      : `a ${Math.round(suggestion.ratio * 100)}/${Math.round(
          (1 - suggestion.ratio) * 100
        )} split`;
    return `${base} — Jev suggests ${what}${confidence ? ` (${confidence})` : ""}`;
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {splitRatioOverride && Math.abs(splitRatio - 0.5) > 0.001 && (
        <span className="text-blue-500 text-[10px]" title="Override">
          *
        </span>
      )}
      {suggestion !== null && (
        <Sparkles
          className={`h-3 w-3 shrink-0 text-cyan-600 ${dim ? "opacity-60" : ""}`}
          aria-hidden
        />
      )}
      {splitRatio === 1.0 ? (
        <button
          className={`h-7 px-2 text-[10px] rounded border bg-orange-100 text-orange-700 ${
            suggestsShared ? "border-dashed border-cyan-400" : "border-orange-300"
          }`}
          title={hint("Personal (100%) — click to switch to split")}
          onClick={() => onChange(suggestsShared ? suggestion.ratio : 0.5)}
        >
          Personal
        </button>
      ) : (
        <div className="flex items-center gap-0.5">
          <Input
            type="number"
            min={0}
            max={100}
            value={Math.round(splitRatio * 100)}
            onChange={(e) => {
              const pct = parseInt(e.target.value);
              if (!isNaN(pct) && pct >= 0 && pct <= 100) onChange(pct / 100);
            }}
            className="h-7 w-14 text-xs text-right px-1"
          />
          <button
            className={`h-7 px-1 text-[10px] rounded border hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300 ${
              suggestsPersonal
                ? `border-dashed border-cyan-400 text-cyan-700 ${dim ? "opacity-60" : ""}`
                : "border-muted-foreground/20 text-muted-foreground"
            }`}
            title={hint("Mark as personal (100%)")}
            onClick={() => onChange(1.0)}
          >
            P
          </button>
        </div>
      )}
    </div>
  );
}

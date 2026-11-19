import { patternMatchLength, rankMatchingRules, type RankableRule } from "@finance-tracker/shared";

/**
 * How each rule fares against every stored line item: how many descriptions
 * it matches, on how many it is the rule that wins, which rules beat it on the
 * rest, which rules it ties with, and how many items would come out
 * differently without it. The Rules dialog derives its "needs attention"
 * chips from these fields; nothing here is stored.
 *
 * - No matches: `matches === 0`
 * - Overshadowed: `matches > 0 && wins === 0` — e.g. `FIX HEALTHCARE`
 *   (reject) under `FIX HEALTHCARE PAY` (accept); editing it changes nothing
 *   the operator can see, and deleting it changes nothing either
 * - Conflict: `conflicts.length > 0`
 */

export interface RuleCoverage {
  ruleId: number;
  matches: number;
  wins: number;
  /** Rules that outrank this one where both match, most frequent first. */
  beatenBy: Array<{ ruleId: number; count: number }>;
  /**
   * Rules of the same type and normalized length that tie with this one for
   * the win on some item, so creation order decides it silently. Counted only
   * when the tie is at the top — a tie below a longer winner decides nothing.
   */
  conflicts: Array<{ ruleId: number; count: number }>;
  /**
   * Items whose rule outcome (status, category, or personal vs split) would
   * differ if this rule were deleted — the next-ranked rule, or no rule,
   * takes over. Zero for a rule that wins nothing.
   */
  affectedIfDeleted: number;
}

export interface CoverageRule extends RankableRule {
  id: number;
  action: string | null;
  categoryId: number | null;
}

/** What applying a rule (or no rule) does to an item, for comparison. */
function outcomeKey(rule: CoverageRule | undefined): string {
  if (!rule) return "none";
  return `${rule.action ?? "-"}|${rule.categoryId ?? "-"}|${rule.ruleType}`;
}

const isTie = (a: RankableRule, b: RankableRule) =>
  a.ruleType === b.ruleType && patternMatchLength(a.pattern) === patternMatchLength(b.pattern);

function increment(map: Map<number, number>, key: number) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

const byCountDesc = (map: Map<number, number>) =>
  [...map]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count);

export function computeRuleCoverage<T extends CoverageRule>(
  rules: T[],
  items: Array<{ description: string; userId: number }>
): RuleCoverage[] {
  const coverage = new Map(
    rules.map((r) => [
      r.id,
      {
        matches: 0,
        wins: 0,
        beatenBy: new Map<number, number>(),
        conflicts: new Map<number, number>(),
        affectedIfDeleted: 0,
      },
    ])
  );

  for (const item of items) {
    const ranked = rankMatchingRules(item.description, rules, item.userId);
    const [winner, ...losers] = ranked;
    if (!winner) continue;

    const w = coverage.get(winner.id)!;
    w.matches += 1;
    w.wins += 1;
    if (outcomeKey(winner) !== outcomeKey(losers[0])) w.affectedIfDeleted += 1;

    for (const loser of losers) {
      const l = coverage.get(loser.id)!;
      l.matches += 1;
      increment(l.beatenBy, winner.id);
    }

    // Everyone tied with the winner conflicts with everyone else in the tie.
    const tied = ranked.filter((r) => isTie(r, winner));
    if (tied.length > 1) {
      for (const a of tied) {
        for (const b of tied) {
          if (a !== b) increment(coverage.get(a.id)!.conflicts, b.id);
        }
      }
    }
  }

  return [...coverage].map(([ruleId, c]) => ({
    ruleId,
    matches: c.matches,
    wins: c.wins,
    beatenBy: byCountDesc(c.beatenBy),
    conflicts: byCountDesc(c.conflicts),
    affectedIfDeleted: c.affectedIfDeleted,
  }));
}

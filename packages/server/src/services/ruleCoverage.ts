import { rankMatchingRules, type RankableRule } from "@finance-tracker/shared";

/**
 * How each rule fares against every stored line item: how many descriptions
 * it matches, on how many it is the rule that wins, and which rules beat it
 * on the rest. A rule that matches items but wins none is dead weight — e.g.
 * `FIX HEALTHCARE` (reject) under `FIX HEALTHCARE PAY` (accept) — and editing
 * it changes nothing the operator can see.
 */

export interface RuleCoverage {
  ruleId: number;
  matches: number;
  wins: number;
  /** Rules that outrank this one where both match, most frequent first. */
  beatenBy: Array<{ ruleId: number; count: number }>;
}

export function computeRuleCoverage<T extends RankableRule & { id: number }>(
  rules: T[],
  items: Array<{ description: string; userId: number }>
): RuleCoverage[] {
  const coverage = new Map(
    rules.map((r) => [r.id, { matches: 0, wins: 0, beatenBy: new Map<number, number>() }])
  );

  for (const item of items) {
    const [winner, ...losers] = rankMatchingRules(item.description, rules, item.userId);
    if (!winner) continue;
    const w = coverage.get(winner.id)!;
    w.matches += 1;
    w.wins += 1;
    for (const loser of losers) {
      const l = coverage.get(loser.id)!;
      l.matches += 1;
      l.beatenBy.set(winner.id, (l.beatenBy.get(winner.id) ?? 0) + 1);
    }
  }

  return [...coverage].map(([ruleId, c]) => ({
    ruleId,
    matches: c.matches,
    wins: c.wins,
    beatenBy: [...c.beatenBy]
      .map(([id, count]) => ({ ruleId: id, count }))
      .sort((a, b) => b.count - a.count),
  }));
}

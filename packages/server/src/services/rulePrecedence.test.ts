import { describe, it, expect } from "vitest";
import { bestRuleFor, planRuleSave, type SavableRule } from "@finance-tracker/shared";
import { computeRuleCoverage } from "./ruleCoverage";

const JADYN = 2;
const MITCHELL = 1;

let nextId = 1;
const rule = (overrides: Partial<SavableRule> & { pattern: string }): SavableRule => ({
  id: nextId++,
  ruleType: "personal",
  userId: JADYN,
  action: "accept",
  categoryId: null,
  createdAt: "2026-01-01 00:00:00",
  ...overrides,
});

// Verbatim from the live database: the case where "Update Rule" edited the
// broader rule and the change never showed.
const PAYCHECK = "FIX HEALTHCARE   PAY";
const broad = rule({ pattern: "FIX HEALTHCARE", action: "reject", createdAt: "2026-05-20 05:16:14" });
const specific = rule({ pattern: "FIX HEALTHCARE PAY", action: "accept", categoryId: 23, createdAt: "2026-10-26 01:49:50" });
const rules = [broad, specific];

describe("bestRuleFor", () => {
  it("picks the longest pattern regardless of creation order", () => {
    expect(bestRuleFor(PAYCHECK, rules, JADYN).match).toBe(specific);
  });

  it("prefers personal over split at equal length", () => {
    const split = rule({ pattern: "FIX HEALTHCARE PAY", ruleType: "split", userId: null, createdAt: "2020-01-01" });
    expect(bestRuleFor(PAYCHECK, [split, specific], JADYN).match).toBe(specific);
  });

  it("ignores another user's personal rules", () => {
    expect(bestRuleFor(PAYCHECK, rules, MITCHELL).match).toBeNull();
  });

  it("flags a same-type tie and keeps the first-created", () => {
    const twin = rule({ pattern: "fix   healthcare pay", createdAt: "2027-01-01" });
    expect(bestRuleFor(PAYCHECK, [twin, specific], JADYN)).toEqual({ match: specific, hasConflict: true });
  });
});

describe("planRuleSave", () => {
  const item = { description: PAYCHECK, userId: JADYN };

  it("updates the matched rule when saved with its pattern", () => {
    const plan = planRuleSave(
      rules,
      { pattern: "FIX HEALTHCARE PAY", ruleType: "personal", userId: JADYN, action: "reject", categoryId: 23 },
      item
    );
    expect(plan.existing).toBe(specific);
    expect(plan.changes).toEqual({ action: { from: "accept", to: "reject" } });
    expect(plan.beatenBy).toBeNull();
  });

  it("warns that a shorter pattern is still outranked on this item", () => {
    const plan = planRuleSave(
      rules,
      { pattern: "FIX HEALTHCARE", ruleType: "personal", userId: JADYN, action: "reject", categoryId: 23 },
      item
    );
    expect(plan.existing).toBe(broad);
    expect(plan.changes).toEqual({ categoryId: { from: null, to: 23 } });
    expect(plan.beatenBy).toBe(specific);
  });

  it("creates a rule and loses an equal-length same-type tie to the older one", () => {
    const split = rule({ pattern: "FIX HEALTHCARE PAY", ruleType: "split", userId: null });
    const plan = planRuleSave(
      [split],
      { pattern: "fix healthcare pay", ruleType: "split", userId: JADYN, action: "reject", categoryId: null },
      item
    );
    expect(plan.existing).toBe(split);

    const fresh = planRuleSave(
      [split],
      { pattern: "HEALTHCARE PAY X", ruleType: "split", userId: JADYN, action: "reject", categoryId: null },
      item
    );
    expect(fresh.existing).toBeNull();
    expect(fresh.matchesItem).toBe(false);
  });

  it("leaves an existing category alone when none is sent", () => {
    const plan = planRuleSave(
      rules,
      { pattern: "FIX HEALTHCARE PAY", ruleType: "personal", userId: JADYN, action: "accept", categoryId: null },
      item
    );
    expect(plan.changes).toEqual({});
  });
});

describe("computeRuleCoverage", () => {
  it("counts wins and who beats a rule that never applies", () => {
    const coverage = computeRuleCoverage(rules, [
      { description: PAYCHECK, userId: JADYN },
      { description: PAYCHECK, userId: JADYN },
      { description: "FIX HEALTHCARE LIMITED", userId: JADYN },
      { description: PAYCHECK, userId: MITCHELL },
    ]);
    expect(coverage).toEqual([
      {
        ruleId: broad.id,
        matches: 3,
        wins: 1,
        beatenBy: [{ ruleId: specific.id, count: 2 }],
        conflicts: [],
        affectedIfDeleted: 1,
      },
      {
        ruleId: specific.id,
        matches: 2,
        wins: 2,
        beatenBy: [],
        conflicts: [],
        affectedIfDeleted: 2,
      },
    ]);
  });

  it("flags a same-type tie at the top as a conflict on both rules", () => {
    const older = rule({ pattern: "FIX HEALTHCARE PAY", action: "accept", createdAt: "2026-01-01" });
    const twin = rule({ pattern: "fix   healthcare pay", action: "reject", createdAt: "2026-02-01" });
    const coverage = computeRuleCoverage([older, twin], [
      { description: PAYCHECK, userId: JADYN },
      { description: PAYCHECK, userId: JADYN },
    ]);
    const byId = new Map(coverage.map((c) => [c.ruleId, c]));
    expect(byId.get(older.id)!.conflicts).toEqual([{ ruleId: twin.id, count: 2 }]);
    expect(byId.get(twin.id)!.conflicts).toEqual([{ ruleId: older.id, count: 2 }]);
    expect(byId.get(twin.id)!.wins).toBe(0);
  });

  it("ignores ties below a longer winner, and personal-vs-split ties", () => {
    const a = rule({ pattern: "FIX", createdAt: "2026-01-01" });
    const b = rule({ pattern: "fix", createdAt: "2026-02-01" });
    const longer = rule({ pattern: "FIX HEALTHCARE" });
    const split = rule({ pattern: "FIX HEALTHCARE", ruleType: "split", userId: null });
    const coverage = computeRuleCoverage([a, b, longer, split], [
      { description: PAYCHECK, userId: JADYN },
    ]);
    expect(coverage.every((c) => c.conflicts.length === 0)).toBe(true);
  });

  it("counts only items whose outcome changes when the rule is deleted", () => {
    // Same outcome as the broad rule it shadows: deleting it changes nothing.
    const broadAccept = rule({ pattern: "THRIFTY", action: "accept", categoryId: 4 });
    const sameOutcome = rule({ pattern: "THRIFTY FOODS", action: "accept", categoryId: 4 });
    // Different category: deleting it moves its items to the broad rule.
    const otherCategory = rule({ pattern: "THRIFTY FOODS #9461", action: "accept", categoryId: 5 });
    const coverage = computeRuleCoverage([broadAccept, sameOutcome, otherCategory], [
      { description: "THRIFTY FOODS #1000", userId: JADYN },
      { description: "THRIFTY FOODS #9461 VIC", userId: JADYN },
      { description: "THRIFTY FOODS #9461 VIC", userId: JADYN },
      { description: "THRIFTY WAREHOUSE", userId: JADYN },
    ]);
    const byId = new Map(coverage.map((c) => [c.ruleId, c]));
    expect(byId.get(sameOutcome.id)!.affectedIfDeleted).toBe(0);
    expect(byId.get(otherCategory.id)!.affectedIfDeleted).toBe(2);
    // The last-resort rule leaves its items with no rule at all.
    expect(byId.get(broadAccept.id)!.affectedIfDeleted).toBe(1);
  });

  it("has nothing to change when a rule is overshadowed or matches nothing", () => {
    const unused = rule({ pattern: "NEVER SEEN" });
    const coverage = computeRuleCoverage([broad, specific, unused], [
      { description: PAYCHECK, userId: JADYN },
    ]);
    const byId = new Map(coverage.map((c) => [c.ruleId, c]));
    expect(byId.get(broad.id)!).toMatchObject({ matches: 1, wins: 0, affectedIfDeleted: 0 });
    expect(byId.get(unused.id)!).toMatchObject({ matches: 0, wins: 0, affectedIfDeleted: 0 });
  });
});

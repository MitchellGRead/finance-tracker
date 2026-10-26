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
      { ruleId: broad.id, matches: 3, wins: 1, beatenBy: [{ ruleId: specific.id, count: 2 }] },
      { ruleId: specific.id, matches: 2, wins: 2, beatenBy: [] },
    ]);
  });
});

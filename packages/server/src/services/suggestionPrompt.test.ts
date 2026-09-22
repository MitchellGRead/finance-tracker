import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  NO_CATEGORY_KEY,
  buildCategoryExemplars,
  buildSuggestionQuestions,
  buildSuggestionState,
  categoryKey,
  interpretAnswers,
  normalizeDescription,
  parseCategoryKey,
  redactDescription,
  suggestionEligibility,
  type CategoryOption,
  type ExemplarRow,
  type SuggestionItem,
} from "./suggestionPrompt";

const cat = (id: number, name: string, defaultSplitRatio: number | null = null): CategoryOption => ({
  id,
  name,
  defaultSplitRatio,
});

const row = (o: Partial<ExemplarRow> & Pick<ExemplarRow, "id" | "description">): ExemplarRow => ({
  id: o.id,
  categoryId: "categoryId" in o ? o.categoryId! : 10,
  description: o.description,
  status: o.status ?? "accepted",
  date: o.date ?? "2026-04-15",
});

const item = (o: Partial<SuggestionItem> = {}): SuggestionItem => ({
  id: o.id ?? 1,
  description: o.description ?? "THRIFTY FOODS #9461 VIC",
  amount: o.amount ?? 82.13,
  date: o.date ?? "2026-04-15",
  isCredit: o.isCredit ?? false,
  userId: o.userId ?? 1,
  status: o.status ?? "pending",
  categoryId: o.categoryId ?? null,
  splitRatio: o.splitRatio ?? 0.5,
  categoryOverride: o.categoryOverride ?? false,
  splitRatioOverride: o.splitRatioOverride ?? false,
  suggestionStatus: o.suggestionStatus ?? null,
  sourceType: o.sourceType ?? "amex",
});

const QUESTION_OPTS = {
  cardholderName: "Alice",
  householdMembers: ["Alice", "Bob"],
  maxExemplarsPerCategory: 5,
  maxCriteriaChars: 20_000,
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("criteria key safety", () => {
  it("produces distinct, JSON-safe keys for adversarial category names", () => {
    const categories = [
      cat(1, "Food & Drink"),
      cat(2, "food and drink"),
      cat(3, ""),
      cat(4, "🍕"),
      cat(5, 'He said "hi"'),
      cat(6, "Food & Drink"),
    ];

    const { questions } = buildSuggestionQuestions({
      ...QUESTION_OPTS,
      categories,
      exemplars: new Map(),
    });

    const criteria = (questions.category as unknown as { criteria: Record<string, unknown> })
      .criteria;
    const keys = Object.keys(criteria);

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^cat_\d+$|^none$/);
    }
    expect(keys).toContain(NO_CATEGORY_KEY);

    // Survives a JSON round trip with every name intact.
    const roundTripped = JSON.parse(JSON.stringify(criteria)) as Record<string, { what: string }>;
    expect(roundTripped[categoryKey(4)].what).toBe("🍕");
    expect(roundTripped[categoryKey(5)].what).toBe('He said "hi"');
  });

  it("never lets a category collide with the no-match escape", () => {
    const { questions } = buildSuggestionQuestions({
      ...QUESTION_OPTS,
      categories: [cat(1, "none"), cat(2, "None")],
      exemplars: new Map(),
    });
    const criteria = (questions.category as unknown as {
      criteria: Record<string, { what: string }>;
    }).criteria;
    expect(criteria[NO_CATEGORY_KEY].what).toMatch(/No existing category fits/);
    expect(Object.keys(criteria)).toHaveLength(3);
  });
});

describe("parseCategoryKey", () => {
  it("round-trips real ids and rejects everything else", () => {
    expect(parseCategoryKey(categoryKey(12))).toBe(12);
    expect(parseCategoryKey(NO_CATEGORY_KEY)).toBeNull();
    expect(parseCategoryKey("cat_")).toBeNull();
    expect(parseCategoryKey("cat_abc")).toBeNull();
    expect(parseCategoryKey("garbage")).toBeNull();
    expect(parseCategoryKey("cat_999")).toBe(999); // parses; resolved to null later
  });
});

describe("buildSuggestionQuestions", () => {
  it("omits the category question when there are no categories", () => {
    const { questions, categoryOptionCount } = buildSuggestionQuestions({
      ...QUESTION_OPTS,
      categories: [],
      exemplars: new Map(),
    });
    expect(questions.category).toBeUndefined();
    expect(questions.personalOrShared).toBeDefined();
    expect(categoryOptionCount).toBe(0);
  });

  it("names the other household member in the split question", () => {
    const { questions } = buildSuggestionQuestions({
      ...QUESTION_OPTS,
      categories: [],
      exemplars: new Map(),
    });
    const instructions = (questions.personalOrShared as unknown as { instructions: string })
      .instructions;
    expect(instructions).toContain("Alice");
    expect(instructions).toContain("Bob");
  });

  it("degrades exemplars 5 -> 3 -> 1 -> 0 to stay under the criteria budget", () => {
    const categories = Array.from({ length: 200 }, (_, i) =>
      cat(i + 1, `A fairly long category name number ${i + 1}`)
    );
    const exemplars = new Map(
      categories.map((c) => [
        c.id,
        Array.from({ length: 5 }, (_, j) => `A LONG EXEMPLAR MERCHANT DESCRIPTION ${c.id}-${j}`),
      ])
    );

    const budget = 20_000;
    const { questions, exemplarsUsed } = buildSuggestionQuestions({
      ...QUESTION_OPTS,
      categories,
      exemplars,
      maxCriteriaChars: budget,
    });

    expect([0, 1, 3]).toContain(exemplarsUsed);
    const criteria = (questions.category as unknown as { criteria: unknown }).criteria;
    expect(JSON.stringify(criteria).length).toBeLessThanOrEqual(budget);
  });

  it("keeps all five exemplars when the budget is comfortable", () => {
    const categories = [cat(10, "Groceries")];
    const exemplars = new Map([[10, ["THRIFTY FOODS", "SAVE ON FOODS", "COSTCO"]]]);
    const { exemplarsUsed, questions } = buildSuggestionQuestions({
      ...QUESTION_OPTS,
      categories,
      exemplars,
    });
    expect(exemplarsUsed).toBe(5);
    const criteria = (questions.category as unknown as {
      criteria: Record<string, { examples?: string[] }>;
    }).criteria;
    expect(criteria[categoryKey(10)].examples).toEqual([
      "THRIFTY FOODS",
      "SAVE ON FOODS",
      "COSTCO",
    ]);
  });
});

describe("buildCategoryExemplars", () => {
  it("collapses repeated merchants into a single exemplar", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row({ id: i + 1, description: `THRIFTY FOODS #${9000 + i} VIC` })
    );
    const exemplars = buildCategoryExemplars(rows, { maxPerCategory: 5 });
    expect(exemplars.get(10)).toEqual(["THRIFTY FOODS VIC"]);
  });

  it("orders by distinct-form frequency, breaking ties by recency", () => {
    const rows = [
      row({ id: 1, description: "RARE SHOP", date: "2026-04-20" }),
      row({ id: 2, description: "COMMON SHOP" }),
      row({ id: 3, description: "COMMON SHOP" }),
      row({ id: 4, description: "COMMON SHOP" }),
      row({ id: 5, description: "OTHER RARE SHOP", date: "2026-01-02" }),
    ];
    expect(buildCategoryExemplars(rows, { maxPerCategory: 5 }).get(10)).toEqual([
      "COMMON SHOP",
      "RARE SHOP",
      "OTHER RARE SHOP",
    ]);
  });

  it("caps at maxPerCategory", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ id: i + 1, description: `MERCHANT ${String.fromCharCode(65 + i)}` })
    );
    expect(buildCategoryExemplars(rows, { maxPerCategory: 3 }).get(10)).toHaveLength(3);
  });

  it("excludes uncategorized rows, rejected rows, and the item being classified", () => {
    const rows = [
      row({ id: 1, description: "KEEP ME" }),
      row({ id: 2, description: "UNCATEGORIZED", categoryId: null }),
      row({ id: 3, description: "REJECTED SHOP", status: "rejected" }),
      row({ id: 4, description: "SELF SHOP" }),
    ];
    const exemplars = buildCategoryExemplars(rows, { maxPerCategory: 5, excludeLineItemId: 4 });
    expect(exemplars.get(10)).toEqual(["KEEP ME"]);
  });

  it("keeps pending rows — they are categorized even if not yet accepted", () => {
    const rows = [row({ id: 1, description: "PENDING SHOP", status: "pending" })];
    expect(buildCategoryExemplars(rows, { maxPerCategory: 5 }).get(10)).toEqual(["PENDING SHOP"]);
  });
});

describe("normalizeDescription / redactDescription", () => {
  it("strips store numbers and punctuation noise", () => {
    expect(normalizeDescription("Thrifty Foods #9461 VIC")).toBe("THRIFTY FOODS VIC");
    expect(normalizeDescription("  UBER   *EATS  ")).toBe("UBER EATS");
    expect(normalizeDescription("")).toBe("");
  });

  it("masks long digit runs but leaves store numbers and amounts alone", () => {
    expect(redactDescription("PAYMENT CARD 4512334455667788")).toBe("PAYMENT CARD ######");
    expect(redactDescription("THRIFTY FOODS #9461 VIC")).toBe("THRIFTY FOODS #9461 VIC");
    expect(redactDescription("COFFEE 4.75")).toBe("COFFEE 4.75");
  });
});

describe("buildSuggestionState", () => {
  it("redacts the description and reports an absolute amount", () => {
    const state = buildSuggestionState({
      item: item({ description: "TRANSFER 4512334455667788", amount: 120.5 }),
      cardholderName: "Alice",
      householdMembers: ["Alice", "Bob"],
    }) as { transaction: Record<string, unknown>; household: Record<string, unknown> };

    expect(state.transaction.description).toBe("TRANSFER ######");
    expect(state.transaction.amount).toBe(120.5);
    expect(state.transaction.cardholder).toBe("Alice");
    expect(state.household.members).toEqual(["Alice", "Bob"]);
  });
});

describe("suggestionEligibility", () => {
  const force = { force: false };

  it("allows both facets on a fresh pending, uncategorized, default-split item", () => {
    expect(suggestionEligibility(item(), force)).toEqual({
      category: true,
      split: true,
      any: true,
    });
  });

  it("skips the category when a rule already set one without an override flag", () => {
    const e = suggestionEligibility(item({ categoryId: 10, categoryOverride: false }), force);
    expect(e).toEqual({ category: false, split: true, any: true });
  });

  it("skips the split when a rule already set personal without an override flag", () => {
    const e = suggestionEligibility(item({ splitRatio: 1.0, splitRatioOverride: false }), force);
    expect(e).toEqual({ category: true, split: false, any: true });
  });

  it("skips a facet the operator has overridden", () => {
    expect(suggestionEligibility(item({ categoryOverride: true }), force).category).toBe(false);
    expect(suggestionEligibility(item({ splitRatioOverride: true }), force).split).toBe(false);
  });

  it("skips items that are no longer pending", () => {
    expect(suggestionEligibility(item({ status: "accepted" }), force).any).toBe(false);
    expect(suggestionEligibility(item({ status: "rejected" }), force).any).toBe(false);
  });

  it("skips items that already have a suggestion unless forced", () => {
    expect(suggestionEligibility(item({ suggestionStatus: "shadow" }), force).any).toBe(false);
    expect(suggestionEligibility(item({ suggestionStatus: "confirmed" }), force).any).toBe(false);
    expect(suggestionEligibility(item({ suggestionStatus: "shadow" }), { force: true }).any).toBe(
      true
    );
  });

  it("still refuses a forced regeneration on a non-pending item", () => {
    expect(
      suggestionEligibility(item({ status: "accepted", suggestionStatus: "shadow" }), {
        force: true,
      }).any
    ).toBe(false);
  });

  it("tolerates float drift around the default split ratio", () => {
    expect(suggestionEligibility(item({ splitRatio: 0.5000001 }), force).split).toBe(true);
    expect(suggestionEligibility(item({ splitRatio: 0.6 }), force).split).toBe(false);
  });
});

describe("interpretAnswers", () => {
  const categories = [cat(10, "Groceries"), cat(20, "Dining", 0.6)];
  const both = { category: true, split: true, any: true };
  const base = {
    categories,
    eligibility: both,
    categoryConfidenceThreshold: 0.5,
    splitConfidenceThreshold: 0.6,
  };

  it("maps a category key back to its id", () => {
    const r = interpretAnswers({ category: { choice: categoryKey(10), confidence: 0.82 } }, base);
    expect(r.suggestedCategoryId).toBe(10);
    expect(r.suggestedCategoryConfidence).toBe(0.82);
  });

  it("treats `none` as no category", () => {
    const r = interpretAnswers({ category: { choice: NO_CATEGORY_KEY, confidence: 0.95 } }, base);
    expect(r.suggestedCategoryId).toBeNull();
    expect(r.suggestedCategoryConfidence).toBeNull();
  });

  it("treats a deleted or unknown category key as no category, and warns", () => {
    const r = interpretAnswers({ category: { choice: "cat_999", confidence: 0.99 } }, base);
    expect(r.suggestedCategoryId).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("composes personal as a 100% ratio", () => {
    const r = interpretAnswers({ personalOrShared: { choice: "personal", confidence: 0.91 } }, base);
    expect(r.suggestedSplitRatio).toBe(1.0);
    expect(r.suggestedSplitConfidence).toBe(0.91);
  });

  it("composes shared from the suggested category's default ratio", () => {
    const r = interpretAnswers(
      {
        category: { choice: categoryKey(20), confidence: 0.8 },
        personalOrShared: { choice: "shared", confidence: 0.77 },
      },
      base
    );
    expect(r.suggestedSplitRatio).toBe(0.6);
  });

  it("falls back to the global default when the category has no default ratio", () => {
    const r = interpretAnswers(
      {
        category: { choice: categoryKey(10), confidence: 0.8 },
        personalOrShared: { choice: "shared", confidence: 0.77 },
      },
      base
    );
    expect(r.suggestedSplitRatio).toBe(0.5);
  });

  it("falls back to the global default when no category matched", () => {
    const r = interpretAnswers(
      {
        category: { choice: NO_CATEGORY_KEY, confidence: 0.9 },
        personalOrShared: { choice: "shared", confidence: 0.77 },
      },
      base
    );
    expect(r.suggestedSplitRatio).toBe(0.5);
  });

  it("uses the category default even when the category itself fell below threshold", () => {
    const r = interpretAnswers(
      {
        category: { choice: categoryKey(20), confidence: 0.3 },
        personalOrShared: { choice: "shared", confidence: 0.9 },
      },
      base
    );
    expect(r.suggestedCategoryId).toBeNull();
    expect(r.suggestedSplitRatio).toBe(0.6);
  });

  it("discards answers below their confidence threshold", () => {
    const low = interpretAnswers(
      {
        category: { choice: categoryKey(10), confidence: 0.49 },
        personalOrShared: { choice: "personal", confidence: 0.59 },
      },
      base
    );
    expect(low).toEqual({
      suggestedCategoryId: null,
      suggestedCategoryConfidence: null,
      suggestedSplitRatio: null,
      suggestedSplitConfidence: null,
    });

    const high = interpretAnswers(
      {
        category: { choice: categoryKey(10), confidence: 0.51 },
        personalOrShared: { choice: "personal", confidence: 0.61 },
      },
      base
    );
    expect(high.suggestedCategoryId).toBe(10);
    expect(high.suggestedSplitRatio).toBe(1.0);
  });

  it("persists only the eligible facet", () => {
    const answers = {
      category: { choice: categoryKey(10), confidence: 0.9 },
      personalOrShared: { choice: "personal" as const, confidence: 0.9 },
    };

    const categoryOnly = interpretAnswers(answers, {
      ...base,
      eligibility: { category: true, split: false, any: true },
    });
    expect(categoryOnly.suggestedCategoryId).toBe(10);
    expect(categoryOnly.suggestedSplitRatio).toBeNull();

    const splitOnly = interpretAnswers(answers, {
      ...base,
      eligibility: { category: false, split: true, any: true },
    });
    expect(splitOnly.suggestedCategoryId).toBeNull();
    expect(splitOnly.suggestedSplitRatio).toBe(1.0);
  });
});

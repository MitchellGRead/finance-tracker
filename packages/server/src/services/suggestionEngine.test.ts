import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The db singleton opens the real finance-tracker.db at import time, so it has
 * to be mocked before importing anything that transitively imports it.
 * typesafeClient is our only SDK touchpoint, so mocking it covers the network.
 */

interface UpdateCall {
  table: unknown;
  values: Record<string, unknown>;
}

const state = {
  lineItemRows: [] as Record<string, unknown>[],
  categoryRows: [] as Record<string, unknown>[],
  userRows: [] as Record<string, unknown>[],
  updates: [] as UpdateCall[],
};

vi.mock("../db", async () => {
  const schema = await import("../db/schema");

  const rowsFor = (table: unknown): Record<string, unknown>[] => {
    if (table === schema.categories) return state.categoryRows;
    if (table === schema.users) return state.userRows;
    return state.lineItemRows;
  };

  const selectChain = (table: unknown) => {
    const chain = {
      from: (t: unknown) => selectChain(t),
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      all: () => rowsFor(table),
      get: () => rowsFor(table)[0] ?? null,
    };
    return chain;
  };

  return {
    db: {
      select: () => selectChain(undefined),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => ({
            run: () => {
              state.updates.push({ table, values });
              return { changes: rowsFor(table).length };
            },
          }),
        }),
      }),
    },
  };
});

const askSystemOne = vi.fn();
const enabled = { value: true };

vi.mock("./typesafeClient", () => ({
  askSystemOne: (...args: unknown[]) => askSystemOne(...args),
  isSuggestionsEnabled: () => enabled.value,
  isFatalTypeSafeError: () => false,
  isRequestShapeError: () => false,
  describeTypeSafeError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const {
  generateSuggestionsForLineItems,
  confirmSuggestions,
  clearSuggestions,
} = await import("./suggestionEngine");
const { lineItems } = await import("../db/schema");

const pendingItem = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  description: `MERCHANT ${id}`,
  amount: 42,
  date: "2026-04-15",
  isCredit: false,
  userId: 1,
  status: "pending",
  categoryId: null,
  splitRatio: 0.5,
  categoryOverride: false,
  splitRatioOverride: false,
  suggestionStatus: null,
  suggestedCategoryId: null,
  suggestedSplitRatio: null,
  sourceType: "amex",
  ...overrides,
});

const answer = (categoryKey: string, split: "personal" | "shared") => ({
  model: "jev-1.13.0",
  usage: { input_tokens: 100, output_tokens: 0 },
  answers: {
    category: { choice: categoryKey, confidence: 0.9 },
    personalOrShared: { choice: split, confidence: 0.9 },
  },
});

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.lineItemRows = [];
  state.categoryRows = [{ id: 10, name: "Groceries", defaultSplitRatio: null }];
  state.userRows = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ];
  state.updates = [];
  askSystemOne.mockReset();
  enabled.value = true;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("generateSuggestionsForLineItems", () => {
  it("asks one request per eligible item, with both questions", async () => {
    state.lineItemRows = [pendingItem(1), pendingItem(2), pendingItem(3)];
    askSystemOne.mockResolvedValue(answer("cat_10", "shared"));

    const result = await generateSuggestionsForLineItems([1, 2, 3]);

    expect(askSystemOne).toHaveBeenCalledTimes(3);
    for (const call of askSystemOne.mock.calls) {
      const request = call[0] as { questions: Record<string, unknown>; state: unknown };
      expect(Object.keys(request.questions).sort()).toEqual(["category", "personalOrShared"]);
      expect(request.state).toBeTypeOf("object");
    }
    expect(result).toMatchObject({ generated: 3, failed: 0, skipped: 0, disabled: false });
  });

  it("writes the suggestion as a shadow value with the model that answered", async () => {
    state.lineItemRows = [pendingItem(1)];
    askSystemOne.mockResolvedValue(answer("cat_10", "personal"));

    await generateSuggestionsForLineItems([1]);

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].table).toBe(lineItems);
    expect(state.updates[0].values).toMatchObject({
      suggestedCategoryId: 10,
      suggestedCategoryConfidence: 0.9,
      suggestedSplitRatio: 1.0,
      suggestionStatus: "shadow",
      suggestionModel: "jev-1.13.0",
    });
    expect(state.updates[0].values.suggestedAt).toBeTypeOf("string");
  });

  it("isolates a failure so the other items still persist", async () => {
    state.lineItemRows = [pendingItem(1), pendingItem(2), pendingItem(3)];
    let calls = 0;
    askSystemOne.mockImplementation(async () => {
      calls++;
      if (calls === 2) throw new Error("upstream blew up");
      return answer("cat_10", "shared");
    });

    const result = await generateSuggestionsForLineItems([1, 2, 3]);

    expect(result).toMatchObject({ generated: 2, failed: 1, disabled: false, error: null });
    expect(state.updates).toHaveLength(2);
  });

  it("does nothing at all when the feature is disabled", async () => {
    enabled.value = false;
    state.lineItemRows = [pendingItem(1)];

    const result = await generateSuggestionsForLineItems([1]);

    expect(askSystemOne).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
    expect(result).toMatchObject({ disabled: true, generated: 0, skipped: 1 });
  });

  it("makes no request when every item is ineligible", async () => {
    state.lineItemRows = [
      pendingItem(1, { status: "accepted" }),
      pendingItem(2, { suggestionStatus: "shadow" }),
      pendingItem(3, { categoryId: 10, splitRatio: 1.0 }),
    ];

    const result = await generateSuggestionsForLineItems([1, 2, 3]);

    expect(askSystemOne).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
    expect(result).toMatchObject({ generated: 0, skipped: 3, failed: 0 });
  });

  it("regenerates an existing suggestion when forced", async () => {
    state.lineItemRows = [pendingItem(1, { suggestionStatus: "shadow" })];
    askSystemOne.mockResolvedValue(answer("cat_10", "shared"));

    await generateSuggestionsForLineItems([1], { force: true });

    expect(askSystemOne).toHaveBeenCalledTimes(1);
  });

  it("persists only the facet that was eligible", async () => {
    // A rule already set the split to personal (no override flag), so only the
    // category is still open.
    state.lineItemRows = [pendingItem(1, { splitRatio: 1.0 })];
    askSystemOne.mockResolvedValue(answer("cat_10", "shared"));

    await generateSuggestionsForLineItems([1]);

    const values = state.updates[0].values;
    expect(values.suggestedCategoryId).toBe(10);
    expect(values).not.toHaveProperty("suggestedSplitRatio");
  });
});

describe("confirmSuggestions", () => {
  const shadow = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    categoryId: null,
    splitRatio: 0.5,
    categoryOverride: false,
    splitRatioOverride: false,
    suggestedCategoryId: 10,
    suggestedSplitRatio: 1.0,
    suggestionStatus: "shadow",
    ...overrides,
  });

  it("materializes both facets and never touches the override flags", () => {
    state.lineItemRows = [shadow()];

    expect(confirmSuggestions([1])).toEqual({ confirmed: 1 });
    expect(state.updates[0].values).toEqual({
      suggestionStatus: "confirmed",
      categoryId: 10,
      splitRatio: 1.0,
    });
  });

  it("leaves a category the operator already chose alone", () => {
    state.lineItemRows = [shadow({ categoryId: 20, categoryOverride: true })];

    confirmSuggestions([1]);

    expect(state.updates[0].values).not.toHaveProperty("categoryId");
    expect(state.updates[0].values).toMatchObject({ suggestionStatus: "confirmed" });
  });

  it("leaves an overridden split alone", () => {
    state.lineItemRows = [shadow({ splitRatio: 0.7, splitRatioOverride: true })];

    confirmSuggestions([1]);

    expect(state.updates[0].values).not.toHaveProperty("splitRatio");
  });

  it("still confirms a shadow row where the model found no category", () => {
    state.lineItemRows = [shadow({ suggestedCategoryId: null, suggestedSplitRatio: null })];

    expect(confirmSuggestions([1])).toEqual({ confirmed: 1 });
    expect(state.updates[0].values).toEqual({ suggestionStatus: "confirmed" });
  });

  it("is a no-op on rows that are not shadows", () => {
    state.lineItemRows = [shadow({ suggestionStatus: "confirmed" })];

    expect(confirmSuggestions([1])).toEqual({ confirmed: 0 });
    expect(state.updates).toHaveLength(0);
  });

  it("does nothing for an empty id list", () => {
    expect(confirmSuggestions([])).toEqual({ confirmed: 0 });
    expect(state.updates).toHaveLength(0);
  });
});

describe("clearSuggestions", () => {
  it("nulls every suggestion column", () => {
    state.lineItemRows = [pendingItem(1)];

    clearSuggestions([1]);

    expect(state.updates[0].values).toEqual({
      suggestedCategoryId: null,
      suggestedCategoryConfidence: null,
      suggestedSplitRatio: null,
      suggestedSplitConfidence: null,
      suggestionStatus: null,
      suggestionModel: null,
      suggestedAt: null,
    });
  });

  it("does nothing for an empty id list", () => {
    expect(clearSuggestions([])).toBe(0);
    expect(state.updates).toHaveLength(0);
  });
});

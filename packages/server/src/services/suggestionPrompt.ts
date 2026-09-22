import {
  choice,
  type ChoiceCriteria,
  type JsonValue,
  type Questions,
} from "@typesafe-ai/sdk";
import {
  GLOBAL_DEFAULT_SPLIT_RATIO,
  LineItemStatus,
  PERSONAL_SPLIT_RATIO,
  isDefaultSplitRatio,
} from "@finance-tracker/shared";

/**
 * Everything about *what* we ask Jev and *how* we read the answer.
 *
 * Deliberately pure — no db, no network, no config — so the expensive-to-get-wrong
 * parts (criteria keys, exemplar selection, eligibility, thresholds) are unit
 * testable with plain row fixtures, the same way computeReport is.
 */

export const NO_CATEGORY_KEY = "none";
const CATEGORY_KEY_PREFIX = "cat_";

/** Jev's hard ceiling on Choice options, minus the `none` escape. */
const MAX_CATEGORY_OPTIONS = 254;

export interface CategoryOption {
  id: number;
  name: string;
  defaultSplitRatio: number | null;
}

export interface ExemplarRow {
  id: number;
  categoryId: number | null;
  description: string;
  status: string;
  date: string;
}

export interface SuggestionItem {
  id: number;
  description: string;
  amount: number;
  date: string;
  isCredit: boolean;
  userId: number;
  status: string;
  categoryId: number | null;
  splitRatio: number;
  categoryOverride: boolean;
  splitRatioOverride: boolean;
  suggestionStatus: string | null;
  sourceType: string | null;
}

// ---------------------------------------------------------------------------
// Criteria keys
// ---------------------------------------------------------------------------

/**
 * Category names are arbitrary operator strings — spaces, quotes, emoji, and
 * pairs that differ only by case or unicode normalization. Keying criteria by
 * name would collide or break JSON; key by primary key instead and put the
 * human meaning in the description.
 */
export function categoryKey(categoryId: number): string {
  return `${CATEGORY_KEY_PREFIX}${categoryId}`;
}

/** Inverse of `categoryKey`. Returns null for `none` and for anything unrecognized. */
export function parseCategoryKey(key: string): number | null {
  if (!key.startsWith(CATEGORY_KEY_PREFIX)) return null;
  const raw = key.slice(CATEGORY_KEY_PREFIX.length);
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

// ---------------------------------------------------------------------------
// Exemplars
// ---------------------------------------------------------------------------

/**
 * Strips the volatile parts of a statement description so repeated visits to the
 * same merchant collapse into one exemplar: "THRIFTY FOODS #9461 VIC" and
 * "THRIFTY FOODS #2201 SAANICH" both become "THRIFTY FOODS VIC" / "... SAANICH".
 */
export function normalizeDescription(description: string): string {
  return description
    .toUpperCase()
    .replace(/#?\d[\d*]*/g, " ")
    .replace(/[^A-Z&'./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
}

/**
 * Masks long digit runs before anything leaves the machine. Statement
 * descriptions can carry card or account fragments and this is a third-party API.
 * Short store numbers (#9461) are left alone — they carry no risk and sometimes
 * help the model.
 */
export function redactDescription(description: string): string {
  return description.replace(/\d{6,}/g, "######");
}

export interface ExemplarOptions {
  maxPerCategory: number;
  /** Excluded so a forced regeneration never sees its own previous answer as truth. */
  excludeLineItemId?: number;
}

/**
 * Removes the item being classified from the exemplar map, so a forced
 * regeneration never sees its own previous answer presented as ground truth.
 * Cheap enough to run per item on top of one batch-wide grouping.
 */
export function withoutSelfExemplar(
  exemplars: Map<number, string[]>,
  item: { categoryId: number | null; description: string }
): Map<number, string[]> {
  if (item.categoryId === null) return exemplars;
  const own = normalizeDescription(item.description);
  const bucket = exemplars.get(item.categoryId);
  if (own.length === 0 || bucket === undefined || !bucket.includes(own)) return exemplars;

  const copy = new Map(exemplars);
  copy.set(
    item.categoryId,
    bucket.filter((d) => d !== own)
  );
  return copy;
}

/**
 * Representative descriptions per category, ordered by how many *distinct*
 * merchants map to them, then by recency.
 *
 * Frequency rather than pure recency matters: raw descriptions repeat heavily,
 * so "5 most recent" yields five copies of one merchant and teaches the model
 * nothing about the category's breadth.
 */
export function buildCategoryExemplars(
  rows: readonly ExemplarRow[],
  opts: ExemplarOptions
): Map<number, string[]> {
  const perCategory = new Map<number, Map<string, { count: number; latest: string }>>();

  for (const row of rows) {
    if (row.categoryId === null) continue;
    if (row.status === LineItemStatus.REJECTED) continue;
    if (opts.excludeLineItemId !== undefined && row.id === opts.excludeLineItemId) continue;

    const normalized = normalizeDescription(row.description);
    if (normalized.length === 0) continue;

    let bucket = perCategory.get(row.categoryId);
    if (bucket === undefined) {
      bucket = new Map();
      perCategory.set(row.categoryId, bucket);
    }
    const seen = bucket.get(normalized);
    if (seen === undefined) {
      bucket.set(normalized, { count: 1, latest: row.date });
    } else {
      seen.count++;
      if (row.date > seen.latest) seen.latest = row.date;
    }
  }

  const result = new Map<number, string[]>();
  for (const [categoryId, bucket] of perCategory) {
    const ranked = [...bucket.entries()]
      .sort((a, b) => b[1].count - a[1].count || (a[1].latest < b[1].latest ? 1 : -1))
      .slice(0, opts.maxPerCategory)
      .map(([description]) => description);
    if (ranked.length > 0) result.set(categoryId, ranked);
  }
  return result;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SuggestionStateInput {
  item: SuggestionItem;
  cardholderName: string;
  householdMembers: readonly string[];
}

export function buildSuggestionState(input: SuggestionStateInput): { [key: string]: JsonValue } {
  const { item } = input;
  return {
    transaction: {
      description: redactDescription(item.description),
      amount: Math.abs(item.amount),
      currency: "CAD",
      date: item.date,
      is_credit: item.isCredit,
      cardholder: input.cardholderName,
      source: item.sourceType ?? "manual",
    },
    household: {
      members: [...input.householdMembers],
      default_arrangement:
        "Shared expenses are split 50/50 by default. A personal expense is paid 100% by the cardholder.",
    },
  };
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const CATEGORY_INSTRUCTIONS =
  "Which existing spending category does this transaction belong to? Judge from the " +
  "merchant description and the amount. Choose `none` if no listed category is a good " +
  "fit — do not force a weak match.";

function personalOrSharedInstructions(cardholderName: string, members: readonly string[]): string {
  const others = members.filter((m) => m !== cardholderName);
  const withWhom = others.length > 0 ? others.join(" and ") : "the rest of the household";
  return (
    `Is this a personal expense for ${cardholderName} alone, or a shared household expense ` +
    `that ${cardholderName} and ${withWhom} both benefit from? Judge from the merchant, ` +
    `what is typically bought there, and the amount.`
  );
}

const PERSONAL_CRITERIA: ChoiceCriteria = {
  personal: {
    what: "Benefits only the cardholder — individual hobbies, personal clothing and grooming, their own subscriptions, or a gift for another household member.",
    examples: ["golf green fees", "a haircut", "a personal Spotify subscription", "a birthday gift"],
  },
  shared: {
    what: "Benefits the household — groceries, utilities, household goods, shared meals, joint travel, or anything both members use.",
    examples: ["a grocery run", "a hydro bill", "dinner for two", "paper towels"],
  },
};

export interface BuildQuestionsOptions {
  categories: readonly CategoryOption[];
  exemplars: Map<number, string[]>;
  cardholderName: string;
  householdMembers: readonly string[];
  maxExemplarsPerCategory: number;
  maxCriteriaChars: number;
}

export interface BuiltQuestions {
  questions: Questions;
  /** Exemplars per category actually used, after any budget degradation. */
  exemplarsUsed: number;
  categoryOptionCount: number;
}

function categoryCriteria(
  categories: readonly CategoryOption[],
  exemplars: Map<number, string[]>,
  exemplarsPerCategory: number
): ChoiceCriteria {
  const criteria: ChoiceCriteria = {};
  for (const category of categories) {
    const examples = exemplars.get(category.id)?.slice(0, exemplarsPerCategory) ?? [];
    criteria[categoryKey(category.id)] =
      examples.length > 0 ? { what: category.name, examples } : { what: category.name };
  }
  criteria[NO_CATEGORY_KEY] = {
    what: "No existing category fits this transaction.",
    not_for:
      "Use this only when no listed category is plausible, not merely when unsure between two of them.",
  };
  return criteria;
}

/**
 * Builds the two questions. Both are asked in one request, so they run in
 * parallel over the same state and cannot see each other's answers — the
 * dependency between category and split ratio is resolved in code afterwards
 * (see `interpretAnswers`).
 */
export function buildSuggestionQuestions(opts: BuildQuestionsOptions): BuiltQuestions {
  const questions: Questions = {
    personalOrShared: choice(
      personalOrSharedInstructions(opts.cardholderName, opts.householdMembers),
      PERSONAL_CRITERIA
    ),
  };

  // A one-option Choice is not a question. With no categories, only ask about the split.
  if (opts.categories.length === 0) {
    return { questions, exemplarsUsed: 0, categoryOptionCount: 0 };
  }

  let categories = opts.categories;
  if (categories.length > MAX_CATEGORY_OPTIONS) {
    console.warn(
      `[suggestions] ${categories.length} categories exceeds the ${MAX_CATEGORY_OPTIONS} option ` +
        `limit; keeping the first ${MAX_CATEGORY_OPTIONS} supplied.`
    );
    categories = categories.slice(0, MAX_CATEGORY_OPTIONS);
  }

  // Exemplars dominate the token cost, so degrade them rather than risk the
  // state+question ceiling: 5 (or whatever is configured) -> 3 -> 1 -> 0.
  const ladder = [opts.maxExemplarsPerCategory, 3, 1, 0].filter(
    (n, i, all) => n <= opts.maxExemplarsPerCategory && all.indexOf(n) === i
  );

  let used = ladder[0];
  let criteria = categoryCriteria(categories, opts.exemplars, used);
  for (const next of ladder.slice(1)) {
    if (JSON.stringify(criteria).length <= opts.maxCriteriaChars) break;
    used = next;
    criteria = categoryCriteria(categories, opts.exemplars, used);
  }
  if (JSON.stringify(criteria).length > opts.maxCriteriaChars) {
    console.warn(
      `[suggestions] category criteria still exceed ${opts.maxCriteriaChars} chars with no exemplars.`
    );
  }

  questions.category = choice(CATEGORY_INSTRUCTIONS, criteria);
  return { questions, exemplarsUsed: used, categoryOptionCount: categories.length };
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface Eligibility {
  category: boolean;
  split: boolean;
  any: boolean;
}

/**
 * Which facets of a line item are still open for a suggestion.
 *
 * Rules always win: a rule-set category writes `categoryId` and a rule-set split
 * writes `splitRatio`, in both cases *without* setting the override flag
 * (ruleEngine.ts), so the value itself — not the flag — is what tells us a
 * decision has already been made.
 */
export function suggestionEligibility(
  item: Pick<
    SuggestionItem,
    | "status"
    | "categoryId"
    | "splitRatio"
    | "categoryOverride"
    | "splitRatioOverride"
    | "suggestionStatus"
  >,
  opts: { force: boolean }
): Eligibility {
  const none: Eligibility = { category: false, split: false, any: false };

  // A rule already accepted or rejected this; the decision is made.
  if (item.status !== LineItemStatus.PENDING) return none;
  // Already suggested — don't burn tokens or churn the ghost.
  if (!opts.force && item.suggestionStatus !== null) return none;

  const category = item.categoryId === null && !item.categoryOverride;
  const split = !item.splitRatioOverride && isDefaultSplitRatio(item.splitRatio);

  return { category, split, any: category || split };
}

// ---------------------------------------------------------------------------
// Interpretation
// ---------------------------------------------------------------------------

export interface RawChoiceAnswer {
  choice: string;
  confidence: number;
}

export interface RawAnswers {
  category?: RawChoiceAnswer;
  personalOrShared?: RawChoiceAnswer;
}

export interface InterpretedSuggestion {
  suggestedCategoryId: number | null;
  suggestedCategoryConfidence: number | null;
  suggestedSplitRatio: number | null;
  suggestedSplitConfidence: number | null;
}

export interface InterpretOptions {
  categories: readonly CategoryOption[];
  eligibility: Eligibility;
  categoryConfidenceThreshold: number;
  splitConfidenceThreshold: number;
}

/**
 * Turns raw answers into the columns we store.
 *
 * Two things happen here rather than anywhere else:
 *
 * 1. Confidence thresholds are applied at write time, so anything stored is
 *    displayable and confirmable and neither the client nor the confirmation
 *    path needs its own threshold logic.
 * 2. The split *ratio* is composed in code: the model only picks personal vs
 *    shared, and the number comes from the suggested category's default. The
 *    two questions cannot see each other, so this join has to happen after.
 */
export function interpretAnswers(
  answers: RawAnswers,
  opts: InterpretOptions
): InterpretedSuggestion {
  const result: InterpretedSuggestion = {
    suggestedCategoryId: null,
    suggestedCategoryConfidence: null,
    suggestedSplitRatio: null,
    suggestedSplitConfidence: null,
  };

  let matchedCategory: CategoryOption | undefined;

  const categoryAnswer = answers.category;
  if (categoryAnswer !== undefined) {
    const categoryId = parseCategoryKey(categoryAnswer.choice);
    if (categoryId !== null) {
      matchedCategory = opts.categories.find((c) => c.id === categoryId);
      if (matchedCategory === undefined) {
        console.warn(
          `[suggestions] model returned unknown category key "${categoryAnswer.choice}"; treating as no match.`
        );
      } else if (
        opts.eligibility.category &&
        categoryAnswer.confidence >= opts.categoryConfidenceThreshold
      ) {
        result.suggestedCategoryId = matchedCategory.id;
        result.suggestedCategoryConfidence = categoryAnswer.confidence;
      }
    }
  }

  const splitAnswer = answers.personalOrShared;
  if (
    splitAnswer !== undefined &&
    opts.eligibility.split &&
    splitAnswer.confidence >= opts.splitConfidenceThreshold
  ) {
    result.suggestedSplitRatio =
      splitAnswer.choice === "personal"
        ? PERSONAL_SPLIT_RATIO
        : matchedCategory?.defaultSplitRatio ?? GLOBAL_DEFAULT_SPLIT_RATIO;
    result.suggestedSplitConfidence = splitAnswer.confidence;
  }

  return result;
}

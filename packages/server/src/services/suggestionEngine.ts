import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { categories, lineItems, statements, users } from "../db/schema";
import { config } from "../lib/config";
import { mapWithConcurrency } from "../lib/concurrency";
import {
  SuggestionStatus,
  hasShadowCategory,
  hasShadowSplit,
} from "@finance-tracker/shared";
import {
  askSystemOne,
  describeTypeSafeError,
  isFatalTypeSafeError,
  isRequestShapeError,
  isSuggestionsEnabled,
} from "./typesafeClient";
import {
  buildCategoryExemplars,
  buildSuggestionQuestions,
  buildSuggestionState,
  interpretAnswers,
  withoutSelfExemplar,
  suggestionEligibility,
  type CategoryOption,
  type Eligibility,
  type RawAnswers,
  type SuggestionItem,
} from "./suggestionPrompt";
import { createRun, finishRun, type SuggestionRun } from "./suggestionQueue";

/**
 * Orchestration for AI suggestions: reads the database, calls TypeSafe, writes
 * shadow columns. All of the judgement lives in suggestionPrompt (pure); this
 * module is deliberately thin.
 */

export interface SuggestionRunResult {
  generated: number;
  skipped: number;
  failed: number;
  disabled: boolean;
  error: string | null;
}

/** Enough consecutive failures means something systemic — stop burning requests. */
const CONSECUTIVE_FAILURE_LIMIT = 5;

function loadItems(lineItemIds: number[]): SuggestionItem[] {
  if (lineItemIds.length === 0) return [];

  const rows = db
    .select({
      id: lineItems.id,
      description: lineItems.description,
      amount: lineItems.amount,
      date: lineItems.date,
      isCredit: lineItems.isCredit,
      userId: lineItems.userId,
      status: lineItems.status,
      categoryId: lineItems.categoryId,
      splitRatio: lineItems.splitRatio,
      categoryOverride: lineItems.categoryOverride,
      splitRatioOverride: lineItems.splitRatioOverride,
      suggestionStatus: lineItems.suggestionStatus,
      sourceType: statements.sourceType,
    })
    .from(lineItems)
    .leftJoin(statements, eq(lineItems.statementId, statements.id))
    .where(inArray(lineItems.id, lineItemIds))
    .all();

  return rows;
}

export interface GenerateOptions {
  force?: boolean;
  onProgress?: (progress: { done: number; failed: number }) => void;
}

/**
 * Generates suggestions for the given line items.
 *
 * State differs per item, so this is one request per item — the batching win is
 * taken *within* each request instead (both questions share one state).
 * Failures are isolated: a failed item simply keeps `suggestion_status = null`,
 * so an import can never fail because inference failed.
 */
export async function generateSuggestionsForLineItems(
  lineItemIds: number[],
  opts: GenerateOptions = {}
): Promise<SuggestionRunResult> {
  const force = opts.force ?? false;

  if (!isSuggestionsEnabled()) {
    return { generated: 0, skipped: lineItemIds.length, failed: 0, disabled: true, error: null };
  }

  const items = loadItems(lineItemIds);
  const eligible: Array<{ item: SuggestionItem; eligibility: Eligibility }> = [];
  for (const item of items) {
    const eligibility = suggestionEligibility(item, { force });
    if (eligibility.any) eligible.push({ item, eligibility });
  }

  const skipped = lineItemIds.length - eligible.length;
  if (eligible.length === 0) {
    return { generated: 0, skipped, failed: 0, disabled: false, error: null };
  }

  const categoryRows = db.select().from(categories).all();
  const categoryOptions: CategoryOption[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    defaultSplitRatio: c.defaultSplitRatio,
  }));

  const userRows = db.select().from(users).all();
  const userNameById = new Map(userRows.map((u) => [u.id, u.name]));
  const householdMembers = userRows.map((u) => u.name);

  // Computed once for the whole batch, not per item.
  const exemplarRows = db
    .select({
      id: lineItems.id,
      categoryId: lineItems.categoryId,
      description: lineItems.description,
      status: lineItems.status,
      date: lineItems.date,
    })
    .from(lineItems)
    .all();

  const batchExemplars = buildCategoryExemplars(exemplarRows, {
    maxPerCategory: config.typesafe.maxExemplarsPerCategory,
  });

  let generated = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let fatalError: string | null = null;

  await mapWithConcurrency(eligible, config.typesafe.concurrency, async (entry) => {
    if (fatalError !== null || consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) return;

    const { item, eligibility } = entry;
    const cardholderName = userNameById.get(item.userId) ?? "the cardholder";

    try {
      const { questions } = buildSuggestionQuestions({
        categories: categoryOptions,
        exemplars: withoutSelfExemplar(batchExemplars, item),
        cardholderName,
        householdMembers,
        maxExemplarsPerCategory: config.typesafe.maxExemplarsPerCategory,
        maxCriteriaChars: config.typesafe.maxCriteriaChars,
      });

      const state = buildSuggestionState({ item, cardholderName, householdMembers });
      const response = await askSystemOne({ state, questions });
      if (response === null) return;

      const suggestion = interpretAnswers(response.answers as RawAnswers, {
        categories: categoryOptions,
        eligibility,
        categoryConfidenceThreshold: config.typesafe.categoryConfidenceThreshold,
        splitConfidenceThreshold: config.typesafe.splitConfidenceThreshold,
      });

      db.update(lineItems)
        .set({
          ...(eligibility.category && {
            suggestedCategoryId: suggestion.suggestedCategoryId,
            suggestedCategoryConfidence: suggestion.suggestedCategoryConfidence,
          }),
          ...(eligibility.split && {
            suggestedSplitRatio: suggestion.suggestedSplitRatio,
            suggestedSplitConfidence: suggestion.suggestedSplitConfidence,
          }),
          suggestionStatus: SuggestionStatus.SHADOW,
          suggestionModel: response.model,
          suggestedAt: new Date().toISOString(),
        })
        .where(eq(lineItems.id, item.id))
        .run();

      generated++;
      consecutiveFailures = 0;
      opts.onProgress?.({ done: generated, failed });
    } catch (error) {
      failed++;
      consecutiveFailures++;
      opts.onProgress?.({ done: generated, failed });

      if (isFatalTypeSafeError(error)) {
        fatalError = describeTypeSafeError(error);
        console.error(`[suggestions] aborting run: ${fatalError}`);
        return;
      }
      if (isRequestShapeError(error)) {
        // Our request was malformed — log the shape, never the payload.
        console.error(
          `[suggestions] request rejected as invalid (${categoryOptions.length} categories, ` +
            `${householdMembers.length} household members). This is a bug in question building.`
        );
        return;
      }
      console.warn(
        `[suggestions] line item ${item.id} failed: ${describeTypeSafeError(error)}`
      );
    }
  });

  if (fatalError === null && consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
    fatalError = `Stopped after ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures`;
    console.error(`[suggestions] ${fatalError}`);
  }

  return { generated, skipped, failed, disabled: false, error: fatalError };
}

/**
 * Starts a detached background run and returns its id immediately.
 * Used by statement import: a 200-item batch takes ~25s, which is far too long
 * to hold a tRPC mutation open.
 */
export function startSuggestionRun(lineItemIds: number[], force = false): SuggestionRun {
  const run = createRun(lineItemIds.length);

  void generateSuggestionsForLineItems(lineItemIds, {
    force,
    onProgress: ({ done, failed }) => {
      run.done = done;
      run.failed = failed;
    },
  })
    .then((result) => {
      run.done = result.generated;
      run.failed = result.failed;
      run.skipped = result.skipped;
      finishRun(run.runId, result.error);
    })
    .catch((error: unknown) => {
      console.error("[suggestions] background run crashed:", error);
      finishRun(run.runId, describeTypeSafeError(error));
    });

  return run;
}

/**
 * Materializes untouched shadow suggestions into the real columns.
 *
 * Called from every accept path. Override flags are deliberately left alone:
 * they mean "a human decided this", and setting them would sweep AI rows into
 * `clearOverrides` and block rule re-application. Provenance is carried by
 * `suggestionStatus` instead.
 *
 * Idempotent — after the status flips to `confirmed` the shadow predicates are
 * false, so a second call does nothing.
 */
export function confirmSuggestions(lineItemIds: number[]): { confirmed: number } {
  if (lineItemIds.length === 0) return { confirmed: 0 };

  const rows = db.select().from(lineItems).where(inArray(lineItems.id, lineItemIds)).all();

  let confirmed = 0;
  for (const row of rows) {
    if (row.suggestionStatus !== SuggestionStatus.SHADOW) continue;

    const updates: Record<string, unknown> = {
      suggestionStatus: SuggestionStatus.CONFIRMED,
    };
    if (hasShadowCategory(row)) updates.categoryId = row.suggestedCategoryId;
    if (hasShadowSplit(row) && row.suggestedSplitRatio !== null) {
      updates.splitRatio = row.suggestedSplitRatio;
    }

    db.update(lineItems).set(updates).where(eq(lineItems.id, row.id)).run();
    confirmed++;
  }

  return { confirmed };
}

/** Nulls every suggestion column. Used by the clear-overrides paths and explicitly. */
export function clearSuggestions(lineItemIds: number[]): number {
  if (lineItemIds.length === 0) return 0;

  const result = db
    .update(lineItems)
    .set({
      suggestedCategoryId: null,
      suggestedCategoryConfidence: null,
      suggestedSplitRatio: null,
      suggestedSplitConfidence: null,
      suggestionStatus: null,
      suggestionModel: null,
      suggestedAt: null,
    })
    .where(inArray(lineItems.id, lineItemIds))
    .run();

  return result.changes;
}

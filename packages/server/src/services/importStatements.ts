import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  GLOBAL_DEFAULT_SPLIT_RATIO,
  LineItemStatus,
  type SourceType,
} from "@finance-tracker/shared";
import { db } from "../db";
import { lineItems, statements, users } from "../db/schema";
import { parseStatement, StatementParseError } from "../parsers";
import {
  guessUserId,
  planImport,
  type ExistingRow,
  type FilePlan,
  type PlanFileInput,
} from "./importPlan";
import { applyRulesToLineItems } from "./ruleEngine";
import { startSuggestionRun } from "./suggestionEngine";
import { isSuggestionsEnabled } from "./typesafeClient";
import { config } from "../lib/config";

export interface ImportFile {
  fileName: string;
  content: string;
  /** Null = use the guess from the file name / card member. */
  userId: number | null;
  /** Null = use the detected institution. */
  institution: SourceType | null;
}

/** Parse every file and plan the batch against what is already stored. */
export function planImportBatch(files: ImportFile[]): FilePlan[] {
  const allUsers = db.select({ id: users.id, name: users.name }).from(users).all();

  const inputs: PlanFileInput[] = files.map((file) => {
    try {
      const parsed = parseStatement(file.content);
      return {
        fileName: file.fileName,
        userId: file.userId ?? guessUserId(file.fileName, parsed.cardMembers, allUsers),
        institution: file.institution,
        parsed,
      };
    } catch (error) {
      if (!(error instanceof StatementParseError)) throw error;
      return {
        fileName: file.fileName,
        userId: file.userId,
        institution: file.institution,
        parsed: { error: error.message },
      };
    }
  });

  return planImport(inputs, loadExistingRows(inputs));
}

/**
 * Statement-imported rows that could collide with this batch: same users,
 * within the batch's overall date range. Padded by a few days so near-duplicate
 * checks at the range edges see their neighbours.
 */
function loadExistingRows(inputs: PlanFileInput[]): ExistingRow[] {
  const userIds = [
    ...new Set(inputs.map((i) => i.userId).filter((id): id is number => id !== null)),
  ];
  const dates = inputs.flatMap((i) =>
    "error" in i.parsed ? [] : i.parsed.items.map((item) => item.date)
  );
  if (userIds.length === 0 || dates.length === 0) return [];

  dates.sort();
  const pad = (iso: string, days: number) =>
    new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

  return db
    .select({
      userId: lineItems.userId,
      institution: statements.sourceType,
      date: lineItems.date,
      description: lineItems.description,
      amount: lineItems.amount,
      isCredit: lineItems.isCredit,
      fingerprint: lineItems.fingerprint,
    })
    .from(lineItems)
    .innerJoin(statements, eq(lineItems.statementId, statements.id))
    .where(
      and(
        inArray(lineItems.userId, userIds),
        gte(lineItems.date, pad(dates[0], -7)),
        lte(lineItems.date, pad(dates[dates.length - 1], 7))
      )
    )
    .all();
}

export class ImportRejectedError extends Error {}

/**
 * Import a batch atomically. Re-plans server-side rather than trusting a
 * preview, and refuses the whole batch if any file has an error. Files whose
 * rows are all duplicates still get a statement row, so the upload is on
 * record.
 */
export function commitImportBatch(files: ImportFile[]) {
  const plans = planImportBatch(files);
  const failed = plans.filter((p) => p.error !== null);
  if (failed.length > 0) {
    throw new ImportRejectedError(
      failed.map((p) => `${p.fileName}: ${p.error}`).join("; ")
    );
  }

  const insertedIds = db.transaction((tx) => {
    const ids: number[] = [];
    for (const plan of plans) {
      // Guarded by the error check above; narrows for the type checker.
      if (plan.userId === null || plan.institution === null || plan.dateTo === null) {
        throw new ImportRejectedError(`${plan.fileName}: incomplete plan`);
      }
      const statement = tx
        .insert(statements)
        .values({
          userId: plan.userId,
          sourceType: plan.institution,
          fileName: plan.fileName,
          periodMonth: Number(plan.dateTo.slice(5, 7)),
          periodYear: Number(plan.dateTo.slice(0, 4)),
          dateFrom: plan.dateFrom,
          dateTo: plan.dateTo,
          formatProfile: plan.profile,
          rowsParsed: plan.parsedCount,
          rowsSkippedDuplicate: plan.duplicateCount,
        })
        .returning({ id: statements.id })
        .get();

      if (plan.newItems.length === 0) continue;
      const userId = plan.userId;
      const rows = tx
        .insert(lineItems)
        .values(
          plan.newItems.map((item) => ({
            statementId: statement.id,
            userId,
            date: item.date,
            description: item.description,
            amount: item.amount,
            splitRatio: GLOBAL_DEFAULT_SPLIT_RATIO,
            status: LineItemStatus.PENDING,
            isCredit: item.isCredit,
            fingerprint: item.fingerprint,
          }))
        )
        .returning({ id: lineItems.id })
        .all();
      ids.push(...rows.map((r) => r.id));
    }
    return ids;
  });

  const ruleResult =
    insertedIds.length > 0
      ? applyRulesToLineItems(insertedIds)
      : { applied: 0, conflicts: 0 };

  // Detached: a large batch takes far too long to hold the mutation open.
  // Rules have already run, so only the gaps they left are eligible. An
  // inference failure can never fail the import.
  const suggestionRunId =
    insertedIds.length > 0 && config.typesafe.suggestOnImport && isSuggestionsEnabled()
      ? startSuggestionRun(insertedIds).runId
      : null;

  return {
    files: plans.map(summarizePlan),
    inserted: insertedIds.length,
    rulesApplied: ruleResult.applied,
    ruleConflicts: ruleResult.conflicts,
    suggestionRunId,
  };
}

/** A plan without its row payload — what the client needs to render. */
export function summarizePlan(plan: FilePlan) {
  const { newItems, ...rest } = plan;
  return { ...rest, newCount: newItems.length };
}

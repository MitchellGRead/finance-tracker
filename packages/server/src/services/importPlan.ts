/**
 * Pure planning for statement import: given parsed files and the rows already
 * in the database, decide which incoming rows are new. No DB access, so the
 * dedupe rule is unit-testable; `importStatements.ts` does the I/O.
 *
 * Dedupe rule (see .documentation/SOP/csv-formats.md § Deduplication):
 * exports carry no transaction id and consecutive exports overlap on boundary
 * days, so rows are identified by fingerprint. A fingerprint can legitimately
 * repeat (two identical fares on one day), so presence is not enough — for
 * each fingerprint, a file contributes only the copies beyond what is already
 * stored: insert max(0, k − n).
 */

import {
  computeFingerprint,
  type ParsedLineItem,
  type SourceType,
} from "@finance-tracker/shared";
import type { FormatProfileId, ProfileResult, SkippedRow } from "../parsers";

/** Statement-imported row already in the DB (manual items never count). */
export interface ExistingRow {
  userId: number;
  institution: string;
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
  /** Stored at import; null on rows imported before dedupe existed. */
  fingerprint: string | null;
}

export interface PlanFileInput {
  fileName: string;
  userId: number | null;
  institution: SourceType | null;
  parsed: ProfileResult | { error: string };
}

export interface PlannedItem extends ParsedLineItem {
  fingerprint: string;
}

export interface NearDuplicate {
  incoming: { date: string; description: string; amount: number };
  existing: { date: string; description: string };
}

export interface FilePlan {
  fileName: string;
  profile: FormatProfileId | null;
  detectedInstitution: SourceType | null;
  institution: SourceType | null;
  userId: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** `YYYY-MM` of every month this file has rows in. */
  months: string[];
  parsedCount: number;
  skipped: SkippedRow[];
  newItems: PlannedItem[];
  duplicateCount: number;
  nearDuplicates: NearDuplicate[];
  /** Set when the file cannot be imported as configured. */
  error: string | null;
}

/** Days either side within which a differing row with the same amount is flagged. */
const NEAR_DUPLICATE_DAYS = 3;

function fingerprintOf(row: ExistingRow): string {
  return row.fingerprint ?? computeFingerprint(row);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}


/**
 * Plan a batch. Files are processed in order and each sees the rows earlier
 * files will insert, so two overlapping files dropped together dedupe against
 * each other exactly as if imported one after the other.
 */
export function planImport(
  files: PlanFileInput[],
  existing: ExistingRow[]
): FilePlan[] {
  // How many copies of each fingerprint are stored (or will be, after earlier
  // files in this batch).
  const stored = new Map<string, number>();
  for (const row of existing) {
    const fp = fingerprintOf(row);
    stored.set(fp, (stored.get(fp) ?? 0) + 1);
  }
  // Rows visible to near-duplicate checks: existing plus earlier files' inserts.
  const visible: ExistingRow[] = [...existing];

  return files.map((file): FilePlan => {
    if ("error" in file.parsed) {
      return emptyPlan(file, file.parsed.error);
    }
    const parsed = file.parsed;
    const dates = parsed.items.map((i) => i.date).sort();
    const base: FilePlan = {
      ...emptyPlan(file, null),
      profile: parsed.profile,
      detectedInstitution: parsed.institution,
      institution: file.institution ?? parsed.institution,
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
      months: [...new Set(dates.map((d) => d.slice(0, 7)))],
      parsedCount: parsed.items.length,
      skipped: parsed.skipped,
    };

    if (file.institution !== null && file.institution !== parsed.institution) {
      return {
        ...base,
        error: `File looks like ${parsed.institution.toUpperCase()} (${parsed.profile}), not ${file.institution.toUpperCase()}`,
      };
    }
    if (file.userId === null) {
      return { ...base, error: "Pick whose statement this is" };
    }
    const userId = file.userId;
    const institution = parsed.institution;

    const planned: PlannedItem[] = parsed.items.map((item) => ({
      ...item,
      fingerprint: computeFingerprint({ ...item, userId, institution }),
    }));

    // Walk the file: the first n occurrences of a fingerprint are already
    // stored; the rest are new.
    const seenInFile = new Map<string, number>();
    const newItems: PlannedItem[] = [];
    for (const item of planned) {
      const k = (seenInFile.get(item.fingerprint) ?? 0) + 1;
      seenInFile.set(item.fingerprint, k);
      if (k > (stored.get(item.fingerprint) ?? 0)) newItems.push(item);
    }
    for (const [fp, k] of seenInFile) {
      stored.set(fp, Math.max(stored.get(fp) ?? 0, k));
    }

    const nearDuplicates = findNearDuplicates(newItems, visible, {
      userId,
      institution,
      dateFrom: base.dateFrom,
      dateTo: base.dateTo,
      fileFingerprints: new Set(seenInFile.keys()),
    });

    visible.push(
      ...newItems.map((item) => ({ ...item, userId, institution }))
    );

    return {
      ...base,
      userId,
      newItems,
      duplicateCount: planned.length - newItems.length,
      nearDuplicates,
    };
  });
}

/**
 * Flags new rows that might be an already-stored transaction whose date or
 * description changed between exports (pending → posted).
 *
 * The tell is a stored row dated inside this file's range that the file no
 * longer contains — an export covers everything in its range, so a missing row
 * changed. Only those are candidates; a stored row the file still contains is
 * accounted for, which keeps repeat purchases (daily coffee) from being
 * flagged. Informational — nothing is skipped on this basis.
 */
function findNearDuplicates(
  newItems: PlannedItem[],
  visible: ExistingRow[],
  scope: {
    userId: number;
    institution: string;
    dateFrom: string | null;
    dateTo: string | null;
    fileFingerprints: Set<string>;
  }
): NearDuplicate[] {
  const { dateFrom, dateTo } = scope;
  if (dateFrom === null || dateTo === null) return [];
  const candidates = visible.filter(
    (row) =>
      row.userId === scope.userId &&
      row.institution === scope.institution &&
      row.date >= dateFrom &&
      row.date <= dateTo &&
      !scope.fileFingerprints.has(fingerprintOf(row))
  );

  const result: NearDuplicate[] = [];
  for (const item of newItems) {
    const cents = Math.round(item.amount * 100);
    const match = candidates.find(
      (row) =>
        Math.round(row.amount * 100) === cents &&
        row.isCredit === item.isCredit &&
        daysBetween(row.date, item.date) <= NEAR_DUPLICATE_DAYS
    );
    if (match) {
      result.push({
        incoming: { date: item.date, description: item.description, amount: item.amount },
        existing: { date: match.date, description: match.description },
      });
    }
  }
  return result;
}

function emptyPlan(file: PlanFileInput, error: string | null): FilePlan {
  return {
    fileName: file.fileName,
    profile: null,
    detectedInstitution: null,
    institution: file.institution,
    userId: file.userId,
    dateFrom: null,
    dateTo: null,
    months: [],
    parsedCount: 0,
    skipped: [],
    newItems: [],
    duplicateCount: 0,
    nearDuplicates: [],
    error,
  };
}

/**
 * Guess whose statement a file is: a user's name as a word in the file name
 * (`jadyn-may-td.csv`), else in the Amex Card Member column. Returns null
 * unless exactly one user matches.
 */
export function guessUserId(
  fileName: string,
  cardMembers: string[],
  users: Array<{ id: number; name: string }>
): number | null {
  const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const firstName = (name: string) => words(name)[0] ?? "";

  const pick = (haystack: string[]): number | null => {
    const tokens = new Set(haystack.flatMap(words));
    const matches = users.filter((u) => tokens.has(firstName(u.name)));
    return matches.length === 1 ? matches[0].id : null;
  };

  return pick([fileName]) ?? pick(cardMembers);
}

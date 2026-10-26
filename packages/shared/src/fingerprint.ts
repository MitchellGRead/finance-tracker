/**
 * Line item identity for import dedupe.
 *
 * Statement exports carry no transaction id, and consecutive exports overlap
 * on their boundary days, so the only identity a row has is its content. Two
 * rows with the same fingerprint are the same transaction *or* a genuine
 * repeat (two identical Caltrain fares on one day) — the fingerprint alone
 * cannot tell them apart. Import therefore compares counts, not presence: see
 * `.documentation/SOP/csv-formats.md` § Deduplication.
 *
 * The description goes through `normalizeForMatch` so exports that pad the
 * merchant and city apart differently still agree.
 */

import { normalizeForMatch } from "./matching";

export interface FingerprintInput {
  userId: number;
  institution: string;
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
}

export function computeFingerprint(row: FingerprintInput): string {
  return [
    row.userId,
    row.institution,
    row.date,
    normalizeForMatch(row.description),
    Math.round(row.amount * 100),
    row.isCredit ? "cr" : "dr",
  ].join("|");
}

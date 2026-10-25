import { parseCsvRows } from "./csv";
import { PROFILES, type ProfileResult } from "./profiles";

export type { FormatProfileId, ProfileResult, SkippedRow } from "./profiles";

export class StatementParseError extends Error {}

/**
 * Detect a statement's format from its content and parse it.
 *
 * Throws `StatementParseError` when the format is unrecognized or no row could
 * be read — an import must never quietly produce an empty statement.
 */
export function parseStatement(content: string): ProfileResult {
  const rows = parseCsvRows(content);
  if (rows.length === 0) throw new StatementParseError("File is empty");

  for (const profile of PROFILES) {
    const read = profile.detect(rows);
    if (!read) continue;
    const result = read();
    if (result.items.length === 0) {
      const first = result.skipped[0];
      throw new StatementParseError(
        `Recognized as ${result.profile} but no rows could be read` +
          (first ? ` (row ${first.row}: ${first.reason})` : "")
      );
    }
    return result;
  }

  throw new StatementParseError(
    "Unrecognized format — expected an Amex export (with header) or a TD export"
  );
}

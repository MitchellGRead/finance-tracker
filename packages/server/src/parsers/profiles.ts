import type { ParsedLineItem, SourceType } from "@finance-tracker/shared";
import { detectDateStyle, parseAmount, parseDate, type DateStyle } from "./fields";

/**
 * A statement format we know how to read. Detection is by content, never by
 * file name or by what the operator picked, so a TD file is read as TD even if
 * Amex was selected — the mismatch is then reported instead of producing a
 * silently empty import.
 *
 * See .documentation/SOP/csv-formats.md for samples of each.
 */
export type FormatProfileId = "amex" | "td_mdy" | "td_iso";

export interface SkippedRow {
  row: number; // 1-based, counting non-blank rows
  reason: string;
}

export interface ProfileResult {
  profile: FormatProfileId;
  institution: SourceType;
  items: ParsedLineItem[];
  skipped: SkippedRow[];
  /** Distinct `Card Member` values (Amex only) — used to guess the user. */
  cardMembers: string[];
}

interface FormatProfile {
  /** Returns a reader if this profile recognizes the rows, else null. */
  detect(rows: string[][]): (() => ProfileResult) | null;
}

// ── Amex ──────────────────────────────────────────────────────────────────
// Header row: Date,Date Processed,Description,Card Member,Account #,Amount.
// Columns are looked up by header name so a reordered export still reads.
// Amount is signed: positive = charge, negative = payment/refund.

const amex: FormatProfile = {
  detect(rows) {
    const header = rows[0]?.map((h) => h.toLowerCase());
    if (!header) return null;
    const col = {
      date: header.indexOf("date"),
      description: header.indexOf("description"),
      amount: header.indexOf("amount"),
      cardMember: header.indexOf("card member"),
    };
    if (col.date < 0 || col.description < 0 || col.amount < 0) return null;

    return () => {
      const items: ParsedLineItem[] = [];
      const skipped: SkippedRow[] = [];
      const cardMembers = new Set<string>();

      rows.slice(1).forEach((row, i) => {
        const rowNum = i + 2;
        const date = parseDate(row[col.date] ?? "", "dmy_text");
        const amount = parseAmount(row[col.amount] ?? "");
        const description = row[col.description] ?? "";
        if (date === null) {
          skipped.push({ row: rowNum, reason: `unreadable date "${row[col.date] ?? ""}"` });
          return;
        }
        if (amount === null) {
          skipped.push({ row: rowNum, reason: `unreadable amount "${row[col.amount] ?? ""}"` });
          return;
        }
        if (col.cardMember >= 0 && row[col.cardMember]) {
          cardMembers.add(row[col.cardMember]);
        }
        items.push({ date, description, amount: Math.abs(amount), isCredit: amount < 0 });
      });

      return { profile: "amex", institution: "amex", items, skipped, cardMembers: [...cardMembers] };
    };
  },
};

// ── TD ────────────────────────────────────────────────────────────────────
// No header. Columns: date, description, debit, credit, balance. TD ships two
// date styles depending on account and export age:
//   10/05/2025,DAIRY QUEEN #27314,39.99,,555.65          (td_mdy)
//   "2026-05-04","E-TRANSFER","30",,"48189.65"           (td_iso)
// Style is read per row: a file re-saved by a spreadsheet can mix both. The
// profile reported is the majority style.

const TD_STYLES: Partial<Record<DateStyle, FormatProfileId>> = {
  mdy_slash: "td_mdy",
  iso: "td_iso",
};

const td: FormatProfile = {
  detect(rows) {
    const tdStyle = (value: string): DateStyle | null => {
      const style = detectDateStyle(value);
      return style !== null && TD_STYLES[style] !== undefined ? style : null;
    };
    const styleCounts = new Map<FormatProfileId, number>();
    for (const row of rows) {
      const style = row.length >= 4 ? tdStyle(row[0]) : null;
      const id = style ? TD_STYLES[style] : undefined;
      if (id) styleCounts.set(id, (styleCounts.get(id) ?? 0) + 1);
    }
    if (styleCounts.size === 0) return null;
    const profile = [...styleCounts].sort((a, b) => b[1] - a[1])[0][0];

    return () => {
      const items: ParsedLineItem[] = [];
      const skipped: SkippedRow[] = [];

      rows.forEach((row, i) => {
        const rowNum = i + 1;
        if (row.length < 4) {
          skipped.push({ row: rowNum, reason: `expected 4+ columns, got ${row.length}` });
          return;
        }
        const [dateStr, description, debitStr, creditStr] = row;
        const style = tdStyle(dateStr);
        const date = style ? parseDate(dateStr, style) : null;
        if (date === null) {
          skipped.push({
            row: rowNum,
            reason: i === 0 ? "header row" : `unreadable date "${dateStr}"`,
          });
          return;
        }
        const debit = parseAmount(debitStr);
        const credit = parseAmount(creditStr);
        if (debit !== null && debit !== 0) {
          items.push({ date, description, amount: Math.abs(debit), isCredit: debit < 0 });
        } else if (credit !== null && credit !== 0) {
          items.push({ date, description, amount: Math.abs(credit), isCredit: credit > 0 });
        } else {
          skipped.push({ row: rowNum, reason: "no debit or credit amount" });
        }
      });

      return { profile, institution: "td", items, skipped, cardMembers: [] };
    };
  },
};

/** Tried in order; the first profile that recognizes the rows reads them. */
export const PROFILES: FormatProfile[] = [amex, td];

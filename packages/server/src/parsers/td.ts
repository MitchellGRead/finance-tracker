import type { ParsedLineItem } from "@finance-tracker/shared";
import { parseCsvRows } from "./csv";

/**
 * Parse TD CSV format (no headers).
 *
 * Columns: Date, Description, Debit, Credit, Balance
 * Date format: MM/DD/YYYY
 *
 * Rows with a debit value are charges. Rows with only a credit value
 * are payments/refunds — these are still imported with isCredit=true
 * so the rule engine can handle them.
 */
export function parseTdCsv(content: string): ParsedLineItem[] {
  const rows = parseCsvRows(content);
  const items: ParsedLineItem[] = [];

  for (const row of rows) {
    if (row.length < 5) continue;

    const [dateStr, description, debitStr, creditStr] = row;
    const date = parseTdDate(dateStr);
    if (!date) continue;

    const debit = debitStr ? parseFloat(debitStr) : NaN;
    const credit = creditStr ? parseFloat(creditStr) : NaN;

    if (!isNaN(debit)) {
      items.push({
        date,
        description,
        amount: Math.abs(debit),
        isCredit: false,
      });
    } else if (!isNaN(credit)) {
      items.push({
        date,
        description,
        amount: Math.abs(credit),
        isCredit: true,
      });
    }
  }

  return items;
}

/**
 * Parse "MM/DD/YYYY" into ISO date string "YYYY-MM-DD"
 */
function parseTdDate(dateStr: string): string | null {
  const parts = dateStr.trim().split("/");
  if (parts.length !== 3) return null;

  const [month, day, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

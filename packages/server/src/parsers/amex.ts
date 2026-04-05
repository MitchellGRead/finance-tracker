import type { ParsedLineItem } from "@finance-tracker/shared";
import { parseCsvRows } from "./csv";

/**
 * Parse American Express CSV format.
 *
 * Expected headers: Date, Date Processed, Description, Card Member, Account #, Amount
 * Date format: DD MMM YYYY (e.g., "23 Dec 2025")
 */
export function parseAmexCsv(content: string): ParsedLineItem[] {
  const rows = parseCsvRows(content);
  if (rows.length === 0) return [];

  // Skip header row
  const dataRows = rows.slice(1);
  const items: ParsedLineItem[] = [];

  for (const row of dataRows) {
    if (row.length < 6) continue;

    const [dateStr, , description, , , amountStr] = row;
    const date = parseAmexDate(dateStr);
    const amount = parseFloat(amountStr);

    if (!date || isNaN(amount)) continue;

    items.push({
      date,
      description,
      amount: Math.abs(amount),
      isCredit: amount < 0,
    });
  }

  return items;
}

/**
 * Parse "DD MMM YYYY" into ISO date string "YYYY-MM-DD"
 */
function parseAmexDate(dateStr: string): string | null {
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04",
    May: "05", Jun: "06", Jul: "07", Aug: "08",
    Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };

  const parts = dateStr.trim().split(" ");
  if (parts.length !== 3) return null;

  const [day, monthStr, year] = parts;
  const month = months[monthStr];
  if (!month) return null;

  return `${year}-${month}-${day.padStart(2, "0")}`;
}

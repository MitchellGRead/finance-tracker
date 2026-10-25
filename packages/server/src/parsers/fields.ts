/**
 * Field-level parsing shared by every statement format. Each returns null for
 * a value it cannot read, so the caller can report the row as skipped instead
 * of importing a wrong date or amount.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type DateStyle = "dmy_text" | "mdy_slash" | "iso";

const DATE_PATTERNS: Record<DateStyle, RegExp> = {
  dmy_text: /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/, // 23 Dec 2025
  mdy_slash: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // 10/05/2025
  iso: /^(\d{4})-(\d{2})-(\d{2})$/, // 2026-05-04
};

/** Which style a date string is in, or null if none. Does not validate. */
export function detectDateStyle(value: string): DateStyle | null {
  const trimmed = value.trim();
  for (const style of Object.keys(DATE_PATTERNS) as DateStyle[]) {
    if (DATE_PATTERNS[style].test(trimmed)) return style;
  }
  return null;
}

/** Parse a date in the given style to ISO `YYYY-MM-DD`; null if not a real date. */
export function parseDate(value: string, style: DateStyle): string | null {
  const match = DATE_PATTERNS[style].exec(value.trim());
  if (!match) return null;

  let year: number;
  let month: number;
  let day: number;
  switch (style) {
    case "dmy_text": {
      const m = MONTHS[match[2].toLowerCase()];
      if (m === undefined) return null;
      [day, month, year] = [Number(match[1]), m, Number(match[3])];
      break;
    }
    case "mdy_slash":
      [month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
      break;
    case "iso":
      [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
      break;
  }

  // Round-trip through UTC to reject 02/31 and friends.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse a money amount: tolerates `$`, thousands separators and whitespace, and
 * reads `(12.00)` as negative. Empty input is null (an absent debit/credit
 * column), as is anything non-numeric. `parseFloat` is not used because it
 * reads "1,234.56" as 1.
 */
export function parseAmount(value: string): number | null {
  let s = value.trim();
  if (s === "") return null;

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;

  const n = Number(s);
  return negative ? -n : n;
}

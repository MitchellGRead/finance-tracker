/** `YYYY-MM` month keys — the form line item dates and the trend use. */

export const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

/** `key` moved by `delta` months (negative goes back). */
export function addMonths(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const index = year * 12 + (month - 1) + delta;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}

/** The `count` months ending at `key`, oldest first, `key` included. */
export function trailingMonths(key: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(key, i - count + 1));
}

/** The `count` months before `key`, oldest first, `key` excluded. */
export function priorMonths(key: string, count: number): string[] {
  return trailingMonths(addMonths(key, -1), count);
}

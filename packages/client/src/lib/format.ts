export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);

export const formatCurrencyWhole = (amount: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(amount);

/** `2026-09` → "Sep 2026" (or "Sep" with `short`). */
export function formatMonthKey(key: string, short = false): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-US", short ? { month: "short" } : { month: "short", year: "numeric" });
}

/** "Apr – Sep 2026", "Nov 2025 – Feb 2026", or one month. Keys sorted. */
export function formatMonthRange(keys: string[]): string {
  if (keys.length === 0) return "";
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === last) return formatMonthKey(first);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${formatMonthKey(first, sameYear)} – ${formatMonthKey(last)}`;
}

/** `2026-10-26` (or an ISO timestamp) → "Oct 26". */
export function formatDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface Pair {
  a: { id: number; name: string };
  b: { id: number; name: string };
}

/** "Jadyn owes Mitchell" for a canonical signed amount (positive = `pair.a` owes `pair.b`). */
export function whoOwes(amount: number, pair: Pair | null | undefined): string | null {
  if (!pair || Math.abs(amount) < 0.005) return null;
  const [from, to] = amount > 0 ? [pair.a, pair.b] : [pair.b, pair.a];
  return `${from.name} owes ${to.name}`;
}

/** "Jadyn owes Mitchell $12.00", or "Nothing owed". */
export function describeOwed(amount: number, pair: Pair | null | undefined): string {
  const who = whoOwes(amount, pair);
  return who ? `${who} ${formatCurrency(Math.abs(amount))}` : "Nothing owed";
}

/** "Mitchell paid Jadyn" for a canonical signed amount that was recorded as settled. */
export function whoPaid(amount: number, pair: Pair | null | undefined): string | null {
  if (!pair || Math.abs(amount) < 0.005) return null;
  const [from, to] = amount > 0 ? [pair.a, pair.b] : [pair.b, pair.a];
  return `${from.name} paid ${to.name}`;
}

/**
 * For an open month whose due differs from its share — an adjustment for it
 * was paid by a settlement that is still recorded after the one covering the
 * month was undone — say why. Null when there is nothing to explain.
 */
export function describeAlreadyPaid(
  share: { live: number; due: number },
  pair: Pair | null | undefined
): string | null {
  const paid = share.live - share.due;
  const who = whoPaid(paid, pair);
  if (!who) return null;
  return `Month's share: ${describeOwed(share.live, pair)}; ${who} ${formatCurrency(Math.abs(paid))} for it in an earlier adjustment.`;
}

/** "Undo this settlement? Sep 2026 becomes open again." */
export function describeUndo(coveredMonths: string[]): string {
  if (coveredMonths.length === 0) return "Undo this settlement? What it paid is owed again.";
  const verb = coveredMonths.length === 1 ? "becomes" : "become";
  return `Undo this settlement? ${formatMonthRange(coveredMonths)} ${verb} open again.`;
}

/**
 * Rule pattern matching. Shared so the server (which applies rules) and the
 * client (which shows which rule matched) can never disagree.
 *
 * Statement descriptions are fixed-width column dumps: the merchant and the
 * city are padded apart with runs of spaces, e.g.
 *
 *   "WISPR                   SAN FRANCISCO"
 *
 * HTML collapses that whitespace, so the operator sees "WISPR SAN FRANCISCO"
 * in the table, and `suggestPattern` also collapses it when proposing a
 * pattern. A raw `includes()` then fails on a pattern that spans the gap
 * ("WISPR SAN"), and the rule silently never fires. Normalizing both sides is
 * what makes the pattern the operator sees the pattern that matches.
 */

/** Lowercase, collapse whitespace runs to one space, trim. */
export function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Case- and whitespace-insensitive substring match. */
export function descriptionMatchesPattern(
  description: string,
  pattern: string
): boolean {
  const normalizedPattern = normalizeForMatch(pattern);
  if (normalizedPattern === "") return false;
  return normalizeForMatch(description).includes(normalizedPattern);
}

/**
 * Length used to rank competing matches. Normalized so that two patterns
 * differing only in padding are ranked identically.
 */
export function patternMatchLength(pattern: string): number {
  return normalizeForMatch(pattern).length;
}

/** True when two patterns would match exactly the same descriptions. */
export function patternsAreEquivalent(a: string, b: string): boolean {
  return normalizeForMatch(a) === normalizeForMatch(b);
}

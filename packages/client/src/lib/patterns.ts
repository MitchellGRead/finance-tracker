/**
 * Suggest a fuzzy-match pattern from a raw statement description.
 * Strips store numbers, trailing locations, phone numbers, and reference IDs
 * to produce a shorter pattern that will match future similar transactions.
 *
 * Examples:
 *   "THRIFTY FOODS #9461 VIC VICTORIA" → "THRIFTY FOODS"
 *   "PARSONAGE CAFE #8248473 VICTORIA" → "PARSONAGE CAFE"
 *   "DAIRY QUEEN #27314"               → "DAIRY QUEEN"
 *   "SUPABASE                SINGAPORE" → "SUPABASE"
 *   "TRUPANION               888-733-2685" → "TRUPANION"
 *   "HEY HAPPY COFFEE INC -  Victoria" → "HEY HAPPY COFFEE"
 *   "RISE QUADRA 413466727   VICTORIA" → "RISE QUADRA"
 *   "PAYMENT - THANK YOU"              → "PAYMENT - THANK YOU"
 *   "Amazon Channels"                  → "Amazon Channels"
 */
export function suggestPattern(description: string): string {
  let s = description;

  // 1. Collapse multiple spaces to single
  s = s.replace(/\s{2,}/g, " ").trim();

  // 2. Strip everything from first # followed by digits onward
  s = s.replace(/#\d+.*$/, "").trim();

  // 3. Strip trailing phone-number-like patterns (e.g., 888-733-2685)
  s = s.replace(/\s+\d{3}-\d{3}-\d{4}$/, "").trim();

  // 4. Strip trailing long digit sequences (reference numbers like 413466727)
  s = s.replace(/\s+\d{6,}$/, "").trim();

  // 5. Strip trailing "INC", "LTD", "CO" etc. + everything after
  s = s.replace(/\s+(INC|LTD|CO|CORP)\b.*$/i, "").trim();

  // 6. Strip trailing single words that look like city/location names
  //    (all-caps or title-case, 2-12 chars, at the end)
  s = s.replace(/\s+[A-Z][a-zA-Z]{1,11}$/, "").trim();

  // 7. Strip trailing " - " and everything after if what remains is ≥ 3 chars
  const dashIdx = s.lastIndexOf(" - ");
  if (dashIdx >= 3) {
    s = s.substring(0, dashIdx).trim();
  }

  // 8. Strip trailing "P" or similar single-char fragments
  s = s.replace(/\s+[A-Z]$/, "").trim();

  // 9. Final collapse and trim
  s = s.replace(/\s{2,}/g, " ").trim();

  // Don't return empty — fall back to original
  return s.length >= 2 ? s : description.replace(/\s{2,}/g, " ").trim();
}

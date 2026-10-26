import Papa from "papaparse";

/**
 * Split CSV content into rows of trimmed fields. Handles a UTF-8 BOM, CRLF,
 * quoted fields containing commas or newlines, and escaped quotes. Blank lines
 * are dropped.
 *
 * Only the ends of each field are trimmed: descriptions keep their internal
 * fixed-width padding, which matching normalizes away at compare time.
 */
export function parseCsvRows(content: string): string[][] {
  const result = Papa.parse<string[]>(content.replace(/^﻿/, ""), {
    skipEmptyLines: "greedy",
  });
  return result.data.map((row) => row.map((field) => field.trim()));
}

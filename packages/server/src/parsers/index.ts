import type { ParsedLineItem } from "@finance-tracker/shared";
import type { SourceType } from "@finance-tracker/shared";
import { parseAmexCsv } from "./amex";
import { parseTdCsv } from "./td";

export function parseCsv(
  content: string,
  sourceType: SourceType
): ParsedLineItem[] {
  switch (sourceType) {
    case "amex":
      return parseAmexCsv(content);
    case "td":
      return parseTdCsv(content);
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
}

export { parseAmexCsv } from "./amex";
export { parseTdCsv } from "./td";

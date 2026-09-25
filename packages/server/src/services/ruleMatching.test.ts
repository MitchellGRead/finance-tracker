import { describe, it, expect } from "vitest";
import {
  normalizeForMatch,
  descriptionMatchesPattern,
  patternMatchLength,
  patternsAreEquivalent,
} from "@finance-tracker/shared";

// Descriptions are fixed-width column dumps from the statement CSVs. These are
// verbatim from the live database, padding included — they are the reason the
// LINEAR.APP and WISPR rules silently never fired.
const WISPR = "WISPR                   SAN FRANCISCO";
const LINEAR = "LINEAR.APP              SAN FRANCISCO";

describe("normalizeForMatch", () => {
  it("collapses whitespace runs and lowercases", () => {
    expect(normalizeForMatch(WISPR)).toBe("wispr san francisco");
  });

  it("collapses tabs and newlines, not just spaces", () => {
    expect(normalizeForMatch("A\t\tB\nC")).toBe("a b c");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeForMatch("  PADDED  ")).toBe("padded");
  });
});

describe("descriptionMatchesPattern", () => {
  it("matches a pattern spanning a run of spaces in the description", () => {
    expect(descriptionMatchesPattern(WISPR, "WISPR SAN")).toBe(true);
    expect(descriptionMatchesPattern(LINEAR, "LINEAR.APP SAN")).toBe(true);
  });

  it("matches the full padded pattern too", () => {
    expect(descriptionMatchesPattern(WISPR, "RAILWAY SAN FRANCISCO")).toBe(
      false
    );
    expect(
      descriptionMatchesPattern(
        "RAILWAY                 SAN FRANCISCO",
        "RAILWAY SAN FRANCISCO"
      )
    ).toBe(true);
  });

  it("stays case-insensitive", () => {
    expect(descriptionMatchesPattern("Amazon Channels", "AMAZON CHANNELS")).toBe(
      true
    );
  });

  it("still matches single-token patterns", () => {
    expect(descriptionMatchesPattern(WISPR, "WISPR")).toBe(true);
  });

  it("does not match unrelated descriptions", () => {
    expect(descriptionMatchesPattern(WISPR, "LINEAR.APP SAN")).toBe(false);
    expect(descriptionMatchesPattern("THRIFTY FOODS #9461", "SAVE ON")).toBe(
      false
    );
  });

  it("treats an all-whitespace or empty pattern as no match", () => {
    // Otherwise "" would match every description and hijack every import.
    expect(descriptionMatchesPattern(WISPR, "")).toBe(false);
    expect(descriptionMatchesPattern(WISPR, "   ")).toBe(false);
  });

  it("normalizes the pattern side as well as the description", () => {
    expect(descriptionMatchesPattern("WISPR SAN FRANCISCO", "WISPR    SAN")).toBe(
      true
    );
  });
});

describe("patternMatchLength", () => {
  it("ranks by normalized length so padding cannot inflate precedence", () => {
    expect(patternMatchLength("WISPR    SAN")).toBe(
      patternMatchLength("WISPR SAN")
    );
    expect(patternMatchLength("LINEAR.APP SAN")).toBeGreaterThan(
      patternMatchLength("LINEAR.APP")
    );
  });
});

describe("patternsAreEquivalent", () => {
  it("treats padding- and case-only differences as the same rule", () => {
    expect(patternsAreEquivalent("WISPR SAN", "wispr   san")).toBe(true);
  });

  it("keeps genuinely different patterns distinct", () => {
    expect(patternsAreEquivalent("WISPR SAN", "WISPR SAN FRANCISCO")).toBe(
      false
    );
  });
});

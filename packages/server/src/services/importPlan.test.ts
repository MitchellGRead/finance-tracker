import { describe, it, expect } from "vitest";
import type { ParsedLineItem } from "@finance-tracker/shared";
import type { ProfileResult } from "../parsers";
import { guessUserId, planImport, type ExistingRow, type PlanFileInput } from "./importPlan";

const USER = 1;

const row = (date: string, description: string, amount: number): ParsedLineItem => ({
  date,
  description,
  amount,
  isCredit: false,
});

const file = (
  items: ParsedLineItem[],
  overrides: Partial<PlanFileInput> = {}
): PlanFileInput => {
  const parsed: ProfileResult = {
    profile: "amex",
    institution: "amex",
    items,
    skipped: [],
    cardMembers: [],
  };
  return { fileName: "f.csv", userId: USER, institution: null, parsed, ...overrides };
};

const stored = (item: ParsedLineItem, overrides: Partial<ExistingRow> = {}): ExistingRow => ({
  ...item,
  userId: USER,
  institution: "amex",
  fingerprint: null,
  ...overrides,
});

const coffee = row("2026-05-22", "CAFE", 4.5);
const fare = row("2026-04-28", "CALTRAIN                SAN CARLOS", 8.77);

describe("planImport — count-aware dedupe", () => {
  it("drops a boundary-day overlap row", () => {
    const [plan] = planImport([file([coffee])], [stored(coffee)]);
    expect(plan.newItems).toHaveLength(0);
    expect(plan.duplicateCount).toBe(1);
  });

  it("keeps genuine same-day repeats on first import", () => {
    const [plan] = planImport([file([fare, fare])], []);
    expect(plan.newItems).toHaveLength(2);
  });

  it("adds only the missing copy when an earlier export had a partial day", () => {
    const [plan] = planImport([file([fare, fare])], [stored(fare)]);
    expect(plan.newItems).toHaveLength(1);
    expect(plan.duplicateCount).toBe(1);
  });

  it("is idempotent when the same file is uploaded again", () => {
    const items = [coffee, fare, fare];
    const [plan] = planImport([file(items)], items.map((i) => stored(i)));
    expect(plan.newItems).toHaveLength(0);
  });

  it("matches across whitespace padding differences between exports", () => {
    const repadded = { ...fare, description: "CALTRAIN SAN CARLOS" };
    const [plan] = planImport([file([repadded])], [stored(fare)]);
    expect(plan.newItems).toHaveLength(0);
  });

  it("does not treat another user's or institution's row as a duplicate", () => {
    const [plan] = planImport(
      [file([coffee])],
      [stored(coffee, { userId: 2 }), stored(coffee, { institution: "td" })]
    );
    expect(plan.newItems).toHaveLength(1);
  });

  it("dedupes overlapping files dropped in the same batch", () => {
    const tea = row("2026-05-23", "TEA", 3);
    const [first, second] = planImport(
      [file([coffee, tea]), file([tea, row("2026-05-24", "CAKE", 6)])],
      []
    );
    expect(first.newItems).toHaveLength(2);
    expect(second.newItems.map((i) => i.description)).toEqual(["CAKE"]);
  });

  it("uses a stored fingerprint over recomputing it", () => {
    const [plan] = planImport(
      [file([coffee])],
      [stored(coffee, { description: "edited", fingerprint: "1|amex|2026-05-22|cafe|450|dr" })]
    );
    expect(plan.newItems).toHaveLength(0);
  });
});

describe("planImport — file metadata and errors", () => {
  it("reports date range and months touched", () => {
    const [plan] = planImport([file([row("2026-05-22", "A", 1), row("2026-06-23", "B", 2)])], []);
    expect(plan).toMatchObject({
      dateFrom: "2026-05-22",
      dateTo: "2026-06-23",
      months: ["2026-05", "2026-06"],
      institution: "amex",
      error: null,
    });
  });

  it("errors when the chosen institution contradicts the content", () => {
    const [plan] = planImport([file([coffee], { institution: "td" })], []);
    expect(plan.error).toMatch(/looks like AMEX/);
    expect(plan.newItems).toHaveLength(0);
  });

  it("errors when no user is set", () => {
    const [plan] = planImport([file([coffee], { userId: null })], []);
    expect(plan.error).toMatch(/Pick whose statement/);
  });

  it("passes parse errors through", () => {
    const [plan] = planImport([file([], { parsed: { error: "File is empty" } })], []);
    expect(plan.error).toBe("File is empty");
  });
});

describe("planImport — near duplicates", () => {
  it("flags a stored row the new export no longer contains, matched by amount", () => {
    const pending = row("2026-05-22", "AMZN MKTP PENDING", 12.31);
    const posted = row("2026-05-23", "AMAZON.CA*QA1C06QR3", 12.31);
    const [plan] = planImport([file([coffee, posted])], [stored(pending), stored(coffee)]);
    expect(plan.newItems).toHaveLength(1);
    expect(plan.nearDuplicates).toEqual([
      {
        incoming: { date: "2026-05-23", description: "AMAZON.CA*QA1C06QR3", amount: 12.31 },
        existing: { date: "2026-05-22", description: "AMZN MKTP PENDING" },
      },
    ]);
  });

  it("does not flag rows outside the file's range", () => {
    const old = row("2026-05-21", "X", 9);
    const [plan] = planImport([file([row("2026-05-22", "Y", 9)])], [stored(old)]);
    expect(plan.nearDuplicates).toEqual([]);
  });

  it("does not flag repeat purchases the new export still contains", () => {
    const monday = row("2026-05-11", "SELKIRK CAFE", 3.93);
    const tuesday = row("2026-05-12", "SELKIRK CAFE", 3.93);
    const [plan] = planImport([file([monday, tuesday])], [stored(monday)]);
    expect(plan.newItems).toEqual([expect.objectContaining({ date: "2026-05-12" })]);
    expect(plan.nearDuplicates).toEqual([]);
  });
});

describe("guessUserId", () => {
  const users = [
    { id: 1, name: "Mitchell" },
    { id: 2, name: "Jadyn" },
  ];

  it("finds a user's name in the file name", () => {
    expect(guessUserId("jadyn-may-june-td.csv", [], users)).toBe(2);
    expect(guessUserId("Mitchell_Aug_Amex.csv", [], users)).toBe(1);
  });

  it("falls back to the card member column", () => {
    expect(guessUserId("activity (3).csv", ["MITCHELL READ"], users)).toBe(1);
  });

  it("returns null when nothing or more than one user matches", () => {
    expect(guessUserId("accountactivity.csv", [], users)).toBeNull();
    expect(guessUserId("mitchell-jadyn.csv", [], users)).toBeNull();
  });
});

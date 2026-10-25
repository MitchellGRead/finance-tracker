import { describe, it, expect } from "vitest";
import { parseStatement, StatementParseError } from "./index";
import { parseAmount, parseDate } from "./fields";

describe("parseAmount", () => {
  it.each([
    ["12.99", 12.99],
    ["-12.99", -12.99],
    ["1,234.56", 1234.56],
    ["$1,234.56", 1234.56],
    ["(45.00)", -45],
    ["600", 600],
    [" 7.5 ", 7.5],
  ])("reads %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "12.3.4", "--5"])("rejects %j", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe("parseDate", () => {
  it("reads each style to ISO", () => {
    expect(parseDate("3 Dec 2025", "dmy_text")).toBe("2025-12-03");
    expect(parseDate("10/05/2025", "mdy_slash")).toBe("2025-10-05");
    expect(parseDate("2026-05-04", "iso")).toBe("2026-05-04");
  });

  it("rejects dates that do not exist", () => {
    expect(parseDate("02/31/2026", "mdy_slash")).toBeNull();
    expect(parseDate("31 Foo 2026", "dmy_text")).toBeNull();
  });
});

describe("parseStatement — Amex", () => {
  const amex = [
    "﻿Date,Date Processed,Description,Card Member,Account #,Amount",
    "23 Dec 2025,23 Dec 2025,MEMBERSHIP FEE INSTALLMENT,JANE DOE,-12555,12.99",
    '22 Dec 2025,23 Dec 2025,"OPENROUTER, INC         NEW YORK",JANE DOE,-12555,"1,030.07"',
    "21 Dec 2025,21 Dec 2025,PAYMENT RECEIVED - THANK YOU,JANE DOE,-12555,-500.00",
    "",
  ].join("\n");

  it("detects the format and maps columns by header name", () => {
    const result = parseStatement(amex);
    expect(result.profile).toBe("amex");
    expect(result.institution).toBe("amex");
    expect(result.items).toEqual([
      { date: "2025-12-23", description: "MEMBERSHIP FEE INSTALLMENT", amount: 12.99, isCredit: false },
      { date: "2025-12-22", description: "OPENROUTER, INC         NEW YORK", amount: 1030.07, isCredit: false },
      { date: "2025-12-21", description: "PAYMENT RECEIVED - THANK YOU", amount: 500, isCredit: true },
    ]);
    expect(result.cardMembers).toEqual(["JANE DOE"]);
  });

  it("reads reordered columns", () => {
    const result = parseStatement("Amount,Description,Date\n4.50,COFFEE,01 Jan 2026");
    expect(result.items).toEqual([
      { date: "2026-01-01", description: "COFFEE", amount: 4.5, isCredit: false },
    ]);
  });

  it("reports unreadable rows instead of dropping them silently", () => {
    const result = parseStatement(
      "Date,Description,Amount\n01 Jan 2026,COFFEE,4.50\nnot a date,TEA,3.00\n02 Jan 2026,CAKE,n/a"
    );
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toEqual([
      { row: 3, reason: 'unreadable date "not a date"' },
      { row: 4, reason: 'unreadable amount "n/a"' },
    ]);
  });
});

describe("parseStatement — TD", () => {
  it("reads the MM/DD/YYYY export with CRLF", () => {
    const content =
      "10/05/2025,DAIRY QUEEN #27314,39.99,,555.65\r\n" +
      "10/01/2025,PAYMENT - THANK YOU,,137.61,497.91\r\n";
    const result = parseStatement(content);
    expect(result.profile).toBe("td_mdy");
    expect(result.items).toEqual([
      { date: "2025-10-05", description: "DAIRY QUEEN #27314", amount: 39.99, isCredit: false },
      { date: "2025-10-01", description: "PAYMENT - THANK YOU", amount: 137.61, isCredit: true },
    ]);
  });

  it("reads the quoted ISO-date export that used to import zero rows", () => {
    const content = [
      '"2026-07-02","E-TRANSFER 67f","600",,"43765.22"',
      '"2026-07-03","E-TRANSFER IN",,"600","44365.22"',
    ].join("\n");
    const result = parseStatement(content);
    expect(result.profile).toBe("td_iso");
    expect(result.institution).toBe("td");
    expect(result.items).toEqual([
      { date: "2026-07-02", description: "E-TRANSFER 67f", amount: 600, isCredit: false },
      { date: "2026-07-03", description: "E-TRANSFER IN", amount: 600, isCredit: true },
    ]);
  });

  it("reads a spreadsheet-resaved file that mixes both date styles", () => {
    const result = parseStatement(
      '"2026-04-05","A","1",,"9"\n04/04/2026,B,2,,7\n"2026-04-03","C","3",,"4"'
    );
    expect(result.profile).toBe("td_iso");
    expect(result.items.map((i) => i.date)).toEqual(["2026-04-05", "2026-04-04", "2026-04-03"]);
  });

  it("skips a header row if one is present", () => {
    const result = parseStatement(
      "Date,Description,Debit,Credit,Balance\n10/05/2025,COFFEE,4.00,,10.00"
    );
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toEqual([{ row: 1, reason: "header row" }]);
  });
});

describe("parseStatement — failures", () => {
  it("rejects an empty file", () => {
    expect(() => parseStatement("\n\n")).toThrow(StatementParseError);
  });

  it("rejects an unrecognized format", () => {
    expect(() => parseStatement("foo,bar\n1,2")).toThrow(/Unrecognized format/);
  });

  it("rejects a recognized file with no readable rows", () => {
    expect(() => parseStatement("Date,Description,Amount\nbad,X,1")).toThrow(
      /no rows could be read/
    );
  });
});

/**
 * One-off cleanup for rows imported before import dedupe existed.
 *
 * 1. Stores `fingerprint` on statement-imported line items that lack one.
 *    (Import already computes missing fingerprints on the fly, so this is for
 *    durability, not correctness.)
 * 2. Finds overlap duplicates already in the database by applying the import
 *    rule retroactively: for each fingerprint, copies beyond the largest count
 *    found in any single statement are extras. Genuine same-day repeats live in
 *    one statement, so they are never counted as extras.
 *    Keeps the rows a human touched (override, note, non-pending status,
 *    confirmed suggestion) first, then the oldest.
 * 3. Finds statements with no line items — failed parses from before format
 *    detection — so those files can be re-imported cleanly.
 *
 * Back up the database first (backups/ is gitignored).
 *
 * Usage:
 *   pnpm db:backfill-fingerprints               # dry run — report only
 *   pnpm db:backfill-fingerprints --apply       # write fingerprints, delete extras + empty statements
 *   pnpm db:backfill-fingerprints --apply --db=path/to/other.db
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { computeFingerprint } from "@finance-tracker/shared";
import * as schema from "../src/db/schema";

const { lineItems, statements } = schema;

function parseArgs(argv: string[]) {
  const dbArg = argv.find((a) => a.startsWith("--db="));
  return {
    apply: argv.includes("--apply"),
    dbPath: dbArg ? dbArg.slice("--db=".length) : null,
  };
}

type Row = typeof lineItems.$inferSelect & { institution: string };

/** Higher = more worth keeping. */
function keepScore(row: Row): number {
  const touched =
    row.statusOverride ||
    row.categoryOverride ||
    row.splitRatioOverride ||
    (row.note !== null && row.note !== "") ||
    row.status !== "pending" ||
    row.suggestionStatus === "confirmed";
  return touched ? 1 : 0;
}

function main(): void {
  const { apply, dbPath: dbOverride } = parseArgs(process.argv.slice(2));
  let dbPath = dbOverride;
  if (dbPath === null) {
    process.loadEnvFile?.call(process);
    dbPath = process.env.DATABASE_PATH ?? "finance-tracker.db";
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  const rows: Row[] = db
    .select()
    .from(lineItems)
    .innerJoin(statements, eq(lineItems.statementId, statements.id))
    .where(isNotNull(lineItems.statementId))
    .all()
    .map((r) => ({ ...r.line_items, institution: r.statements.sourceType }));

  // 1. Missing fingerprints.
  const missing = rows.filter((r) => r.fingerprint === null);
  const fingerprintOf = (r: Row) => r.fingerprint ?? computeFingerprint(r);

  // 2. Retroactive duplicates.
  const byFingerprint = new Map<string, Row[]>();
  for (const row of rows) {
    const fp = fingerprintOf(row);
    byFingerprint.set(fp, [...(byFingerprint.get(fp) ?? []), row]);
  }
  const extras: Row[] = [];
  for (const group of byFingerprint.values()) {
    const perStatement = new Map<number | null, number>();
    for (const r of group) {
      perStatement.set(r.statementId, (perStatement.get(r.statementId) ?? 0) + 1);
    }
    const keep = Math.max(...perStatement.values());
    if (group.length <= keep) continue;
    const ranked = [...group].sort((a, b) => keepScore(b) - keepScore(a) || a.id - b.id);
    extras.push(...ranked.slice(keep));
  }

  // 3. Empty statements.
  const withItems = new Set(rows.map((r) => r.statementId));
  const emptyStatements = db
    .select()
    .from(statements)
    .all()
    .filter((s) => !withItems.has(s.id));

  console.log(`Database: ${dbPath}`);
  console.log(`Statement-imported line items: ${rows.length}`);
  console.log(`Missing fingerprint: ${missing.length}`);
  console.log(`Overlap duplicates (extras to delete): ${extras.length}`);
  for (const r of extras) {
    console.log(
      `  #${r.id} ${r.date} ${r.description.replace(/\s+/g, " ")} $${r.amount.toFixed(2)} (statement ${r.statementId}, ${r.status})`
    );
  }
  console.log(`Statements with no line items: ${emptyStatements.length}`);
  for (const s of emptyStatements) {
    console.log(`  #${s.id} ${s.sourceType} ${s.fileName} (period ${s.periodYear}-${s.periodMonth})`);
  }

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply.");
    return;
  }

  db.transaction((tx) => {
    for (const r of missing) {
      tx.update(lineItems)
        .set({ fingerprint: computeFingerprint(r) })
        .where(eq(lineItems.id, r.id))
        .run();
    }
    if (extras.length > 0) {
      tx.delete(lineItems)
        .where(inArray(lineItems.id, extras.map((r) => r.id)))
        .run();
    }
    if (emptyStatements.length > 0) {
      tx.delete(statements)
        .where(inArray(statements.id, emptyStatements.map((s) => s.id)))
        .run();
    }
  });
  console.log(
    `\nApplied: ${missing.length} fingerprints stored, ${extras.length} duplicates deleted, ${emptyStatements.length} empty statements deleted.`
  );
}

main();

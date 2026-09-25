/**
 * Repairs drizzle's migration ledger (`__drizzle_migrations`).
 *
 * Drizzle decides what to apply by hashing each file in `drizzle/` and looking
 * the hash up in `__drizzle_migrations`. If a migration was applied by hand —
 * as 0002 and 0003 were in this project — the schema changes but the ledger
 * does not, so the next `db:migrate` tries to replay it and fails against a
 * schema that has already moved on.
 *
 * This marks such migrations as applied WITHOUT running their SQL. Only use it
 * when the database already reflects those migrations; it is a bookkeeping
 * repair, not a migration runner.
 *
 * Usage:
 *   pnpm db:repair-ledger           # dry run — reports what it would mark
 *   pnpm db:repair-ledger --apply   # write the rows
 *   pnpm db:repair-ledger --apply --db=path/to/other.db
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const MIGRATIONS_DIR = "drizzle";

function parseArgs(argv: string[]) {
  const dbArg = argv.find((a) => a.startsWith("--db="));
  return {
    apply: argv.includes("--apply"),
    dbPath: dbArg ? dbArg.slice("--db=".length) : null,
  };
}

function main(): void {
  const { apply, dbPath: dbOverride } = parseArgs(process.argv.slice(2));

  // Only load the app config when we need its default, so --db works without a
  // valid environment.
  let dbPath = dbOverride;
  if (dbPath === null) {
    process.loadEnvFile?.call(process);
    dbPath = process.env.DATABASE_PATH ?? "finance-tracker.db";
  }

  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")
  ) as { entries: JournalEntry[] };

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const ledgerExists = db
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
    )
    .get() as { n: number };

  if (ledgerExists.n === 0) {
    console.error(
      `No __drizzle_migrations table in ${dbPath}. This database has never been ` +
        `migrated by drizzle; run db:migrate instead of repairing.`
    );
    process.exit(1);
  }

  const applied = new Set(
    (db.prepare("SELECT hash FROM __drizzle_migrations").all() as { hash: string }[]).map(
      (r) => r.hash
    )
  );

  const missing = journal.entries
    .map((entry) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");
      return { entry, hash: createHash("sha256").update(sql).digest("hex") };
    })
    .filter(({ hash }) => !applied.has(hash));

  console.log(`Database:   ${dbPath}`);
  console.log(`Journal:    ${journal.entries.length} migrations`);
  console.log(`Ledger:     ${applied.size} recorded`);

  if (missing.length === 0) {
    console.log("\nLedger is already consistent with the journal. Nothing to do.");
    db.close();
    return;
  }

  console.log(`\nNot recorded as applied:`);
  for (const { entry, hash } of missing) {
    console.log(`  ${entry.tag}  ${hash.slice(0, 12)}…`);
  }

  if (!apply) {
    console.log(
      `\nDry run. Re-run with --apply to mark these as applied.\n` +
        `Only do that if the database already contains their changes — this ` +
        `writes ledger rows, it does not run any SQL.`
    );
    db.close();
    return;
  }

  const insert = db.prepare(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
  );
  const run = db.transaction((rows: typeof missing) => {
    for (const { entry, hash } of rows) insert.run(hash, entry.when);
  });
  run(missing);

  console.log(`\nMarked ${missing.length} migration(s) as applied.`);
  db.close();
}

main();

# CSV Statement Formats

The system reads two institutions' exports — Amex and TD (two date styles) — and normalizes them into the same `line_item` shape.

**The format is detected from the file's content**, never from its name or from what the operator picked (`packages/server/src/parsers/profiles.ts`). The operator's institution choice is a confirmation: if it contradicts the content, that file is rejected with an error. A file that is unrecognized, or recognized but yields no readable rows, is an error — import never creates a silently empty statement. Unreadable rows inside an otherwise good file are skipped and reported per row.

| Profile | Institution | Detected by |
|---|---|---|
| `amex` | amex | header row containing `Date`, `Description`, `Amount` |
| `td_mdy` | td | no header; first column `MM/DD/YYYY` |
| `td_iso` | td | no header; first column `YYYY-MM-DD` (quoted) |

Parsing uses papaparse, so BOMs, CRLF, quoted commas and multi-line fields are handled. Amounts tolerate `$`, thousands separators and `(12.00)` negatives; dates are validated as real calendar dates.

## American Express

**Has headers.** First row: `Date,Date Processed,Description,Card Member,Account #,Amount`. Columns are looked up **by header name**, so a reordered export still reads.

### Sample
```csv
Date,Date Processed,Description,Card Member,Account #,Amount
23 Dec 2025,23 Dec 2025,MEMBERSHIP FEE INSTALLMENT,JOHN DOE,-12555,12.99
22 Dec 2025,23 Dec 2025,ORIGIN GLUTEN-FREE BAKE VICTORIA,JOHN DOE,-12555,27.37
22 Dec 2025,23 Dec 2025,PARSONAGE CAFE #8248473 VICTORIA,JOHN DOE,-12555,45.64
```

### Field Mapping
| CSV Column | Maps To | Notes |
|-----------|---------|-------|
| Date | `line_item.date` | Format: `DD MMM YYYY` — parse to ISO 8601 |
| Date Processed | — | Not stored |
| Description | `line_item.description` | Raw text, used for rule matching |
| Card Member | — | Used only to guess the user when the file name doesn't say |
| Account # | — | Not stored |
| Amount | `line_item.amount` | Signed: positive = charge, negative = payment/refund (`isCredit`). Stored as absolute value |

## TD

**No headers.** Columns are positional. TD ships two date styles depending on account and export age; the style is read per row (a spreadsheet re-save can mix them) and the profile reported is the majority. A header row, if present, is skipped.

### Sample — `td_mdy`
```csv
10/05/2025,DAIRY QUEEN #27314,39.99,,555.65
10/02/2025,ISLAND POKE,17.75,,515.66
10/01/2025,PAYMENT - THANK YOU,,137.61,497.91
```

### Sample — `td_iso`
```csv
"2026-07-02","E-TRANSFER 67f","600",,"43765.22"
"2026-07-03","E-TRANSFER IN",,"600","44365.22"
```
Before format detection existed this style parsed to zero rows without an error.

### Field Mapping
| Position | Content | Maps To | Notes |
|----------|---------|---------|-------|
| 0 | Date | `line_item.date` | `MM/DD/YYYY` or `YYYY-MM-DD` — parsed to ISO 8601 |
| 1 | Description | `line_item.description` | Raw text, used for rule matching |
| 2 | Debit amount | `line_item.amount` | Charges — empty if this is a credit |
| 3 | Credit amount | — | Payments/refunds — rows with credit but no debit are still imported but can be auto-rejected via rules |
| 4 | Balance | — | Not stored |

### TD-Specific Handling
- Rows where the debit column is empty and credit column has a value are payment/refund rows (e.g., "PAYMENT - THANK YOU")
- These are still imported as line items (with the credit value as the amount) so that accept/reject rules can manage them
- Users will typically create a reject rule for patterns like "PAYMENT - THANK YOU"

## Normalization

Both parsers produce the same output shape for insertion:

```typescript
interface ParsedLineItem {
  date: string;          // ISO 8601 (YYYY-MM-DD)
  description: string;   // Raw from CSV
  amount: number;        // Positive value
  isCredit: boolean;     // True for TD credit rows
}
```

The `isCredit` flag allows the rule engine and UI to distinguish payments from charges during the review step.

## Importing a batch

The Import dialog takes any number of files for any months and accounts at once (`statements.previewImport` → `statements.commitImport`):

1. Each file is parsed and planned against what is stored — nothing is written.
2. The preview shows per file: institution (detected), user (guessed from a name in the file name, e.g. `jadyn-may-td.csv`, else the Amex Card Member column), date range, new rows, duplicates skipped, unreadable rows, and possible duplicates.
3. **Import all** re-plans server-side (never trusting the preview) and writes every file in one transaction; any file with an error rejects the batch.

Line items land in months by their own dates. A statement's `period_month/period_year` is the month of its last row; `date_from/date_to` record its actual span. There is no month picker on import.

## Deduplication

Exports carry no transaction id, and consecutive statements overlap on their boundary days (an Amex cycle ending the 23rd is followed by one starting the 22nd). A row's identity is therefore its content — its **fingerprint** (`computeFingerprint`, `packages/shared/src/fingerprint.ts`):

```
userId | institution | date | normalizeForMatch(description) | amount in cents | debit/credit
```

The description is normalized so exports that pad merchant and city apart differently still agree.

**A fingerprint can legitimately repeat** — two identical fares on one day are two charges. Skipping anything already present would delete them. So import compares counts: for each fingerprint, a file with `k` copies when `n` are stored inserts `max(0, k − n)`.

| Situation | k | n | Inserted |
|---|---|---|---|
| Boundary-day overlap | 1 | 1 | 0 |
| Two identical fares, first import | 2 | 0 | 2 |
| Earlier export cut mid-day (1), new one has the full day (2) | 2 | 1 | 1 |
| Same file uploaded again | k | k | 0 |
| Stored row was edited (category, split, note) | 1 | 1 | 0 — the edited row is kept |

Files in one batch are planned in order, each seeing the rows earlier files will insert. The fingerprint is stored on `line_items.fingerprint` at import; rows from before dedupe existed have it computed on the fly, so dedupe works without a backfill.

The logic is pure and tested in `packages/server/src/services/importPlan.ts`; I/O is in `importStatements.ts`.

### Possible duplicates (warning only)

A transaction that changes between exports (pending → posted: new date or description) gets a new fingerprint and is imported again. The preview flags these: a stored row dated inside the new file's range that the file **no longer contains**, matched to a new row by amount within 3 days. Nothing is skipped on this basis — review them after import.

### Known limits
- Pending → posted changes are flagged, not merged.
- TD exports carry no account number, so two TD accounts of one user (chequing and credit card) share an identity space. An identical transaction on both the same day would be treated as one; round amounts across accounts can raise false "possible duplicate" warnings.
- A row deleted by hand comes back if a file containing it is imported again.

### One-off cleanup

`pnpm db:backfill-fingerprints` (dry run) / `--apply` — stores missing fingerprints, applies the count rule retroactively (copies of a fingerprint beyond the largest count in any single statement are extras; rows a human touched are kept first), and deletes statements with no line items (failed parses from before detection, so those files can be re-imported). Back up the database first.

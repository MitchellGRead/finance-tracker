# PRD: Household Month Lifecycle — Review, Stale Reports, Settlement

## Problem

The tracker has grown from a shared-expense splitter into a household tracker,
but nothing shows where each month stands:

- A report snapshot silently goes out of date when line items change after it
  was generated. There is no indication and no prompt to regenerate.
- Settlement ("Jadyn owes Mitchell $X") is computed but never recorded. The
  household aims to settle monthly, but often falls several months behind
  (e.g. five months) and then catches up on a batch of prior months at once.
  A catch-up can exceed the e-transfer limit ($3,000), so one settlement is
  paid as several transfers.
- Reports are pure single-month snapshots. Settlement, run rate and anomaly
  baselines are inherently cross-month, so a snapshot of "this month owes
  $X" stops being the whole truth once months are settled together or
  changed after settling.

## Principle: what the snapshot holds vs what is live

**The snapshot holds facts about one month's items. Anything that spans
months is derived at view time and never stored in the snapshot.**

| On a month's report | Source |
|---|---|
| Category / per-user breakdown, item counts, the month's share owed | Snapshot |
| Snapshot vs live diff ("report outdated") | Live recompute vs snapshot |
| Settlement status of the month, payments, outstanding balance, adjustments | Live, from settlement records |
| Run rate, anomaly baselines | Live, from the snapshots of other months |
| Anomaly dismissals | Stored separately (operator decisions) |

The report's settlement card therefore shows **this month's share** (from the
snapshot) **plus where it stands now** (live): "Open · part of $7,658.35
outstanding (Apr – Sep)" or "Settled Oct 26 · covered Apr – Sep · paid in 3
transfers".

## Lifecycle

```
Imported → Reviewed → Reported → Settled
```

| Stage | Meaning (derived, never stored as a status) |
|---|---|
| Imported | Has line items |
| Reviewed | 0 pending items **and** every accepted item has a category |
| Reported | A snapshot exists **and matches** live data |
| Settled | A settlement covers the month |

Flags on top of the stage:
- **Report outdated** — snapshot exists but differs from live data
- **Adjustment pending** — month is settled, but its live share now differs
  from the amount recorded when it was settled

## Requirements

### R1. Report staleness (diff, not timestamps)

- Detected by **recomputing the report live** (`computeReport`) and **diffing
  against the stored snapshot** — never by comparing `updated_at` to
  `generatedAt`. Bulk touches (backfills, rule re-application) bump
  `updated_at` without changing numbers; on the live DB every month
  2025-09…2026-03 shows `updated_at = 2026-10-25T23:54` with unchanged
  figures.
- Only applies when a snapshot exists. No snapshot → "not reported", not
  "stale".
- The diff is summarized in plain language, e.g. "2 items changed · total
  $13,101 → $13,128 · settlement $1,252.95 → $1,266.80". Compared: accepted /
  rejected counts, category totals, per-user totals, the month's share owed.
- Actions: **Regenerate** (one month) and **Regenerate all outdated**.
  Regeneration stays explicit — never automatic.

### R2. Sequencing on the Reports page (Concept A, checklist strip)

- The existing report content stays as is — summary cards, trend, category
  and per-person breakdowns, line items. Additions only.
- **Checklist strip** at the top: Imported → Reviewed → Reported → Settled for
  the selected month, each with its detail and the next action (open
  workspace filtered to pending / uncategorized, Regenerate, Settle).
- **Header month picker:** each month in the calendar shows its stage mark,
  plus a warning mark for outdated / adjustment / unreviewed.
- Marks stay legible without colour (glyph + label).

### R3. Settlement records

- A **settlement** covers one or more months (and any pending adjustments),
  records the owed total at settle time, and is paid by **one or more
  transfers** (amount + date each), e.g. $6,000 paid as 2 × $3,000.
- Settle a range: pick unsettled months (default: all open months up to the
  selected one) → suggested total = sum of their shares + pending
  adjustments.
- Each covered month stores the **share owed at settle time**, taken from its
  snapshot. Settling requires covered months' reports to be current — if not,
  prompt to regenerate first.
- Transfers may total less than or more than owed; the difference carries
  forward as an adjustment.
- A settlement can be deleted (undo); its months revert to unsettled.
- **No linking to imported line items.** E-transfers and card payments stay
  rejected in the workspace; settlement is entered by hand. Matching transfers
  to settlements is a possible future issue, not this one.

### R4. Adjustments after settlement (flag + carry forward)

- If a settled month's live share later differs from the recorded share, the
  month shows **"Settled · $14 adjustment pending"** (with direction).
- Pending adjustments carry forward: the next settlement includes them, and
  once included they are cleared.
- Settled months are not frozen — editing stays allowed; the flag is the
  safeguard.
- A running **outstanding balance** (Σ shares of unsettled months + pending
  adjustments + carried differences) shows on the Reports page.

## Solution approach

- Snapshots stay as the frozen per-month record. Live recompute is only for
  diffing and for cross-month figures.
- New service `monthStatus` computes per month: counts, pending and
  uncategorized counts, snapshot-vs-live diff, settlement coverage and
  adjustment. One query returns all months so the header calendar renders in
  one call. At this data size (~200 items/month, ~14 months) a full live
  recompute per request is cheap; revisit only if not.
- New tables (via `pnpm db:generate` → back up → `pnpm db:migrate`):
  - `settlements`: id, from_user_id, to_user_id, amount_owed (total at settle
    time), note, timestamps
  - `settlement_payments`: id, settlement_id, amount, paid_on (ISO date),
    timestamps
  - `settlement_months`: id, settlement_id, period_year, period_month,
    amount_owed (the month's share as recorded), is_adjustment, timestamps
- Two-person household assumed for netting across a range; N>2 out of scope.

## System impact

- Server: `services/monthStatus.ts` (+ tests), settlement procedures (create,
  delete, list, outstanding), report status query, schema + migration
- Shared: diff and status types
- Client: `ReportsPage.tsx` (strip, settlement card with live status), header
  month picker marks, settle dialog with multiple transfers
- Docs: `report-generation.md` (snapshot-vs-live principle, staleness),
  new `settlement.md` SOP, `data-model.md`, `ui-structure.md`

## Success criteria

- Editing an item in a reported month marks it outdated with an accurate
  diff; reverting the edit clears the flag. A bulk `updated_at` touch with no
  data change flags nothing.
- A month with an accepted uncategorized item is not "Reviewed".
- Settling Apr – Sep as 3 transfers marks all six months settled, each with
  its recorded share; the Sep report shows "Settled … paid in 3 transfers".
- Changing an item in a settled month shows an adjustment, which the next
  settlement includes and clears.

## Out of scope / future

- Matching settlements to imported e-transfer line items.
- Freezing / locking settled months; automatic regeneration.

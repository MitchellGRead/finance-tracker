# Report Generation

Reports are snapshot-based monthly summaries generated on demand and stored for trend tracking.

## Lifecycle

1. User imports and reviews all statements for a given month
2. User triggers "Generate Report" for that month/year
3. System computes the summary from all **accepted** line items in that period
4. Snapshot is stored in `report_snapshots` as a JSON blob
5. If data changes later, the month shows "report outdated" with a diff; the
   user regenerates — the snapshot is replaced

## What Gets Computed

### Per-Category Totals
- Sum of all accepted line items grouped by category, across all users
- Uncategorized items grouped separately

### Per-User Breakdown
- Each user's spending by category
- Each user's total spending for the month

### Split Calculations
For each accepted line item:
- `user_share = amount * split_ratio`
- `other_share = amount * (1 - split_ratio)` (split evenly among other users if N > 2)

Net out across all line items:
- For a two-person household: "Mitchell owes Partner $X" or "Partner owes Mitchell $X"
- The net amount is the single settlement figure for the month

### Summary Object
The stored JSON blob structure:

```typescript
interface ReportSnapshot {
  periodMonth: number;
  periodYear: number;
  generatedAt: string;
  categoryTotals: Array<{
    categoryId: number | null;
    categoryName: string;
    total: number;
  }>;
  userBreakdowns: Array<{
    userId: number;
    userName: string;
    totalSpent: number;
    byCategory: Array<{
      categoryId: number | null;
      categoryName: string;
      total: number;
    }>;
  }>;
  splitSummary: {
    settlements: Array<{
      fromUserId: number;
      fromUserName: string;
      toUserId: number;
      toUserName: string;
      amount: number;
    }>;
  };
  lineItemCount: number;
  acceptedCount: number;
  rejectedCount: number;
}
```

## Snapshot vs live

**The snapshot holds facts about one month's items. Anything that spans
months is derived at view time and never stored in the snapshot.**

| On a month's report | Source |
|---|---|
| Category / per-user breakdown, item counts, the month's share owed | Snapshot |
| Snapshot vs live diff ("report outdated") | Live recompute vs snapshot |
| Settlement status, transfers, outstanding balance, adjustments | Live, from settlement records ([settlement.md](./settlement.md)) |
| Run rate, trend, anomaly baselines | Live, from the snapshots of other months |
| Anomaly dismissals | Stored separately (`anomaly_dismissals`) |

## Month lifecycle

`reports.status` (`services/monthStatus.ts`) derives, for every month in one
call, a stage — never stored:

```
Imported → Reviewed → Reported → Settled
```

| Stage | Meaning |
|---|---|
| Imported | Has line items |
| Reviewed | 0 pending items **and** every accepted item has a category |
| Reported | A snapshot exists **and matches** live data |
| Settled | A settlement covers the month |

Flags on top: **report outdated**, **adjustment pending** (settled, but the
live share now differs from what was recorded), **unreviewed**. The Reports
page shows them as a checklist strip with the next action for each step, and
the header month picker marks each month (glyph + ⚠, legible without colour).

## Staleness

A month's report is outdated when **its numbers** differ from a live
recompute (`computeReport` → `diffReport`): accepted / rejected counts,
category totals, per-user totals and the share owed. Timestamps are never
compared — backfills and rule re-application bump `updated_at` on every row
without changing a figure, and must not flag anything.

The diff is summarized in plain language, e.g. "2 items changed · total
$13,101 → $13,128 · settlement $1,252.95 → $1,266.80 · Groceries $950 → $977".
"N items changed" needs `itemStates` (snapshots generated since it existed);
older snapshots fall back to "accepted 120 → 122".

No snapshot is "not reported", not "stale".

## Regeneration

Always explicit — never automatic. **Regenerate** (one month) and
**Regenerate all outdated** (`reports.regenerateOutdated`) replace the
snapshot (`saveSnapshot`, in a transaction). Trend, run rate and anomaly
baselines read the new snapshot on next view.

## Trend and run rate

- **Spending Trend** (`reports.trend`) — month-over-month series built from
  snapshots; a month without a report is a gap, not zero. See
  [ui-structure.md](./ui-structure.md#spending-trend-chart).
- **Run rate** (`reports.runRate`, `services/runRate.ts`) — average monthly
  spend over the 3 months ending at (and including) the selected month,
  household and per person, from the same trend data. Months without a
  snapshot are left out and the tile names the months used.

## Anomalies

`reports.anomalies` (`services/anomalies.ts`) — deterministic v1, no AI.
Thresholds are one named constant, `ANOMALY_THRESHOLDS`:

| Anomaly | Rule |
|---|---|
| Category spike | Month's category total (snapshot) > 2× its median over the prior 6 reported months **and** > $400 above it. Needs ≥ 3 reported prior months with spend in the category |
| Large one-off item | Accepted charge > $250 **and** > 2× its category's median month (or no history), **and** a one-off: the merchant (description minus reference tokens like `***pRp`) was not paid ≥ 50% of the amount in any baseline month |

- A large item in a spiking category is listed under the spike ("Recreation
  $3,291 vs $446 typical — incl. Shambhala $2,101"), not separately.
- Baseline months without a report are left out; a reported month with no
  spend in the category counts as zero.
- Tuned against the live DB (Nov 2026): the PRD's starting thresholds (1.5×,
  +$100, item > 50% of median) gave 5–8 per month and flagged rent and loan
  payments monthly. The current ones give 2–5 for Feb–Sep 2026.
- **Dismissals** (`dismissAnomaly` / `undismissAnomaly`, optional note) are
  keyed by month + kind + subject, so regenerating or a moved baseline never
  resurrects one; dismissed anomalies collapse into a "Show N dismissed"
  toggle.

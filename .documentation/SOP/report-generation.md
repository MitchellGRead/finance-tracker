# Report Generation

Reports are snapshot-based monthly summaries generated on demand and stored for trend tracking.

## Lifecycle

1. User imports and reviews all statements for a given month
2. User triggers "Generate Report" for that month/year
3. System computes the summary from all **accepted** line items in that period
4. Snapshot is stored in `report_snapshots` as a JSON blob
5. If data changes later, user can regenerate — the snapshot is replaced

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

## Trend Tracking

When viewing reports, the system pulls prior snapshots to compute trends:
- Category spending month-over-month (absolute and percentage change)
- Total spending month-over-month
- Settlement amount trends

Trends are computed at view time by comparing the current snapshot against prior stored snapshots — they are not stored separately.

## Regeneration

If a user edits line items for a previously reported month:
- The existing snapshot becomes stale
- User triggers regeneration, which recomputes and replaces the stored snapshot
- Trend data for other months that reference this snapshot will reflect the updated values on next view

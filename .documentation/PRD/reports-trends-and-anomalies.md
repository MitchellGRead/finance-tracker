# PRD: Reports — Trend UX, Run Rate, Anomalies

## Problem

Reports exist to show **patterns**: what the household spends, its run rate,
and how that trends. The Spending Trend chart (PR #7) is the core of this, but:

- Legend chips only toggle a series off. To study one category you must turn
  off every other one.
- There is no single "what is the household operating at" number.
- Nothing points out an unusual month or charge; the operator has to spot it
  (e.g. Sep 2026: Shambhala $2,101 and an ICBC renewal $1,261).

The existing report content (breakdowns, per-person spend, line items) stays;
these are additions.

## Requirements

### R1. Trend chart — isolate-then-add legend

- With all series visible, **clicking a chip isolates it** (only that series
  shows; the y-axis rescales).
- While isolated, clicking another chip **adds** it; clicking a visible chip
  removes it.
- Removing the last visible series, or **"Show all"**, restores every series.
- Colour follows the entity: isolating never repaints a series.
- Selection persists across household / per-person views where the series
  exist in both.

### R2. Run-rate tile

- A tile beside the total spend cards: **trailing 3-month average monthly
  spend** ending at the selected month, household and per person.
- Shows the selected month against it ("4% below run rate").
- Built from snapshots, consistent with the trend chart; months without a
  snapshot are excluded and the tile says how many months it used.
- Derived at view time — never stored in a snapshot (see the snapshot-vs-live
  principle in `household-month-lifecycle.md`).

### R3. Anomaly detection (deterministic, v1)

No AI. Two heuristics, thresholds as named constants:

| Anomaly | Rule (v1 defaults) |
|---|---|
| **Category spike** | Month's category total > 1.5× its trailing 6-month median **and** > $100 above it; needs ≥ 3 prior months |
| **Large one-off item** | Single accepted item > $250 **and** > 50% of its category's trailing monthly median (or the category has no history) |

- Shown on the Reports page as "Unusual this month" (subject, amount, vs
  typical), and as a count in the checklist strip.
- Each links to its line items in the workspace.
- **Dismissible**, with an optional note ("expected — tax payment"). A
  dismissal is keyed by month + kind + subject (category id or line item id)
  and stored in its own table, so regenerating the report or recomputing
  baselines doesn't resurrect it. Dismissed anomalies collapse into a "N
  dismissed" toggle rather than disappearing entirely.

## Solution approach

- R1 is client-only: replace `hidden: Set` in `SpendingTrend.tsx` with a
  visible-set model and isolate/add semantics.
- R2 computes from the existing `reports.trend` data.
- R3: new service `anomalies.ts` — category spikes from snapshots (same data
  the trend uses), large items from live accepted line items. Exposed as
  `reports.anomalies({ month, year })` plus `dismiss` / `undismiss`
  mutations. New table `anomaly_dismissals` (period_year, period_month, kind,
  subject_key, note, timestamps) via the usual generate → backup → migrate.
- Unit-tested against fixtures including the Sep 2026 and Apr 2026 (CRA)
  cases.

## System impact

- Client: `SpendingTrend.tsx`, `ReportsPage.tsx` (run-rate tile, anomalies
  card)
- Server: `services/anomalies.ts` + tests, `routers/reports.ts`, schema +
  migration
- Docs: `report-generation.md`, `ui-structure.md`, `data-model.md`

## Success criteria

- One click on a chip shows only that series; a second chip adds to it.
- Run-rate tile for Sep 2026 equals the mean of Jul–Sep household totals
  ($13,714).
- Sep 2026 flags Recreation and Car as spikes and Shambhala as a large item;
  Apr 2026 flags the CRA payment.
- A dismissed anomaly stays dismissed after regenerating the report.
- Typical months produce few anomalies (target ≤ 3 — tune thresholds against
  the live DB before shipping).

## Future

- Duplicate-looking charges (likely the next heuristic), missing recurring
  charge, new merchant above a threshold — decide after v1 is in use.
- Alternative report concepts (month ledger, narrative, category small
  multiples) — explored in the concept canvas, deferred.

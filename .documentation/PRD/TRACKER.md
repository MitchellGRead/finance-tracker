# Work Tracker

Issues broken out of the PRDs in this folder. One issue ≈ one PR. Check an
item off when its PR merges and add the PR number.

Status: `[ ]` todo · `[~]` in progress · `[x]` done

Design reference: concept canvas (private) —
https://claude.ai/artifact/NZ5wtxWpgxMwyLyRzHTBMd (Concept A + settle dialog
are the chosen direction).

## 1. Rules impact view — [rules-impact-view.md](./rules-impact-view.md)

No schema change. Independent of everything else; build first.

- [ ] **R-1 Coverage: conflicts + delete impact.** Extend `computeRuleCoverage`
      with `conflicts` (same-type equal-length ties, item count) and
      `affectedIfDeleted`. Tests.
- [ ] **R-2 Rules dialog: impact sort + "Needs attention".** Sort by `wins`;
      toggle with count; chips: No matches · Overshadowed (names + links the
      winning rule) · Conflict. Delete shows "changes N items".
- [ ] **R-3 Remove manual rule creation.** Drop the create form, type tabs and
      action filter from `RulesPanel.tsx`; remove `rules.create` if unused.
      Keep search and badge focus. Update `rule-engine.md`.

## 2. Reports — trend, run rate, anomalies — [reports-trends-and-anomalies.md](./reports-trends-and-anomalies.md)

- [ ] **T-1 Trend legend: isolate-then-add.** Click chip isolates; further
      clicks add/remove; "Show all"; selection persists across views.
      Client-only (`SpendingTrend.tsx`).
- [ ] **T-2 Run-rate tile.** Trailing 3-month average beside the spend cards,
      household + per person, "N% above/below"; notes months used.
- [ ] **T-3 Anomaly service.** `services/anomalies.ts`: category spike and
      large one-off item, thresholds as constants; `reports.anomalies` query.
      Fixtures: Sep 2026 (Recreation, Car, Shambhala), Apr 2026 (CRA). Tune
      against the live DB (target ≤ 3/month).
- [ ] **T-4 Anomaly dismissals.** `anomaly_dismissals` table (migration —
      back up first); `dismiss` / `undismiss` with optional note.
- [ ] **T-5 "Unusual this month" card.** List with View (→ workspace) and
      Dismiss; "Show N dismissed" toggle.

## 3. Household month lifecycle — [household-month-lifecycle.md](./household-month-lifecycle.md)

- [ ] **L-1 Month status service.** `services/monthStatus.ts`: per month
      counts, pending + uncategorized, live-vs-snapshot diff with plain-language
      summary; one query for all months. Tests incl. "bulk `updated_at` touch
      flags nothing".
- [ ] **L-2 Checklist strip + regenerate.** Imported → Reviewed → Reported →
      Settled strip on the Reports page with next actions; Regenerate and
      "Regenerate all outdated". Anomaly count from T-3.
- [ ] **L-3 Header month picker marks.** Stage glyph per month + warning mark.
- [ ] **L-4 Settlement schema + API.** `settlements`, `settlement_payments`,
      `settlement_months` (migration — back up first); create / delete / list /
      outstanding; adjustments + carry-forward computed live.
- [ ] **L-5 Settle dialog.** Pick open months (+ pending adjustments), require
      current reports, 1+ transfers (amount + date), difference carries
      forward.
- [ ] **L-6 Settlement card on report.** Month share (snapshot) beside live
      status ("Open · part of $X outstanding" / "Settled … in N transfers");
      outstanding balance.
- [ ] **L-7 Docs.** `report-generation.md` (snapshot-vs-live principle,
      staleness), new `settlement.md`, `data-model.md`, `ui-structure.md`.

## Suggested order

R-1 → R-2 → R-3 → T-1 → T-2 → T-3 → L-1 → L-2 → T-4 → T-5 → L-3 → L-4 → L-5 →
L-6 → L-7

## Later (not scheduled)

- Duplicate-looking charges anomaly; missing recurring charge; new merchant
- Bulk delete of flagged rules
- Matching settlements to imported e-transfers
- Alternative report concepts (month ledger, narrative, small multiples)

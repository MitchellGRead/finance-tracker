# Settlement

How the household records settling up, and how the outstanding balance is
derived. Two-person household assumed; N > 2 is out of scope.

## Model

- A **settlement** covers one or more months (plus every pending adjustment
  and any carried difference), records what was owed at settle time, and is
  paid by **one or more transfers** (amount + date). An e-transfer caps at
  $3,000, so a catch-up of several months is often several transfers.
- Settlement is **entered by hand**. E-transfers and card payments stay
  rejected in the workspace; nothing links a settlement to an imported line
  item (possible future work).
- Tables: `settlements`, `settlement_payments`, `settlement_months` — see
  [data-model.md](./data-model.md#settlement-tables).

## Settling (Reports → checklist → Settle…)

1. Pick open months. Default: every open month up to the one being viewed.
2. The server plans the settlement (`settlements.plan`, `planSettlement`):
   - each month's **share from its snapshot** — so every covered month's
     report must be **current**. A missing or outdated report blocks saving;
     the dialog offers "Generate N reports"
   - every **pending adjustment** on already-settled months
   - the **carried** difference from earlier settlements
   - the total and its direction (who owes whom)
3. Enter transfers (1+; none when nothing is owed, e.g. months of only
   personal spending). They may total more or less than owed — the
   difference carries forward.
4. `settlements.create` recomputes the plan server-side (the client never
   sends amounts owed) and saves it in one transaction.

**Undo** (`settlements.delete`) removes the settlement, its transfers and its
month rows; those months are open again and any adjustments it included are
pending again. Undoing a settlement that a *later* one adjusted leaves the
later adjustment rows in place; they count as already paid, so the reopened
month owes only `live − recorded` (its **due** share), not its full share.

## Signs

Internally, month status uses one canonical direction: positive = the
lower-id user owes the other. Stored rows are signed in their settlement's
from → to direction and converted when read.

## Adjustments (flag + carry forward)

Settled months are not frozen. If a settled month's **live** share later
differs from what was recorded, the month shows "Settled · $14 adjustment
pending". The next settlement includes it as an `is_adjustment` row for that
month; the recorded share then equals live again and the flag clears.

## Outstanding balance

```
outstanding = Σ due shares of open months      (live − anything already recorded for it)
            + Σ pending adjustments
            + (Σ all settlement_months.amount_owed − Σ all payments)   ← carried
```

The carried term clears itself: a later settlement's `amount_owed` includes
the carry-in, its transfers pay it, and its month rows don't — so recorded −
paid nets back to zero.

## Where it shows

- Checklist strip (Settled step) and header month picker (✓ glyph, ⚠ for an
  adjustment)
- Settlement tile: this month's share (snapshot) + "Open · part of $X
  outstanding (Apr – Sep)" or "Settled Oct 26 · covered Apr – Sep · paid in 3
  transfers" (live), and the overall outstanding balance
- Settlement card: transfers, over/under-payment, note, Undo

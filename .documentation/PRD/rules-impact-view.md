# PRD: Rules Impact View

## Problem

The Rules dialog holds 150 rules (61 split, 89 personal). Its controls — type
tabs, action filter, a manual "create rule" form — sort rules by what they
*are*. The operator never uses them. What matters is what each rule *does*:
how many items it decides, and which rules are dead weight or fighting each
other, so the rule set can be kept clean.

Rules are always created from the workspace (`+ Rule` / `Update Rule` on a
line item), never from the dialog, so the dialog's create form is unused
surface.

## Requirements

1. **Sort by impact.** Rules are ordered by the number of stored items they
   decide (`wins`), highest first. Each row shows that count.
2. **"Needs attention" toggle.** Shows only rules with at least one problem,
   each labelled with a reason chip:
   | Reason | Definition |
   |---|---|
   | **No matches** | Matches zero stored items. Highlighted, not necessarily wrong (e.g. a yearly charge) |
   | **Overshadowed** | Matches items but decides none — another, more specific rule wins on every one. The chip names the overshadowing rule(s) and links to them. The rule is doing nothing |
   | **Conflict** | Ties a same-type rule of equal normalized length on some item; first-created wins silently |
   A rule can carry several chips. The toggle shows the count of flagged rules.
3. **Delete from the list,** with a preview of the consequence: "Deleting
   changes N items". By definition N is 0 for overshadowed and no-match rules.
4. **Remove manual rule creation** from the dialog (form and its client
   mutation). Editing and deleting stay. Remove the `rules.create` procedure
   if nothing else calls it.
5. **Simplify filters:** drop the type tabs and action filter in favour of the
   impact sort + attention toggle. Keep the description search (paste a
   description → see matching rules) and the existing focus/scroll-to-rule
   behaviour from badges.
6. Coverage is computed across **all stored line items**, all months and
   statuses (unchanged from today).

## Solution approach

`computeRuleCoverage` (`packages/server/src/services/ruleCoverage.ts`) already
returns `matches`, `wins` and `beatenBy` per rule, which covers **no matches**
(`matches === 0`) and **overshadowed** (`matches > 0 && wins === 0`, named by
`beatenBy`). Extend it with:
- `conflicts`: rule ids it ties with (same type, same normalized length) and
  the item count
- `affectedIfDeleted`: items whose outcome (status / category) changes if the
  rule were removed — rerank without it

Reason chips are derived client-side from these fields; nothing is stored.

## System impact

- `services/ruleCoverage.ts` + tests
- `routers/rules.ts` — `coverage` output widens; drop `create`
- `client/src/components/RulesPanel.tsx` — remove create form, tabs, action
  filter; add sort, toggle, chips, delete preview
- `.documentation/SOP/rule-engine.md` — "Seeing which rule applies" section
- No schema change.

## Success criteria

- Opening the dialog, the top rows are the highest-impact rules.
- "Needs attention" lists exactly the rules matching the definitions above
  (the 7 current "never applies" rules appear as overshadowed;
  `FIX HEALTHCARE` is overshadowed by `FIX HEALTHCARE PAY`).
- Deleting an overshadowed rule changes zero items, verified by the preview.
- No way to create a rule from the dialog.

## Decided

- "Redundant" and "never applies" are one concept: **overshadowed**. No
  outcome comparison between the two rules.
- No bulk delete in v1 — revisit once the v1 UX shows how many flagged rules
  there typically are.

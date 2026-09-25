# Rule Engine

The rule engine auto-applies learned rules to line items during import. This is what makes the system "smarter over time."

## Rule Application Order

When a CSV is imported and line items are parsed, rules are applied in this order:

### 1. Accept/Reject Rules (per-user)
- Match line item description against the importing user's accept/reject rules
- Matching is case-insensitive substring matching
- If multiple rules match, **longest pattern wins** (most specific)
- Matched items get `status` set to `'accepted'` or `'rejected'`
- Items with no matching rule default to `'pending'`

### 2. Category Rules (global)
- Match line item description against all category rules
- Matching is case-insensitive substring matching
- If multiple rules match, **longest pattern wins**
- If multiple rules match with the **same length**, the first-created rule wins and the item is **flagged for review** (category conflict)
- Matched items get `category_id` set accordingly

### 3. Split Ratio Defaults
- If the assigned category has a `default_split_ratio`, apply it
- Otherwise, apply the global default: `0.5` (50%)

## Pattern Matching

All pattern matching uses **case- and whitespace-insensitive substring
containment**. Both sides are normalized first — whitespace runs collapse to a
single space and the text is lowercased — by `normalizeForMatch` in
`packages/shared/src/matching.ts`.

Example: Pattern `"THRIFTY FOODS"` matches:
- `"THRIFTY FOODS #9461 VIC VICTORIA"`
- `"thrifty foods downtown"`
- `"THRIFTY FOODS"`

### Why whitespace is normalized

Statement CSVs are fixed-width column dumps, so a description pads the merchant
away from the city:

```
"WISPR                   SAN FRANCISCO"
```

HTML collapses that whitespace, so the table shows `WISPR SAN FRANCISCO`, and
`suggestPattern` collapses it too when proposing a pattern. Without
normalization a pattern spanning the gap — `"WISPR SAN"` — looks correct in
every UI and never matches anything. The failure is silent: the rule exists,
the badge never appears, and the item stays pending.

Normalization happens **at compare time, not at write time**. Descriptions stay
verbatim as the bank sent them, and every already-stored pattern is repaired
without a data migration.

`normalizeForMatch` is shared because three places compare patterns and must
never disagree: `ruleEngine.ts` (applies them), `lib/lineItemRules.ts` (shows
which rule matched), and `RulesPanel.tsx` (search). `lineItems.acceptAndCreateRules`
uses `patternsAreEquivalent` for its dedupe check for the same reason.

An empty or all-whitespace pattern matches **nothing** — otherwise it would
match every description and hijack an entire import.

### Longest Match Resolution

If a description matches multiple patterns, the longest pattern wins because it is the most specific.

Example:
- Rule A: `"THRIFTY"` -> Groceries
- Rule B: `"THRIFTY FOODS"` -> Groceries
- Description: `"THRIFTY FOODS #9461"`
- Result: Rule B wins (13 chars vs 7 chars)

Length is measured on the **normalized** pattern, so padding cannot inflate a
rule's precedence.

### Conflict Handling

A conflict occurs when two category rules with the **same pattern length** match a description.

- The first-created rule (by `created_at`) wins and is applied
- The line item is flagged so the user can review in the UI
- The user sees both candidate categories and can choose

## Overrides

Users can override any auto-applied rule on a per-item basis:
- **Status override**: Manually accept a rejected item or reject an accepted item. Sets `status_override = true`.
- **Category override**: Change the category for a specific item. Sets `category_override = true`.
- **Split ratio override**: Change the split ratio for a specific item.

Overrides never change the underlying rule — they only affect the individual line item.

## Rule Creation

Rules are created implicitly through user actions:
- When a user categorizes a line item that had no category, the system can prompt to create a category rule
- When a user accepts/rejects a line item, the system can prompt to create an accept/reject rule
- Rules can also be managed directly through a rule management panel

## Relationship to AI Suggestions

Rules always win. The AI suggestion layer only fills gaps rules left:

- An item a rule has already accepted or rejected is never suggested on — it is
  no longer `pending`.
- A category a rule set makes that facet ineligible (`category_id` is non-null),
  even though the rule does not set `category_override`.
- A split a rule set makes that facet ineligible, detected by comparing the
  **value** against `GLOBAL_DEFAULT_SPLIT_RATIO` — `applyRulesToLineItems` writes
  `split_ratio` without setting `split_ratio_override`, so the flag alone would
  miss it.

Confirming a suggestion never sets an override flag, so rule re-application is
not blocked by an AI guess. The intended end state for a recurring merchant is a
real rule: the AI guesses once, the operator accepts and saves it as a rule, and
it never costs a token again.

See [ai-suggestions.md](./ai-suggestions.md).

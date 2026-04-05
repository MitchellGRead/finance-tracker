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

All pattern matching uses **case-insensitive substring containment**.

Example: Pattern `"THRIFTY FOODS"` matches:
- `"THRIFTY FOODS #9461 VIC VICTORIA"`
- `"thrifty foods downtown"`
- `"THRIFTY FOODS"`

### Longest Match Resolution

If a description matches multiple patterns, the longest pattern wins because it is the most specific.

Example:
- Rule A: `"THRIFTY"` -> Groceries
- Rule B: `"THRIFTY FOODS"` -> Groceries
- Description: `"THRIFTY FOODS #9461"`
- Result: Rule B wins (14 chars vs 7 chars)

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

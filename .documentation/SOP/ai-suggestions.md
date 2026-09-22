# AI Suggested Classification (TypeSafe Jev)

A second, softer automation layer beneath the rule engine. Rules always win;
suggestions only fill the gaps rules left.

## What it does

For a **pending** line item, Jev answers two questions:

1. Which of the **existing** categories does this belong to (or none)?
2. Is it **personal** to the cardholder, or **shared** by the household?

The answers are stored as *shadow* values in their own columns. They render as
ghost values in the category and split controls, and are materialized into the
real columns only when the item is accepted.

An unconfirmed suggestion can never move money: `computeReport` reads only
`status = 'accepted'` rows and only `category_id` / `split_ratio`.

## Model interface

- Model: `jev-latest` (`jev-1.13.0`), via `@typesafe-ai/sdk`.
- One request per line item — state differs per item. The batching win is taken
  *within* each request: both questions share one state and run in parallel.
- Because parallel questions cannot see each other's answers, the dependency
  between category and split ratio is resolved in code, not by the model.

### Q1 `category` — Choice

Criteria keys are **synthetic**: `cat_<id>`, never the category name. Names are
arbitrary operator strings (spaces, quotes, emoji, case/unicode near-duplicates)
and would collide or break JSON. The human meaning goes in the description, with
up to five exemplar merchant descriptions per category.

A `none` option is always present so the model can decline rather than force a
weak match. Unrecognized keys — including a category deleted mid-flight — are
treated as `none`.

### Q2 `personalOrShared` — Choice

Choice rather than Noul: the outcomes are mutually exclusive alternatives, and
Choice returns a normalized `confidence`, so both suggestions share one
thresholding path and one column shape.

### Composing the split ratio

```
personal -> PERSONAL_SPLIT_RATIO (1.0)
shared   -> suggested category's default_split_ratio, else GLOBAL_DEFAULT_SPLIT_RATIO
```

The model picks only the binary. The *number* comes from `categories.default_split_ratio`.
The model is never allowed to propose an arbitrary percentage: it would silently
change real money, fight the per-category default mechanism, and `computeReport`
compares `splitRatio === 1.0` exactly.

## Exemplars

Built once per batch in `buildCategoryExemplars`. Descriptions are normalized
(uppercase, digits stripped, collapsed, truncated to 40 chars), grouped by
category, and ranked by **distinct-form frequency** with a recency tie-break.

Frequency rather than recency matters: raw descriptions repeat heavily, so
"5 most recent" yields five copies of one merchant and teaches the model nothing
about the category's breadth.

If the serialized criteria exceed `SUGGESTION_MAX_CRITERIA_CHARS`, exemplars
degrade 5 -> 3 -> 1 -> 0 rather than risking the 32k state+question ceiling.

## Eligibility

`suggestionEligibility(item, { force })`, in order:

| # | Rule | Effect |
|---|---|---|
| 1 | `status !== 'pending'` | neither facet — a rule already accepted/rejected it |
| 2 | `!force && suggestion_status !== null` | neither facet — already looked at |
| 3 | `category_id === null && !category_override` | category eligible |
| 4 | `!split_ratio_override && split_ratio ≈ 0.5` | split eligible |
| 5 | neither eligible | **no API call at all** |

Rule 4 compares the **value**, not the flag. `ruleEngine.applyRulesToLineItems`
writes `PERSONAL_SPLIT_RATIO` or a category default *without* setting
`split_ratio_override`, so the flag alone would miss rule-decided splits.

Credits are not skipped — a refund to Groceries is still Groceries — but
`is_credit` is included in the state.

## Confidence

Thresholds are applied **at write time** (`interpretAnswers`): anything below
`SUGGESTION_CATEGORY_CONFIDENCE` / `SUGGESTION_SPLIT_CONFIDENCE` is stored as
`null`. Consequence: everything stored is displayable and confirmable, so
neither the client nor the confirmation path needs its own threshold logic.

The client renders one visual tier (`SUGGESTION_CONFIDENCE_TIER`, 0.75): below
it the ghost is dimmed. Exact percentages appear only in `title=` tooltips.

## Shadow state is derived, never stored

`hasShadowCategory` / `hasShadowSplit` (in `@finance-tracker/shared`) decide
whether a ghost is live. They are pure functions of the row.

This is the design's load-bearing choice: **a manual edit writes a real value,
which makes the predicate false, so the ghost disappears with no dismissal code
anywhere.** Seven write paths plus the rule engine would otherwise each need to
clear suggestions. The suggestion itself is retained, so we can later measure how
often the operator kept the model's guess.

An override flag always suppresses the suggestion: it means a human already
decided, and a ghost there would be arguing with the user.

## Confirmation

`confirmSuggestions(ids)` is called from every accept path:
`lineItems.update` (per-row status cycle), `lineItems.bulkUpdateStatus`, and
`lineItems.acceptAndCreateRules`.

It fills only empty slots, flips `suggestion_status` to `confirmed`, and is
idempotent.

**Override flags are deliberately left `false.`** They mean "a human decided
this". Setting them would (a) sweep AI rows into `clearOverrides`, which selects
*by* those flags, (b) make `reapplyRulesForPeriod` skip the row, so a real
learned rule would be blocked by an AI guess, and (c) make the client's `*`
marker lie. Provenance is carried by `suggestion_status` + `suggestion_model` +
`suggested_at` instead — strictly more informative than a boolean.

### Ordering in `acceptAndCreateRules`

Confirmation runs **before** the rule upsert, and the rule uses
`input.categoryId ?? item.categoryId`. The client sends the category it could
see, which is `null` when the category existed only as a shadow. Without the
reorder, a rule learned from an AI-suggested category would be created with
`category_id = null` and the learning loop — AI guesses once, operator accepts,
the guess becomes a deterministic rule that never costs a token again — would
silently break.

An explicit `ruleType: 'personal'` is written *after* confirmation, so the
operator's choice beats the model's.

## What clears a suggestion

| Trigger | Behavior |
|---|---|
| Manual category/split edit | nothing cleared — ghost hidden by the predicate |
| `clearItemOverrides` / `clearOverrides` | all 7 columns nulled |
| `suggestions.clear({ ids })` | all 7 columns nulled |
| `suggestions.generate({ force: true })` | overwritten in place |
| `categories.delete` | `suggested_category_id` nulled first (FK) |

`categories.delete` **must** null the column first: `foreign_keys` is ON, so a
category referenced only by a suggestion would otherwise refuse to delete.

## Triggers

- **Import** — `statements.upload` starts a detached background run after
  `applyRulesToLineItems`, returning a `suggestionRunId` the client polls. A
  200-item batch takes ~25s, far too long to hold a mutation open. Disable with
  `SUGGEST_ON_IMPORT=false`.
- **Manual** — the `✦ Suggest (n)` toolbar button, chunked 25 at a time and
  awaited sequentially (`httpBatchLink` would coalesce concurrent calls into one
  long request and lose the progressive reveal).

## Failure handling

| Condition | Behavior |
|---|---|
| No API key | feature inert; one startup warning; `generate` returns `disabled: true` |
| 401 / 403 | run aborts, reason recorded |
| 422 | no retry; the question *shape* is logged, never the payload |
| 429 / 5xx / network | retried by the SDK (honours `Retry-After`) |
| 5 consecutive failures | run aborts |
| Any per-item failure | that row keeps `suggestion_status = null`; the run continues |

**An import can never fail because inference failed.**

## Cost

~3k input tokens per item (exemplar criteria are ~80% of it) at $0.042/M input,
output free:

| Items | Cost |
|---|---|
| 100 | ~$0.013 |
| 200 | ~$0.025 |

Don't optimize the exemplars away — they are the whole quality story.

## Privacy

Merchant descriptions are sent to a third-party API. `redactDescription` masks
runs of six or more digits before anything leaves the machine; short store
numbers are left alone. The feature is off unless `TYPESAFE_API_KEY` is set.

## Cold start

With no accepted history there are no exemplars, so early suggestions lean
entirely on category names and the model's merchant knowledge. Expect noticeably
worse quality in month one — **do not tune the thresholds on that data.**

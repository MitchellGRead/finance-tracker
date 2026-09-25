# Data Model

All tables include `created_at` and `updated_at` timestamp columns.

## Core Tables

### users
Participants in the system. Not authenticated accounts — just named labels for data ownership and split calculations.

| Column | Type | Notes |
|--------|------|-------|
| id | integer (PK) | Auto-increment |
| name | text | Unique |

### statements
Represents a single uploaded CSV file.

| Column | Type | Notes |
|--------|------|-------|
| id | integer (PK) | Auto-increment |
| user_id | integer (FK -> users) | Who this statement belongs to |
| source_type | text | 'amex' or 'td' |
| file_name | text | Original filename |
| uploaded_at | text | ISO 8601 timestamp |
| period_month | integer | 1-12 |
| period_year | integer | e.g., 2025 |

### line_items
Individual transactions parsed from statements or added manually.

| Column | Type | Notes |
|--------|------|-------|
| id | integer (PK) | Auto-increment |
| statement_id | integer (FK -> statements) | Nullable for manual items |
| user_id | integer (FK -> users) | Owner of this line item |
| date | text | ISO 8601 date |
| description | text | Raw description from CSV |
| amount | real | Transaction amount |
| category_id | integer (FK -> categories) | Nullable if uncategorized |
| split_ratio | real | 0-1, user's share (e.g., 0.5 = 50%) |
| status | text | 'accepted', 'rejected', or 'pending' |
| status_override | integer | 0/1 — true if user manually changed status |
| category_override | integer | 0/1 — true if user manually changed category |
| split_ratio_override | integer | 0/1 — true if user manually changed the split |
| note | text | Nullable, user-provided |
| is_manual | integer | 0/1 — true if hand-added, not from CSV |
| is_credit | integer | 0/1 — true for refunds and credits |
| suggested_category_id | integer (FK -> categories) | Nullable — AI shadow value |
| suggested_category_confidence | real | Nullable, 0-1 |
| suggested_split_ratio | real | Nullable — AI shadow value |
| suggested_split_confidence | real | Nullable, 0-1 |
| suggestion_status | text | Nullable = never generated; 'shadow' \| 'confirmed' |
| suggestion_model | text | Nullable — model that answered, e.g. 'jev-1.13.0' |
| suggested_at | text | Nullable — ISO 8601 |

The `suggested_*` columns are shadow values: never read by reports, materialized
into `category_id` / `split_ratio` only when the item is accepted. See
[ai-suggestions.md](./ai-suggestions.md).

> Note: the rule tables documented below are out of date — `category_rules` and
> `accept_reject_rules` were merged into a single `rules` table in migration
> 0003. Only the `line_items` table above has been refreshed.

## Rules & Memory Tables

### categories
User-defined expense categories.

| Column | Type | Notes |
|--------|------|-------|
| id | integer (PK) | Auto-increment |
| name | text | Unique (e.g., "Groceries", "Dining Out") |
| default_split_ratio | real | Nullable — per-category default |

### category_rules
Maps description patterns to categories. Global (shared across all users).

| Column | Type | Notes |
|--------|------|-------|
| id | integer (PK) | Auto-increment |
| pattern | text | Substring to match (e.g., "THRIFTY FOODS") |
| category_id | integer (FK -> categories) | Target category |
| created_by_user_id | integer (FK -> users) | For conflict tracking |

### accept_reject_rules
Per-user rules for auto-accepting or rejecting line items by description pattern.

| Column | Type | Notes |
|--------|------|-------|
| id | integer (PK) | Auto-increment |
| user_id | integer (FK -> users) | Rules are per-user |
| pattern | text | Substring to match |
| action | text | 'accept' or 'reject' |

## Report Tables

### report_snapshots
Stored monthly report summaries.

| Column | Type | Notes |
|--------|------|-------|
| id | integer (PK) | Auto-increment |
| period_month | integer | 1-12 |
| period_year | integer | e.g., 2025 |
| generated_at | text | ISO 8601 timestamp |
| data | text | JSON blob with full summary |

The `data` JSON blob contains:
- Per-category totals (all users combined)
- Per-user breakdown by category
- Split calculations and net amounts owed
- Metadata for trend comparisons

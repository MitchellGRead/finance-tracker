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
| note | text | Nullable, user-provided |
| is_manual | integer | 0/1 — true if hand-added, not from CSV |

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

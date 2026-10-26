# UI Structure

Two-page layout. Minimal navigation — most work happens on a single page.

## Page 1: Workspace (Primary)

The main operational page. Everything related to importing, reviewing, and editing line items lives here.

### Layout
- Top bar: page navigation (Workspace / Reports), month picker (popover), and
  actions — Import and Rules open dialogs; Users, Re-apply rules and Clear month
  live in the ⋯ menu
- Main content area: line items table, full width

### Statements Dialog (header "Import" button)
Two tabs. **History** lists every imported statement — file, user, dates
covered, rows remaining (and duplicates skipped at import), import date —
newest first; clicking one jumps to the month it ends in. "No rows" marks an
old failed import or a statement whose months were cleared.

**Import** tab:
- Dropzone taking any number of CSVs, any months and accounts
- Preview table, one row per file: detected institution and guessed user (both
  editable), date range, new rows, duplicates skipped, errors and possible
  duplicates
- "Import all" — one transaction for the batch, then rule application and AI
  suggestions. See [csv-formats.md](./csv-formats.md) for detection and dedupe

### Line Items Table
The central UI element. Displays all line items for the selected month.

**Columns:**
- Status indicator (accepted/rejected/pending) — clickable to toggle
- Date
- Description
- Amount
- Category — inline dropdown to assign/change
- Split ratio — inline editable (percentage)
- Note — inline editable
- Override indicators (icons showing if status or category was manually overridden)

**Features:**
- Filter by: user, status, category, flagged
- Sort by: date, amount, description, category
- Bulk actions: accept all pending, reject selected
- Flagged items (category conflicts) surfaced at the top with visual highlight
- Add manual line item row

### Rule Management (Sidebar/Panel)
- View and manage category rules (pattern -> category mapping)
- View and manage accept/reject rules (per-user, pattern -> action)
- Delete or edit existing rules

### Action Bar
- "Generate Report" button for the selected month/year

## Page 2: Reports & Trends

View generated monthly snapshots and historical trends.

### Layout
- Month comes from the header month picker (shared with Workspace); no
  separate calendar on this page
- Summary cards at top (total spending, settlement amount, line items +
  when the snapshot was generated)
- Spending Trend chart (below the cards, above everything else)
- Category breakdown table
- Per-user breakdown
- Settlement summary ("Mitchell owes Partner $X")
- Trend table comparing to prior months

### Spending Trend chart
- One line chart, one view at a time: Household, then one tab per user.
  A person's view is what was accepted on *their* statements (`byCategory`
  totals), not their effective share
- Lines: Total plus the top 7 categories, the rest folded into "Other".
  Categories are ranked on household spend over the whole range, so a
  category keeps its colour in every view (`--series-1..7` in `app.css`,
  fixed order, CVD-validated)
- Legend chips toggle lines and rescale the y-axis (turn Total off to read
  the categories)
- Hover shows every value for that month; click a month to open its report
- Built from report snapshots (`reports.trend`), so it matches the reports
  below it. A month with no generated report is a gap, not zero — regenerate
  a month to update its point

## Design Principles
- Clean, modern look using shadcn/ui components and Tailwind
- Dense but readable — financial data benefits from information density
- Inline editing wherever possible — avoid modal popups for simple changes
- Visual hierarchy: flagged/pending items are prominent, accepted items are subdued
- Responsive but desktop-first — this is used on a computer, not a phone

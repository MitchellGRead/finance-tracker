# UI Structure

Two-page layout. Minimal navigation — most work happens on a single page.

## Page 1: Workspace (Primary)

The main operational page. Everything related to importing, reviewing, and editing line items lives here.

### Layout
- Top bar with page navigation (Workspace / Reports) and month/year selector
- Main content area: line items table
- Sidebar or collapsible panels for import and rule management

### Import Panel
- File upload dropzone
- Source type selector (American Express / TD)
- User assignment dropdown
- Import button — triggers parse, rule application, and insert

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
- Top bar with navigation and month selector
- Summary cards at top (total spending, settlement amount)
- Category breakdown table/chart
- Per-user breakdown
- Settlement summary ("Mitchell owes Partner $X")
- Trend section comparing to prior months

### Month Selector
- Dropdown or timeline showing months with generated reports
- Quick navigation between periods

### Trend Charts
- Line/bar charts showing spending by category over time
- Total spending trend line
- Settlement amount over time

## Design Principles
- Clean, modern look using shadcn/ui components and Tailwind
- Dense but readable — financial data benefits from information density
- Inline editing wherever possible — avoid modal popups for simple changes
- Visual hierarchy: flagged/pending items are prominent, accepted items are subdued
- Responsive but desktop-first — this is used on a computer, not a phone

# Finance Tracker & Splitter

A household finance tracking application for two (or more) individuals to import credit card statements, categorize expenses, define cost-splitting ratios, and generate monthly summaries with trend tracking.

## Overview

This system solves the problem of managing shared household finances across multiple credit cards and statement formats. One person operates the system — uploading statements for all participants, reviewing line items, and generating reports.

The system gets smarter over time: categorization rules, accept/reject rules, and split ratio defaults are remembered and auto-applied to future imports. After a few months of use, importing a new statement requires minimal manual intervention.

## Core Features

### Statement Import
- Upload CSV files from American Express and TD (different formats handled automatically)
- Assign each upload to a named participant
- Auto-apply learned rules on import (categories, accept/reject, split ratios)

### Line Item Management
- Review all imported items in a filterable, sortable table
- Accept or reject individual line items
- Set categories, split ratios, and notes per item
- Add or remove line items manually
- Override any auto-applied rule on a per-item basis

### Smart Categorization
- Map statement descriptions to categories using pattern-based rules
- Rules are global (shared across all users) with longest-match resolution
- Category conflicts flagged for review (first-created rule wins)
- Per-item category overrides don't change the underlying rule

### Smart Suggestions (AI)
- Pending, uncategorized items get a suggested category and a personal/shared
  call from TypeSafe's Jev model
- Suggestions render as ghost values you can accept, change, or ignore; they are
  applied when you accept the line item
- Suggests only from categories that already exist — never invents new ones
- Off unless `TYPESAFE_API_KEY` is set. Costs roughly $0.02 per statement import
- **Sends merchant descriptions to a third-party API** (long digit runs are
  masked first)

### Cost Splitting
- Global default split ratio: 50/50
- Per-category default split ratios (e.g., Groceries always 60/40)
- Per-item split ratio overrides for one-off adjustments

### Accept/Reject Rules
- Per-user rules to auto-accept or auto-reject specific descriptions
- Pattern-based matching (e.g., reject "PAYMENT - THANK YOU" for a specific user)
- Per-item overrides to manually accept a normally-rejected item (and vice versa)

### Monthly Reports
- Snapshot-based reports generated on demand for a given month
- Category breakdown combined across all participants
- Split payment summary: who owes whom and how much
- Trend tracking across prior monthly snapshots

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Hono + TypeScript |
| Communication | tRPC |
| Database | SQLite + Drizzle ORM |
| Monorepo | pnpm workspaces |

## Setup

### Prerequisites
- Node.js 20+
- pnpm 9+

### Installation

```bash
pnpm install
```

### Environment

```bash
cp packages/server/.env.example packages/server/.env
```

The file must live in `packages/server/` — paths in it are resolved relative to
that package, which is where the server runs. Everything has a working default
except `TYPESAFE_API_KEY`; leave it blank to run without AI suggestions.

### Development

```bash
pnpm dev
```

This starts both the client (Vite dev server) and the server (Hono) concurrently.

### Database

```bash
pnpm db:generate       # Generate a migration from the schema
pnpm db:migrate        # Apply pending migrations
pnpm db:repair-ledger  # Diagnose/repair a drifted migration ledger
```

Back up the database before migrating — `backups/` is gitignored. Never edit a
migration file once it has been applied: the ledger stores a hash of its
contents, so even a comment change makes drizzle try to replay it.

Drizzle decides what to apply by hashing each file in `drizzle/` and looking the
hash up in the `__drizzle_migrations` table. If a migration is ever applied by
hand, the schema moves but the ledger does not, and the next `db:migrate` tries
to replay it against a schema that has already changed. `pnpm db:repair-ledger`
reports that gap; `pnpm db:repair-ledger --apply` closes it by recording the
missing migrations as applied. It only writes ledger rows — it never runs SQL,
so use it only when the database already contains those changes.

## Project Structure

```
packages/
  client/       React SPA — Workspace and Reports pages
  server/       Hono API — tRPC routers, CSV parsers, rule engine, report generation
  shared/       Shared TypeScript types and constants
```

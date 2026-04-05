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

### Development

```bash
pnpm dev
```

This starts both the client (Vite dev server) and the server (Hono) concurrently.

### Database

```bash
pnpm db:generate   # Generate migrations from schema
pnpm db:migrate    # Apply migrations
```

## Project Structure

```
packages/
  client/       React SPA — Workspace and Reports pages
  server/       Hono API — tRPC routers, CSV parsers, rule engine, report generation
  shared/       Shared TypeScript types and constants
```

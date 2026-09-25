# Finance Tracker & Splitter — Project Conventions

## Tech Stack

- **Language**: TypeScript (strict mode) throughout
- **Frontend**: React 19 + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Hono (lightweight HTTP framework)
- **Client-Server Communication**: tRPC (end-to-end type safety)
- **Database**: SQLite + Drizzle ORM
- **Package Manager**: pnpm
- **Monorepo**: pnpm workspaces

## Project Structure

```
finance-tracker/
├── packages/
│   ├── client/          # React SPA (Vite)
│   ├── server/          # Hono API server
│   └── shared/          # Shared types, constants, enums
├── test/
│   └── test_data/       # Sample CSV files (Amex, TD)
├── .documentation/
│   └── SOP/             # Standard operating procedures
├── CLAUDE.md            # This file
└── README.md            # Product overview and setup
```

## Code Conventions

### TypeScript
- Strict mode enabled in all packages (`"strict": true`)
- No `any` types — use `unknown` and narrow
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use barrel exports (`index.ts`) in shared package only

### Database
- All tables must include `created_at` and `updated_at` timestamp columns
- Use Drizzle ORM for all database interactions — no raw SQL
- IDs are auto-incrementing integers
- Migrations managed through Drizzle Kit: `pnpm db:generate` then `pnpm db:migrate`
- **Never edit a migration file that has been applied** — not even a comment.
  The ledger stores a sha256 of the file's contents, so any change makes drizzle
  treat it as a new, unapplied migration and try to replay it.
- Back up the database before migrating (`backups/` is gitignored)
- If `db:migrate` tries to replay an old migration, the ledger
  (`__drizzle_migrations`) has drifted from `drizzle/meta/_journal.json` —
  usually because a migration was applied by hand. Run `pnpm db:repair-ledger`
  to see the gap and `--apply` to close it. It writes ledger rows only; it never
  runs SQL, so the schema must already match.

### API
- All client-server communication goes through tRPC routers
- Routers organized by domain: `lineItems`, `categories`, `reports`, `statements`, `users`, `rules`, `suggestions`
- Input validation via Zod schemas on tRPC procedures
- `lineItems.update` blind-spreads its input into `.set()` — the Zod schema is
  the only thing keeping it safe. Never widen it to server-owned columns.

### Frontend
- shadcn/ui for base components, Tailwind for custom styling
- Two-page layout: Workspace (primary) and Reports
- Keep pages self-contained — minimal routing complexity
- Use tRPC React Query hooks for data fetching

### Configuration
- `process.env` is read **only** in `packages/server/src/lib/config.ts`
- `.env` lives in `packages/server/`, not the repo root (paths are cwd-relative)
- Secrets stay server-side; the client learns whether a feature is on via a
  tRPC query, never the key itself

### Rules
- Pattern matching is case- **and whitespace-**insensitive; both sides go through
  `normalizeForMatch` (`packages/shared/src/matching.ts`). Statement descriptions
  are fixed-width dumps (`"WISPR                   SAN FRANCISCO"`) but every UI
  collapses that whitespace, so a raw `includes()` fails silently on patterns the
  operator sees as correct. Never compare a pattern to a description directly.
- See `.documentation/SOP/rule-engine.md`

### AI suggestions
- TypeSafe Jev suggests a category and personal/shared for pending items
- Suggestions are *shadow* values, materialized only on accept; rules always win
- Whether a ghost is live is **derived** (`hasShadowCategory`/`hasShadowSplit` in
  `shared`), never stored — a manual edit hides it with no dismissal code
- Confirming a suggestion never sets an override flag (those mean "a human
  decided"); provenance lives in `suggestion_status`/`suggestion_model`
- See `.documentation/SOP/ai-suggestions.md`

### General
- No authentication — users are named participants, not authenticated accounts
- Single operator model — one person uses the system at a time
- Financial amounts stored as `real` (floating point) — acceptable for household tracking
- Dates stored as ISO 8601 strings in the database

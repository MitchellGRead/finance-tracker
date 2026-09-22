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
- **Migrations are hand-written.** `drizzle/meta/` has snapshots only for
  `0000`/`0001` while the journal has five entries, and `__drizzle_migrations`
  records only the first two. `drizzle-kit generate` would emit a destructive
  diff and `drizzle-kit migrate` fails. Write the `.sql`, add a journal entry,
  apply with `sqlite3`, and back up the db first.

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

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
- Migrations managed through Drizzle Kit
- IDs are auto-incrementing integers

### API
- All client-server communication goes through tRPC routers
- Routers organized by domain: `lineItems`, `categories`, `reports`, `statements`, `users`
- Input validation via Zod schemas on tRPC procedures

### Frontend
- shadcn/ui for base components, Tailwind for custom styling
- Two-page layout: Workspace (primary) and Reports
- Keep pages self-contained — minimal routing complexity
- Use tRPC React Query hooks for data fetching

### General
- No authentication — users are named participants, not authenticated accounts
- Single operator model — one person uses the system at a time
- Financial amounts stored as `real` (floating point) — acceptable for household tracking
- Dates stored as ISO 8601 strings in the database

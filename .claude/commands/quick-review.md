# Quick Code Review

Perform a fast, peer-review style code check focusing on semantic correctness and SOP compliance. This is designed for rapid iteration during development—concise feedback on immediate implementation details.

## Approach

1. **Identify scope**: Check `git diff --cached` for staged changes, or `git diff` for unstaged changes. If user specifies files, review those instead. **If no changes found, respond: "No changes to review. Stage changes with `git add` or specify files to review."**

2. **Read relevant documentation** based on code changes:

   **Always review:**
   - `.documentation/SOP/service-and-repo-layers.md` - Architecture, layering, error handling
   - `.documentation/SOP/testing-strategy.md` - Testing patterns, mocking strategy
   - `.documentation/SOP/linting-standards.md` - Code style, imports, TypeScript rules

3. **Quick semantic scan**: Check code against documentation standards (in priority order)
   - **Security issues** (hardcoded secrets, missing validation) - ALWAYS flag
   - **Architecture violations** (layering, result types, context patterns) - ALWAYS flag
   - TypeScript issues (any types, exports, imports)
   - Error handling patterns (services vs repos)
   - Testing anti-patterns (mocking wrong layer, missing cleanup)
     - Exception: Integration tests in `tests/integration/**` use real DB, not mocked repos
   - Database patterns (Drizzle usage, transactions)
   - Neo4j patterns (UUID constraints, idempotency, derived database philosophy)
   - Agent patterns (if applicable)

4. **Provide bullet-point feedback**: Keep it brief and actionable
   - Flag violations with `file:line` references
   - Reference the relevant documentation file and section
   - Suggest quick fixes where applicable
   - No praise or lengthy explanations—just what needs attention

## Files to Skip

Automatically skip review for these patterns (unless user explicitly requests or security concern):
- `node_modules/**` - Dependencies
- `dist/**` - Build output
- `coverage/**` - Test coverage reports
- `supabase/migrations/**/*.sql` - Generated database migrations
- `*.lock`, `package-lock.json`, `yarn.lock` - Dependency lock files
- `.env*` (except `.env.example`) - Environment files

## Output Format

**If issues found:**
```
Quick Review Feedback:

Architecture:
- service.ts:42 - Service throwing error instead of returning ServiceResult<T>
  Ref: .documentation/SOP/service-and-repo-layers.md (Service Error Handling)

- route.ts:15 - Route calling repository directly
  Ref: .documentation/SOP/service-and-repo-layers.md (Routes must call services only)

TypeScript:
- handler.ts:23 - Using `any` type
  Ref: .documentation/SOP/linting-standards.md (TypeScript standards)

- utils.ts:8 - Default export used
  Ref: .documentation/SOP/service-and-repo-layers.md (Named exports only)

Testing:
- service.test.ts:30 - Service is mocked, should mock repository instead
  Ref: .documentation/SOP/testing-strategy.md (Mock at boundaries)

Security:
- config.ts:12 - Hardcoded API key
  Ref: .documentation/SOP/environment-configuration.md (Use env vars)
```

**If no issues:**
```
No issues found. Code follows SOP guidelines.
```

## Key Principles

- Fast and focused—don't over-analyze
- Semantic and architectural correctness over style nitpicks
- Reference specific lines for clarity
- Skip verbose explanations—developers know the SOPs
- If ESLint/Prettier would catch it, skip it (assume linting runs separately)

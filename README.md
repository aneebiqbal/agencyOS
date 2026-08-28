# Agency OS (MVP Boilerplate)

Agency OS is an internal business automation platform starter for agencies that need one system for:

- Sales pipeline -> project conversion
- Project delivery and budget management
- Time tracking and expenses
- Invoicing lifecycle (no direct payout automation)
- Finance summary dashboards
- Payroll provider read-only summaries
- Performance metrics and immutable audit logging

## Important Scope and Safety Notes

- Payroll tax calculation and statutory logic are intentionally **not** implemented in this repository.
- No direct money disbursement (payroll/reimbursements/refunds) is implemented.
- Payroll data here is summary-level and read-only, intended to sync from providers like Gusto/Deel/Rippling.
- Seed records in memory are explicitly labeled test data and must not be used as production records.

## Tech Stack

- Next.js 16 App Router + TypeScript strict mode
- Tailwind CSS
- Zod for API boundary validation
- Vitest for unit + integration tests
- Supabase-style SQL migrations on Postgres
- `pg` connection pool for API runtime
- In-memory fallback only when `DATABASE_URL` is not set (test convenience)

## Project Layout

- `src/app/api/*`: Route handlers with validation, RBAC, and error handling
- `src/lib/domain/*`: Business rules and domain constraints
- `src/lib/services/*`: Legacy in-memory service implementations
- `src/lib/persistence.ts`: Active persistence facade (Postgres first, memory fallback)
- `src/lib/db/postgres.ts`: pooled Postgres access + actor context for RLS
- `supabase/migrations/*`: versioned up migrations
- `supabase/migrations_down/*`: paired down migrations for rollback
- `db/seed/test_seed.sql`: explicit test-only seed data
- `db/schema.sql`: schema reference snapshot
- `tests/*`: Unit and route integration tests

## Auth Assumption (MVP)

Current route handlers use request headers:

- `x-user-id`
- `x-user-role` (`owner | finance | manager | employee`)

Replace this with Supabase Auth or Clerk in production.

## Security Controls Included in Boilerplate

- API-layer validation on all input payloads and query strings
- Server-side RBAC checks on all route handlers
- IDOR defenses via resource-level access checks (project membership/role scope)
- Write endpoint rate limiting (in-memory)
- Append-only audit log entries on financial/HR writes
- Money represented as integer cents only
- UTC timestamps only for storage and comparisons
- Soft-delete fields on all financial/HR tables for historical integrity
- DB-level CHECK constraints mirror app-layer validation
- RLS enabled and forced on financial/HR tables

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database Migrations

```bash
# requires DATABASE_URL
npm run db:migrate
```

Down migration support:

```bash
npm run db:migrate:down
```

Test seed (never production):

```bash
npm run db:seed:test
```

## Tests

```bash
npm run test
```

Postgres-backed run:

```bash
DATABASE_URL="postgresql:///agency_os_test" npm run db:migrate
DATABASE_URL="postgresql:///agency_os_test" npm run test
```

Includes:

- Unit tests: invoice calculations, lead stage transitions, RBAC checks
- Integration tests: one or more tests per API route including valid, invalid input/permission, and unauthorized scenarios
- Postgres-only security tests (auto-skipped when `DATABASE_URL` is absent):
  - RLS bypass attempt returns no rows
  - audit log update attempt fails
  - transaction rollback on forced mid-transaction failure

## Rollback Plan

- Up migrations live in `supabase/migrations` and are applied in timestamp order.
- Down migrations live in `supabase/migrations_down` with matching timestamps.
- Rollback process:
  1. Pause writes.
  2. Snapshot database.
  3. Run `npm run db:migrate:down` for the target release.
  4. Verify schema + critical invariants (RLS policies, constraints, audit immutability).
  5. Resume writes.

Note: for production rollbacks on financial systems, snapshot/restore safety checks are mandatory even with down migrations.

## Implemented MVP Modules

- Sales: `GET/POST /api/leads`, `POST /api/deals/:dealId/win`
- Projects: `GET /api/projects`, `PATCH /api/projects/:projectId/budget`
- Time: `POST /api/time-entries`
- Expenses: `POST /api/expenses`
- Invoicing: `POST /api/invoices/generate`
- Finance: `GET /api/finance/summary`
- Payroll: `GET /api/payroll/runs` (read-only)
- Performance: `GET /api/performance/snapshots`
- Audit: `GET /api/audit-logs`

## Phased Build Continuation

1. Replace header auth with production auth provider and map identity to DB actor context
2. Add queue/retry workers for invoice delivery and webhook ingestion
3. Add human approval gates for invoice send/reimbursement release
4. Add provider integration clients (Gusto/Deel/Rippling) for summary sync
5. Add observability stack (OpenTelemetry + log shipping + alerting)

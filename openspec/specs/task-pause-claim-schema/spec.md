# task-pause-claim-schema Specification

## Purpose
TBD - created by archiving change route-pi-agent-tools-through-api. Update Purpose after archive.
## Requirements
### Requirement: `task` table carries pause and claim columns

The `task` table SHALL have nullable columns `paused_reason text`, `claimed_by text`, and `claimed_at timestamp` so that the Drizzle-typed `INSERT INTO task` statement generated from `apps/api/src/database/schema.ts` succeeds against the database the API process is connected to.

#### Scenario: API inserts a row into `task` without 42703

- **WHEN** any API code path inserts a row into `task` (e.g., `POST /api/task/:projectId`, the `createTask` controller, the chat `create_task` tool)
- **THEN** PostgreSQL accepts the statement
- **AND** no `42703 column "..." of relation "task" does not exist` error is returned

#### Scenario: existing rows are unchanged

- **WHEN** the migration runs against a database that already has data in `task`
- **THEN** every existing row keeps its current values
- **AND** the new columns are `NULL` on every existing row

#### Scenario: columns are nullable with no default

- **WHEN** the migration is applied to a fresh database
- **THEN** the three columns exist
- **AND** each column allows `NULL`
- **AND** no `DEFAULT` clause is applied
- **AND** no check, unique, or foreign-key constraint is added by this migration


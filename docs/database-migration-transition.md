# Database migration transition

## Current decision

Wander Growth remains `db:push`-managed for now. The Vercel build runs the
application build first and `drizzle-kit push` last. Do not add `--force` or make
destructive schema changes through that unattended build step.

This document records how to move to checked-in migrations when the team chooses
to make that cutover; it does not change today's deployment behavior.

## Current state to reconcile

- Drizzle manages both the `public` and `leads` Postgres schemas through
  `schemaFilter`.
- There is no usable checked-in migration chain.
- `drizzle/meta/_journal.json` references `0000_add-x-tiktok-ads`, but its SQL
  migration and snapshot are not present. It is generator residue, not a baseline
  that can be deployed.
- The live database has been shaped by repeated `db:push` runs and may contain
  structures not represented by a fresh migration generated from the current
  TypeScript schema.
- Existing Growth documentation says development and production share the same
  Neon database. Confirm the actual Vercel/Neon topology before any cutover; a
  shared database removes the safe rehearsal lane.

## Preconditions

1. Choose the canonical schema at a quiet point on `main`.
2. Confirm which Neon database/branch each of Development, Preview, and
   Production uses.
3. Create a clone/branch of Production for rehearsal and rollback inspection.
4. Inventory both `public` and `leads`, including tables, columns, enums,
   constraints, indexes, extensions, and any manual objects outside Drizzle.
5. Reconcile TypeScript schema versus live DDL explicitly; do not let the first
   migration silently choose which side wins.

## Cutover phases

### 1. Establish the baseline

- Remove the incomplete journal only as part of the migration-cutover change.
- Generate a full `0000_growth_baseline` SQL migration and snapshot from the
  reconciled schema.
- Review the full SQL and prove it creates a fresh database matching the intended
  `public` and `leads` schemas.
- Add a one-time baseline command that verifies an existing database against the
  snapshot before recording migration 0000 as already applied.

### 2. Rehearse

- Apply the full chain to an empty Neon branch.
- Baseline a Production clone without executing migration 0000's create-schema
  SQL.
- Generate and apply a small representative migration after the baseline.
- Verify application build, cron routes, webhook processing, and lead syncs
  against the migrated clone.

### 3. Change deployment

- Replace the final `drizzle-kit push` in `build` with `drizzle-kit migrate`.
- Baseline every persistent existing environment before deploying that change.
- Keep the migration after the successful application build so a compilation
  failure cannot advance the database.
- Use expand/contract migrations because the previous application version keeps
  serving while the new deployment builds.

### 4. Add enforcement

- Require schema changes and their generated SQL/snapshot changes in the same PR.
- Run `drizzle-kit check` in CI.
- Apply the full migration chain to a clean ephemeral database in CI.
- Never rewrite an applied migration; add a corrective migration.
- Give schema-bearing Preview branches isolated Neon branches, or prevent
  arbitrary Preview builds from advancing a shared journal.

## Signals that should trigger the move

Move from push to migrations before any of these changes:

- a column/table rename or type conversion;
- a data backfill coupled to a schema change;
- a destructive removal;
- concurrent schema work across branches;
- a table whose loss or partial migration would interrupt lead/webhook/CRM
  processing;
- another build blocked by an interactive Drizzle prompt or partial push.

Until then, keep changes additive, inspect every push prompt, and use a database
backup/branch before non-trivial schema work.

# Database migration transition

## Current decision

Wander Growth is `db:push`-managed, with a production-build backstop
(2026-08-18, Kristian): `bun run build` runs `drizzle-kit push` when
`VERCEL_ENV=production`, so a forgotten manual push is applied at deploy
instead of leaving code that reads columns the database does not have. The
guard matters because previews share the production database — an unmerged
branch's schema must not land at preview-build time. Manual push from a
current `dev` checkout remains the deliberate path.

**`--force` is on, reversing the 2026-08-18 rule (Kristian, 2026-09-11).** The
old rule said never add it, on the reasoning that a destructive diff would
then fail the production build loudly. It never did. The script was
`[ "$VERCEL_ENV" = production ] && drizzle-kit push || true`, where `|| true`
was load-bearing for preview builds (the env test fails there and would
otherwise abort the build) and also swallowed every push failure. Because
drizzle-kit answers a dropped or renamed table with an interactive prompt and
the Vercel builder has no TTY, such a diff threw
`Interactive prompts require a TTY terminal`, `|| true` hid it, and the build
went green having applied NOTHING — push aborts while resolving the diff, so
additive changes in the same deploy were skipped too. Seen on the v1.0.66
deploy (2026-09-11), which shipped with no `launch` table; it existed only
because `db:apply:launch` had been run by hand first. Worse, the orphaned
tables re-armed the prompt on every later deploy, silently disabling all
auto-migration until they were dropped.

So the script is now an `if`/`else` (a non-production build skips and exits 0,
a failing production push fails the build) with `--force`. A drop we intended
is applied; we generally DO want the data loss when a table leaves the schema.

⚠️ **The case `--force` gets wrong is a RENAME.** drizzle-kit cannot tell a
rename from a drop-plus-create, and `--force` resolves that ambiguity as drop
plus create, which loses the column's or table's data. Renames are rare here.
When you do one, drive it yourself before merging: run `bunx drizzle-kit push`
locally from a current `dev` checkout, where there IS a TTY, and answer the
rename prompt. Then the deploy's push sees no diff.

Development and production currently share the same database, so a local push
is a production migration. This document records how to move to checked-in
migrations when the team chooses that cutover.

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

- Add `drizzle-kit migrate` as an explicit release step; do not put schema
  mutation back into the application compilation command.
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

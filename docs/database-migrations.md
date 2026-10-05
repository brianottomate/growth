# Database migrations

Growth uses Drizzle Kit to generate and apply committed SQL migrations.
`src/server/db/schema.ts` exports the table definitions. `drizzle/` contains the
SQL files and Drizzle's generated snapshots and journal.

## Change the schema

1. Edit the relevant schema file and export any new domain through the barrel.
2. Run `bun run db:generate --name descriptive_name`.
3. Review the SQL, then commit it together with the generated `drizzle/meta/` files.
4. Run `bun run build` to build the app and apply pending migrations, or
   `bun run db:migrate` to apply them directly.

`db:migrate` runs `drizzle-kit migrate`. It reads `DATABASE_URL_DIRECT` when set,
otherwise `DATABASE_URL`, and records applied migrations in
`drizzle.__drizzle_migrations`. Confirm the selected database before running it.
Fresh databases run the complete history; existing tracked databases run pending
migrations. Production already records the initial migration as applied.

`0000_initial.sql` creates the current application schema, including the database
functions and triggers. The next schema change generates `0001_…`. Applied SQL,
snapshots and journal entries must not be edited or renumbered.

For functions, triggers or data changes that the TypeScript schema cannot express,
use `bun run db:generate --custom --name descriptive_name` and write the SQL in the
generated file. Keep `--> statement-breakpoint` between statements, not inside
function bodies. Drizzle's generator does not track function or trigger bodies.

## Checks and releases

`bun run db:check` generates into a temporary copy and fails if the schema differs
from its snapshot or generation fails. It runs in the normal check and build.
It does not compare against a live database. Drizzle's native migrator tracks
applied migrations; it does not enforce historical file checksums.

`MIGRATION_TEST_DATABASE_URL=postgres://…@127.0.0.1:5432/postgres bun run db:test`
rehearses the native CLI on a disposable PostgreSQL database: fresh install,
repeat execution with preserved data, trigger guards, and rollback on failed SQL.
The test creates and removes its own database and refuses non-local hosts.

The serialized production release job validates release inputs, installs locked
dependencies, and rehearses migrations on disposable PostgreSQL before requesting
a Vercel production deployment. GitHub Actions does not need production database
credentials.

The `build` script in `package.json` runs:

```sh
bun run db:check && bun run typecheck && next build && bun run db:migrate
```

Every successful local, preview and production build applies pending migrations
to its configured database. Development, preview and production currently share
the same database, so a migration takes effect across all environments as soon as
it commits. A failed build skips migrations; a failed migration fails the build.
Vercel uses this package script without a separate build-command override.
An instant rollback reuses an existing deployment and does not run the build
command or reverse migrations.

Keep changes compatible with the deployed app and other active branches. Build-time
queries must work against the schema before migration. Skew Protection pins app
versions, but those versions share the database. A deployment failure or app
rollback does not undo an applied migration.

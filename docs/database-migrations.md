# Database migrations and experiments

Local development and automatic Vercel previews connect to production by default.
`bun run dev` keeps that workflow. Local and preview builds do not apply migrations.

For experimental schema changes, use a disposable Neon branch and DB push. Generate
and review a committed migration once the design is settled, before merging the PR.

## One-time experiment setup

The repo includes a pinned Neon CLI. Authenticate an existing authorized profile
with `bunx neon auth`, or supply a project-scoped `NEON_API_KEY`. Do not create a
replacement project when access to Growth is missing.

The commands already target Growth's existing Neon project and its `production`
branch. No project linking or database env switching is needed. Optional overrides
in your gitignored local env or secret manager:

- `NEON_PROJECT_ID`: a different authorized project.
- `NEON_PRODUCTION_BRANCH`: its production branch name or ID, used as the parent.
- `NEON_PROFILE`: when Growth uses a named CLI profile.

The usual `DATABASE_URL` supplies the database name and role. The CLI retrieves
branch-specific credentials; none are written back to `.env`. Experiment previews
also need the Vercel CLI installed and authenticated for `wanderdev/growth`.

## Experiment

```sh
# Create/reuse experiment/booking-site and start a dev server against it.
bun run db:experiment booking-site

# After editing the TypeScript schema, apply it only to the disposable branch.
bun run db:push:experiment booking-site

# Push the schema, then deploy the current checkout as an experiment preview.
bun run preview:experiment booking-site

# Run another command against a branch instead of starting the dev server.
bun run db:experiment booking-site -- bun run db:studio

# Delete it when finished. New branches also expire after seven days.
bun run db:experiment:delete booking-site
```

All commands target `experiment/<name>` directly under the configured production
branch and reject default/protected branches. DB push automatically accepts changes,
including data loss, on that disposable copy only. It does not update migration files.
The copied database includes production data and delivery records. Branching does not
isolate Slack, email, Meta conversions, or other providers; use sandbox credentials or
avoid sends while experimenting.

The experiment preview is a separate explicit deployment of the current checkout.
Ordinary Git-triggered PR previews continue to use production. No Vercel integration
or changes to shared project environment variables are required. Both build and
runtime receive the branch's pooled/direct URLs and `DB_EXPERIMENT_BRANCH`.
Experimental builds retain type checking but skip the migration snapshot check,
because their schema comes from DB push. During iteration use `bun run typecheck`;
the normal PR check still requires a committed migration for schema changes.

## Settle the schema

1. Edit `src/server/db/schema.ts` or its exported domain files.
2. Run `bun run db:generate --name descriptive_name` once the design is settled.
3. Review and commit the SQL, snapshot and journal together.
4. Verify on a **fresh** production-derived branch:
   `bun run db:experiment verify-booking-site -- bun run db:migrate`.
5. Run the normal validation gates and release through the usual GitHub Release flow.

Do not rehearse migrations on a branch already changed by DB push: its migration
ledger still describes the parent's state. Deploy reviewed migrations to production;
do not promote or copy an experimental database over live data.

`db:migrate` runs `drizzle-kit migrate`, preferring `DATABASE_URL_DIRECT`, then
`DATABASE_URL_UNPOOLED`, then `DATABASE_URL`. It records applied migrations in
`drizzle.__drizzle_migrations`. It can still be run explicitly against the selected
database. Fresh databases run the full history; tracked databases run pending files.
Applied SQL, snapshots and journal entries must not be edited or renumbered.

For functions, triggers or data changes the TypeScript schema cannot express, use
`bun run db:generate --custom --name descriptive_name` and write SQL in that file.
Keep `--> statement-breakpoint` between statements, not inside function bodies.
Drizzle's generator does not track function or trigger bodies.

## Checks and releases

`bun run db:check` generates into a temporary copy and fails if the schema differs
from the latest snapshot. It does not compare against a live database. Drizzle's
native migrator tracks applied migrations but does not enforce historical checksums.

`MIGRATION_TEST_DATABASE_URL=postgres://…@127.0.0.1:5432/postgres bun run db:test`
rehearses the CLI on disposable local PostgreSQL: fresh install, repeated execution,
trigger guards, and rollback on failed SQL. It refuses non-local hosts.

The serialized production release job rehearses migrations before requesting a
Vercel production deployment. GitHub Actions needs no production DB credentials.
`bun run build` checks migration snapshots (except experiments), type-checks and
compiles. Only when `VERCEL_ENV=production` does it apply committed migrations after
compilation succeeds. A failed build skips migrations; a failed migration fails the
production build. A production build rejects an experiment override.

Keep changes compatible with the deployed app and active branches. Build-time queries
must work before migrations run. Schema experiments requiring new columns should use
an experiment dev server/preview until production has the corresponding migration.
An app rollback reuses an existing deployment and never reverses migrations or DDL.

References: [Neon CLI branches](https://neon.com/docs/cli/branches),
[Vercel deployment environment overrides](https://vercel.com/docs/cli/deploy).

## Parallel migration history

The Meta normalization preview and ad-review work both created migration index 7
before sharing a branch. Both applied SQL tags and timestamps remain in the journal;
the repeated historical index is intentional. The migrator orders by journal entries
and records timestamps/hashes, rather than using the numeric filename prefix as an
identity. The ad-review snapshots remain the active generator chain; the original
Meta snapshot is preserved unchanged in `drizzle/history/`. The removal is a new
forward migration after both applied histories.

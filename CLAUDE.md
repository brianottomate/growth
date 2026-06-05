# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Wander **Growth team back-office** app — an internal tool that unifies brand/content
operations, lead prospecting, lifecycle/outreach automation, and social listening. It
started from a T3 "Jetpack" SaaS template (hence leftover scaffolding like the org/team
auth model), but the live product is the growth tooling. Treat the README and any
"Jetpack starter template" language as historical — the demos and example `post` router
have been removed.

> Sibling repos and the wandercom monorepo layout are documented in `../CLAUDE.md`.
> This file is scoped to the `growth/` repo only.

## Commands

Package manager is **Bun** (not npm/yarn/pnpm).

```bash
bun dev                 # Next.js dev server (Turbopack)
bun run velite:dev      # Watch MDX/blog content (run alongside dev)
bun run email:dev       # Preview React Email templates

bun run check           # eslint + tsc --noEmit — run this before considering work done
bun run typecheck       # tsc --noEmit only
bun run lint:fix        # eslint --fix
bun run format:write    # prettier

bun run db:push         # Push schema to DB (dev iteration)
bun run db:generate     # Generate migration files
bun run db:migrate      # Apply migrations (production)
bun run db:studio       # Drizzle Studio
bun run db:seed         # scripts/seed.ts (seeded rows get isSeed=true)
bun run db:unseed       # Remove seeded rows

bun run build           # velite build + next build
```

There is no test runner configured. `bun run check` is the gate.

One-off scripts live in `scripts/` (run via `bun run scripts/<file>.ts`) and
`src/scripts/` (operational tooling, e.g. CIO sync/repair — see `cio:diagnose`/`cio:repair`).

## Stack

Next.js 16 (App Router, React 19) · tRPC v11 + TanStack Query (SuperJSON) · Drizzle ORM on
Neon Postgres · Better Auth (organization/admin/username plugins) · Tailwind CSS 4 + Radix ·
Velite for MDX · React Email + Resend · Vercel (deploy, Blob, Cron) · Vercel AI SDK +
Anthropic. Deployed on Vercel as the `wander/growth` project.

## Architecture

### tRPC

- Routers live in `src/server/api/routers/*.router.ts` and must be registered in
  `src/server/api/root.ts` (`appRouter`). Current routers: user, brand, channel, blob,
  newsletter, org, outreach, instantly, leads, reddit, twitter.
- Procedures (`src/server/api/trpc.ts`): `publicProcedure`, `protectedProcedure`
  (requires session), `adminProcedure` (admin in prod, unrestricted in dev).
- Context exposes `session`, `db`, and the Better Auth `authApi`.
- See the `trpc-patterns` skill for client/server usage conventions.

### Database schema — domain-split with a barrel constraint

Schema is split by domain under `src/server/db/`:

| File | Domain |
|------|--------|
| `auth-schema.ts` | Better Auth: user, session, account, verification + organization, member, team, team_member, invitation |
| `brand-schema.ts` | brand, brand_inspiration, access (Notion-style grants) |
| `channel-schema.ts` | channel (per-brand social/marketing channels) |
| `content-schema.ts` | series, content_post (planned/internal), platform_post (published, synced from platforms) |
| `ads-schema.ts` | initiative, campaign, ad_spot, audience |
| `leads-schema.ts` | **separate `leads` Postgres schema** — lead_domain, lead_contact, lead_import |
| `lifecycle-schema.ts` | lifecycle_campaign, lifecycle_touchpoint |
| `schema.ts` | attachment table + **barrel that re-exports every domain file** |

**Critical:** `schema.ts` must `export *` every domain file. `drizzle.config.ts` points at
`schema.ts`, and Better Auth does `import * as schema` — both only see tables re-exported
through the barrel. Adding a domain file without re-exporting it makes its tables invisible
to migrations and auth. When you add a domain schema file, add it to the barrel.

Other conventions:
- **snake_case** column casing (set via `casing: "snake_case"` in `drizzle.config.ts` and
  the db client). Use camelCase in TS; Drizzle maps it.
- IDs via `createId("prefix")` from `db/utils.ts` (e.g. `usr_`, `org_`, `att_`, `pst_`).
- `leads` lives in its **own Postgres schema** so it stays decoupled/droppable —
  `drizzle.config.ts` has `schemaFilter: ["public", "leads"]`; don't drop the filter.
- DB client (`db/index.ts`): HTTP-based `db` for normal queries; `withTransaction()` spins
  up a WebSocket pool for transactions. The exported schema is *augmented* with Better Auth
  model-name aliases (`user`, `session`, …) for its experimental joins feature.
- Tables that participate in sync carry an `isSeed` marker so `db:unseed` can strip seed data.

### Auth (Better Auth) — internal tool posture

- Config in `src/server/better-auth/config.ts`. Plugins: username, admin, organization.
- **Email verification is temporarily disabled** (`requireEmailVerification: false`,
  `sendOnSignUp: false`) so teammates sign in immediately. Comments mark how to restore it.
- Signup is gated to `@wander.com` emails; new users auto-join the Wander org. The anonymous
  plugin was removed.

### External integrations (`src/server/clients/`)

Each integration has a thin client; orchestration lives in `src/server/services/`.

- **Zernio** (`zernio.client.ts`) — social publishing/analytics. Wander doesn't compose in
  Zernio, so `/posts` is empty; the real list-posts endpoint is `/analytics?source=external`.
- **CustomerIO** (`customerio.client.ts`, `cio-content.ts`) — lifecycle/messaging. Workflow
  bridges in `cio-to-outreach-workflow.service.ts` and `outreach-to-cio-workflow.service.ts`.
- **Instantly** (`instantly.client.ts`) — cold-email projection of the leads system-of-record.
- **Outreach** (`outreach.client.ts`) — sales engagement (OAuth + webhooks).
- **HubSpot** (`hubspot.client.ts`) — CRM pull/merge/write-back for leads.
- **Apify / X / Twitter scraper / Reddit / Meta** — social listening & scraping.
- **BigQuery, Firecrawl, Minerva, Claude, PostHog, Slack, search providers** — supporting.

The leads pipeline is the system-of-record in Neon (`leads.*`); Instantly/HubSpot are
projections. Ingest via `scripts/ingest-leads.ts`; UI under `/app/leads`.

### Cron jobs (`vercel.json` → `src/app/api/cron/`)

- `/api/cron/meta` — daily 06:00 (Meta ads sync)
- `/api/cron/growth?job=daily_comprehensive_sync&...` — daily 03:00 (comprehensive CIO/lead sync)
- `/api/cron/reddit` — hourly (Reddit monitor)

Other API routes: `api/trpc`, `api/auth/[...all]`, `api/blob`, `api/webhooks`,
`api/instantly`, `api/outreach`, `api/workflows`, `api/og`, `api/admin`.

### Frontend

- `src/app/(marketing)/` — public pages (home, blog, brand, zernio, design-system, contact).
- `src/app/app/` — authed back-office (brands, content, leads, lifecycle, channels/feed,
  newsletters, pillars, dashboard, org, account, onboarding). Several `feed*` variants are
  in-progress prototypes.
- UI components in `src/components/ui/` are shadcn/Radix-based.
- **Styling bridge:** `src/styles/globals.css` maps wandercom design-system tokens
  (`@wandercom/design-system-*`) into shadcn variables. Theming is via a `data-theme`
  attribute, **not** a `.dark` class.

## Env

Validated in `src/env.ts` via `@t3-oss/env-nextjs` (add new vars there). Manage Vercel env
vars with the `vercel-env` skill; inspect deploy logs with the `vercel-logs` skill.

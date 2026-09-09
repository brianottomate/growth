# Wander Growth

Wander Growth is the internal growth command center and lead/outreach operations app for Wander.

It started from a T3 SaaS starter, but the center of gravity is now Wander-specific: brand and content operations, campaign planning, lifecycle programs, social listening, media management, lead enrichment, and Customer.io/Outreach/Instantly workflows.

## What This App Does

- Gives the growth team an operational workspace for brands, channels, content, campaigns, newsletters, lifecycle programs, media, mentions, and leads.
- Syncs and enriches lead data across Customer.io, BigQuery, Minerva, Outreach, HubSpot, and Instantly.
- Runs scheduled growth jobs on Vercel Cron for Meta, Reddit/listening, and comprehensive growth syncs.
- Stores durable growth assets in Neon/Postgres with Drizzle ORM and exposes app workflows through tRPC and Next.js route handlers.
- Provides AI-assisted planning and overview surfaces for growth operations.

## Core Stack

- **Framework**: Next.js 16, App Router, React 19
- **Runtime/package manager**: Bun
- **Database**: Neon Postgres with Drizzle ORM
- **API layer**: tRPC v11 with TanStack Query
- **Auth**: Better Auth with organization support
- **Styling**: Tailwind CSS 4, Radix UI, Wander design-system packages
- **Content**: Velite/MDX for marketing/blog content
- **Email**: Resend and React Email
- **Storage/media**: Cloudflare R2 and Cloudflare Stream
- **Integrations**: Customer.io, Outreach, Instantly, BigQuery, HubSpot, Meta, Reddit/X/listening providers, Slack

## Main Product Areas

### Growth Command Center

The protected app lives under `src/app/app`. Important surfaces include:

- `/app` - operational overview
- `/app/brands` - owned and tracked brands
- `/app/channels` - social, paid, newsletter, blog, and lifecycle channels
- `/app/content`, `/app/calendar`, `/app/feed`, `/app/studio` - content operations
- `/app/campaigns` - initiatives and paid/organic campaign planning
- `/app/lifecycle` - lifecycle programs and touchpoints
- `/app/listen` and `/app/listen-v2` - social listening and response workflows
- `/app/leads` - outbound lead database and enrichment workflows
- `/app/media` - R2/Stream-backed media library

### Lead And Outreach Ops

The `leads` Postgres schema is the high-volume outbound data model:

- `leads.domain` - one row per normalized company/domain
- `leads.contact` - many contacts per domain
- `leads.import` - import audit records
- `leads.outreach` - generated/sent outreach records

The core Customer.io to Outreach workflow is:

- Route handler: `src/app/api/workflows/cio-to-outreach/route.ts`
- Shared webhook handler: `src/server/services/cio-to-outreach-workflow.service.ts`
- Sync orchestration: `src/server/services/sync.service.ts`
- Outreach mapping and BDR assignment: `src/server/services/outreach/`

### Social Listening

Social listening is spread across durable tables, routers, route handlers, and services:

- Tables: `src/server/db/listening-schema.ts`
- Routers: `src/server/api/routers/listening.router.ts`, `reddit.router.ts`, `twitter.router.ts`, `mention.router.ts`
- App surfaces: `src/app/app/listen/`, `src/app/app/listen-v2/`, `src/app/app/_signal/`
- Cron: `src/app/api/cron/reddit/route.ts`
- Services: `src/server/services/reddit-monitor.service.ts`, `twitter-monitor.service.ts`, `listening-config.service.ts`, `listening-notify.service.ts`, `comment-triage.service.ts`, `triage.service.ts`

## Development

Use Bun. Do not use npm or yarn for this repo.

```bash
bun install
bun dev
```

Useful commands:

```bash
bun run check          # ESLint + TypeScript
bun run typecheck      # TypeScript only
bun run lint           # ESLint only
bun run format:check   # Prettier check
bun run format:write   # Prettier write
bun run build          # Velite build + Next build
```

Database commands:

```bash
bun run db:push        # Push schema changes for development
bun run db:generate    # Generate migrations
bun run db:migrate     # Run migrations
bun run db:studio      # Open Drizzle Studio
```

Deployments currently remain `db:push`-managed. The prerequisites and staged
cutover to checked-in migrations are documented in
[`docs/database-migration-transition.md`](docs/database-migration-transition.md).

Other local tools:

```bash
bun run velite:dev     # Watch MDX content (bun dev already builds it once at startup)
bun run email:dev      # Preview React Email templates
```

## Local Database Connection

The app reads `DATABASE_URL` from `.env` through Bun/Next env loading. Prefer Bun for reading the local env file instead of `source .env`, because secrets can contain shell-sensitive characters.

Connect with `psql`:

```bash
DATABASE_URL="$(bun --print 'process.env.DATABASE_URL')"
psql "$DATABASE_URL"
```

Quick inspection commands:

```bash
DATABASE_URL="$(bun --print 'process.env.DATABASE_URL')"
psql "$DATABASE_URL" -c "\dn"
psql "$DATABASE_URL" -c "\dt public.*"
psql "$DATABASE_URL" -c "\dt leads.*"
```

The expected app schemas are:

- `public` - auth, organizations, brands, content, campaigns, lifecycle, listening, media
- `leads` - outbound lead domains, contacts, imports, and outreach records

## Environment Notes

Environment variables are validated in `src/env.ts`. Many integrations are optional and gracefully skipped when their keys are missing, but core development requires at least the database and required app secrets.

Important categories:

- Auth/app: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ADMIN_TOKEN`, `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`
- Customer.io/Outreach sync: `CUSTOMER_IO_*`, `CUSTOMERIO_WEBHOOK_*`, `OUTREACH_*`, `BIGQUERY_*`, `MINERVA_*`
- Outbound and CRM: `INSTANTLY_*`, `HUBSPOT_ACCESS_TOKEN_OPERATED`
- Media: `CLOUDFLARE_*`, `R2_*`
- Listening and notifications: `X_*`, `APIFY_API_KEY`, `BRIGHT_DATA_API_KEY`, `SLACK_API_TOKEN`

## Architecture Notes

- tRPC routers are registered in `src/server/api/root.ts`.
- Database schema exports are centralized in `src/server/db/schema.ts`.
- Domain schemas live in `src/server/db/*-schema.ts`.
- Business logic belongs in `src/server/services/`.
- Provider clients belong in `src/server/clients/`.
- Sensitive server-only code should use `import "server-only"`.
- New user-facing app features should follow existing protected route patterns under `src/app/app`.

## Project Docs

Useful planning and architecture docs:

- `docs/growth-product-architecture-map.md`
- `docs/growth-platform-progress.md`
- `docs/customerio-integration.md`
- `docs/cio-assignment-repair-runbook.md`
- `docs/growth-cutover-workflows.md`
- `docs/tracking/TRACKING_PLAN.md`

## Starter Heritage

This repo still uses the T3 starter foundation:

- Better Auth user/session/account/organization tables
- Drizzle with Neon Postgres
- tRPC procedures and routers
- Tailwind/Radix component primitives
- Velite MDX blog support
- React Email and Resend support

Treat that as the technical substrate. The product itself is Wander Growth.

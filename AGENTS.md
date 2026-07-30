# AGENTS.md

This file provides repository-specific guidance to coding agents.

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
bun test                 # Bun unit tests
bun run ai:contracts    # AI catalog/schema/policy contract gate
bun run ai:gauntlet     # Contract gate plus isolated live DB access/receipt checks
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

`bun run check`, `bun test`, and `bun run ai:contracts` are the normal gates.
Use the full `ai:gauntlet` only with a current non-production Neon branch.

Tests must protect a business rule, operator outcome, security boundary, or
integration contract. Do not add tests solely to increase coverage, exercise
mock wiring, or freeze a private implementation detail. See
`docs/testing-principles.md` for the repository standard and review checklist.

One-off scripts live in `scripts/` (run via `bun run scripts/<file>.ts`) and
`src/scripts/` (operational tooling, e.g. CIO sync/repair — see `cio:diagnose`/`cio:repair`).

## Stack

Next.js 16 (App Router, React 19) · tRPC v11 + TanStack Query (SuperJSON) · Drizzle ORM on
Neon Postgres · Better Auth (organization/admin/username plugins) · Tailwind CSS 4 + Radix ·
Velite for MDX · React Email + Resend · Vercel (deploy, Blob, Cron) · Vercel AI SDK +
Anthropic. Deployed on Vercel as the **`wanderdev/growth`** project (org slug is
`wanderdev`, not `wander` — `vercel list` needs the linked project, not `wander/growth`).

## MCP

Growth exposes the same canonical AI capability registry over Streamable HTTP at
`src/app/api/mcp`. Better Auth provides OAuth 2.1, dynamic client registration,
PKCE, and organization-scoped access tokens. The MCP route must re-check live
organization membership and must not fall back to a browser session or first
organization.

Read `docs/mcp-capabilities.md` before changing OAuth, organization selection,
the capability registry, or connector exposure. Vercel is the application and
MCP deployment pipeline. Do not create a duplicate MCP deployment elsewhere.
`docs/ai-mcp-handoff.md` is the shareable overview of the product direction,
domain contract, provider boundaries, implementation history, and extension
checklist.

## Architecture

### tRPC

- Routers live in `src/server/api/routers/*.router.ts` and must be registered in
  `src/server/api/root.ts` (`appRouter`). Current routers: user, ads, amplifier,
  audience, brand, cadence, channel, channelSuggestion, content, conversion, inbox,
  initiative, newsletter, org, outreach, planImport, instantly, leads, lifecycle,
  listening, media, mention, moment, reddit, reschedule, spend, studio, twitter.
  Note: `apply` is a
  tRPC-reserved procedure name.
- The monthly content loop (strategy targets → slot generation → workbook import →
  review → apply) is documented in `docs/content-monthly-loop.md`.
- Procedures (`src/server/api/trpc.ts`): `publicProcedure`, `protectedProcedure`
  (requires session), `adminProcedure` (admin in prod, unrestricted in dev).
- Context exposes `session`, `db`, and the Better Auth `authApi`.
- See the `trpc-patterns` skill for client/server usage conventions.

### Database schema — domain-split with a barrel constraint

Schema is split by domain under `src/server/db/`:

| File                      | Domain                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth-schema.ts`          | Better Auth: user, session, account, verification + organization, member, team, team_member, invitation                                                |
| `brand-schema.ts`         | brand, brand_inspiration, access (Notion-style grants)                                                                                                 |
| `channel-schema.ts`       | channel (per-brand social/marketing channels), channel_suggestion                                                                                      |
| `content-schema.ts`       | series, content_post (planned/internal), platform_post + platform_post_link (published, synced), content_assignee, content_comment, content_suggestion |
| `ads-schema.ts`           | initiative, campaign, ad_spot, audience, audience_target (intent layer)                                                                                |
| `amplification-schema.ts` | amplifier (influencers/partners), amplification_target                                                                                                 |
| `cadence-schema.ts`       | cadence_target, mix_target (observed/target cadence + format mix)                                                                                      |
| `listening-schema.ts`     | mention (persisted social mentions), listening_source (evolvable per-channel config)                                                                   |
| `media-schema.ts`         | media_asset (R2 images / Cloudflare Stream video)                                                                                                      |
| `leads-schema.ts`         | **separate `leads` Postgres schema** — lead_domain, lead_contact, lead_import                                                                          |
| `lifecycle-schema.ts`     | lifecycle_program + lifecycle_program_step (intent), lifecycle_campaign, lifecycle_touchpoint (mirrored CIO/outbound)                                  |
| `schema.ts`               | attachment table + **barrel that re-exports every domain file**                                                                                        |

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
  up a WebSocket pool for transactions. The exported schema is _augmented_ with Better Auth
  model-name aliases (`user`, `session`, …) for its experimental joins feature.
- Tables that participate in sync carry an `isSeed` marker so `db:unseed` can strip seed data.

### Auth (Better Auth) — internal tool posture

- Config in `src/server/better-auth/config.ts`. Plugins: username, admin, organization.
- **Email verification is temporarily disabled** (`requireEmailVerification: false`,
  `sendOnSignUp: false`) so teammates sign in immediately. Comments mark how to restore it.
- Signup is gated to `@wander.com` emails; new users auto-join the Wander org. The anonymous
  plugin was removed.
- **Agent/local testing:** `GET /api/dev/login` mints a real session without a password
  (dev-only, 404s in deploys; works on any localhost port) — see `docs/dev-login.md`.

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

- `/api/cron/spend` — daily 05:00 (spend-tracker cache warm; see `src/server/services/spend-tracker/`)
- `/api/cron/growth?job=daily_comprehensive_sync&...` — **hourly** on the hour with a 3 h
  window, plus a 24 h backstop pass at 03:00 (CIO/Outreach lead sync)
- `/api/cron/growth?job=funnel_abandonment_sweep&...` — every 20 min during ET business
  hours, hourly overnight, every 6 h at weekends (abandonment sweep → Customer.io /
  Outreach; the cadence the whole compute budget is spent on)
- `/api/cron/growth?job=funnel_email_backfill` — every 6h on the hour (funnel email backfill)
- `/api/cron/hubspot` — hourly (pending HubSpot webhook retry rail)
- `/api/cron/instagram` — daily 19:00 UTC (Instagram account watch)
- `/api/cron/x` — every 6h (X listening scan)
- `/api/cron/affiliate` — daily 09:00 + weekly report Mon 14:00 (Impact.com monitor)
- `/api/cron/channels` — daily 04:00 (channel stats refresh)

### Cron cadence is a Neon compute budget

Growth is on Neon's free plan: **100 CPU-hrs/month**, reset on the 1st. What spends it is
not the number of jobs but the number of distinct **wake windows** — scale-to-zero idles
after ~5 min, so every wake costs ~5.5 min of compute whether the job takes 200ms or 30s.
Two crons on `*/10` + `*/20` kept the compute awake ~16 h/day and burned the quota by the
27th, taking prod down (2026-07-27).

Crucially the cost is the **union** of all cron marks, not any single schedule. That's what
made the outage counterintuitive: `funnel_abandonment_sweep` on `*/20` costs ~50 CPU-hrs on
its own, but adding `/api/cron/hubspot` on `*/10` collapsed the union to every 10 minutes
and took it to ~99 — and the expensive job was the *retry rail*, not the one doing work.

So: **spend the budget on the path that carries user-visible latency, and put everything
else on a mark that path already wakes for.**

- `funnel_abandonment_sweep` is the one that earns frequency. Amplitude posts abandonment
  events to a webhook which upserts `funnel_state` in real time (`funnel-ingest.service.ts`,
  dark — records state, sends nothing); the sweep is what turns that into a Customer.io /
  Outreach sync via `processLead`. Its stage windows are deliberate delays (payment 30 min,
  search/wishlist/cart 1 h), so end-to-end latency is `window + up to one sweep interval`.

  **Cadence follows the BDRs, not the browsers.** Sweep output is Outreach work for a human
  to action (Phase 3 email isn't live), so a 20-minute sweep at 03:00 just means a lead
  waits in a queue until morning anyway. Hence `*/20` only across `13-22` UTC Mon–Fri
  (≈09:00–18:00 ET), hourly overnight to keep the backlog trimmed against `limit=50`
  per stage per run, and every 6 h at weekends.

  Sweeping rarely loses nothing: eligibility windows stay open 7 days and `funnel_send_log`'s
  unique `(user, stage, windowKey)` is the idempotency ledger, so a Saturday abandoner is
  still eligible on Monday. **The exception is the payment stage, whose window is only 48 h**
  — a Friday-evening payment abandonment expires Sunday evening, so weekends can't go
  uncovered entirely. Hence every 4 h at weekends rather than a single Sunday pass.

  **`limit` cannot lose anyone.** The detection query is unbounded — every eligible candidate
  is ledgered `pending` on the first sweep that sees it — and `limitPerStage` caps only the
  *processing* of that queue, `ORDER BY sent_at ASC`, so a backlog drains oldest-first with
  no starvation and the ledger row outlives the eligibility window. `limit` is therefore a
  batch-size/timeout dial, not a correctness one: keep it small enough that a run finishes
  inside `maxDuration` (300 s, set explicitly on the route). Sizing reference, 21 days to
  2026-07-28: `abandoned_search` averages 190/day and peaked at 310, cart 65/100, wishlist
  59/114, payment 7/18 — so weekend capacity of 6 runs × 100 = 600/stage/day carries ~2×
  the busiest observed day.
- `/api/cron/hubspot` is a **retry rail**, not a delivery path — the webhook receiver stores
  and projects in `after()`, so enrichment latency is webhook-bound and independent of the
  cron. It only matters when a projection fails. Hourly on `:00`, a mark `*/20` already
  hits, so it costs nothing.
- `daily_comprehensive_sync` pulls `checkout_started` / `payment_info_entered` from BigQuery
  and enriches into Customer.io and Outreach — the path demand sales depends on. At its old
  daily 03:00 cadence a prospect could wait ~23 h to reach a BDR's queue; now hourly with a
  3 h window (overlap absorbs BigQuery ingestion lag) plus the 24 h pass at 03:00 as a
  backstop. Also free — `:00` again. Safe to overlap because `processLead`
  creates-or-updates the Outreach prospect and never enrols anyone in a sequence. The cost
  to watch here is BigQuery bytes scanned, not Neon.

Every remaining cron sits on `:00`, so the only marks beyond hourly are the sweep's `:20`
and `:40` during business hours: **44 wake marks per weekday, 24 per weekend day ≈ 27
CPU-hrs/month** against the free tier's 100. Rules of thumb: **put new crons on a mark an
existing cron already wakes for** (marginal cost zero); before reaching for a tighter
interval, check whether the thing you want faster is gated by a cron at all; and if a human
consumes the output, match the cadence to *their* hours rather than the event's.

Other API routes: `api/trpc`, `api/auth/[...all]`, `api/upload`, `api/media`, `api/webhooks`,
`api/instantly` (incl. the reply webhook that mirrors replies/interest onto `lead_contact`),
`api/outreach`, `api/workflows`, `api/og`, `api/admin`, `api/plan/chat` (plan-agent
streaming endpoint).

### AI (`src/server/ai/`)

- `src/server/ai/capabilities/domains.ts` builds the canonical model-facing
  domain tools from typed service actions. There is no parallel atomic tool
  registry and no post-hoc grouping layer.
- `src/lib/growth-capabilities.ts` is the client-safe capability/action catalog.
  UI labels and retired-result handling must use it rather than duplicating IDs.
- `src/server/ai/kernel/policy.ts` defines consequences, approval, idempotency,
  reversibility, and allowed surfaces once per advertised action.
- Overview chat, plan chat, and MCP use projections of the same tool definitions
  through the same execute-time membership, receipt, replay, and error runtime.
- `PLAN_TOOLS` is the focused read-only projection for the Form|Chat planner.
- Run `bun run ai:contracts` after any capability, action, policy, schema, MCP,
  chat-card, or persona change.
- All structured AI generation uses `generateText`/`streamText` with
  `Output.object`. Do not add `generateObject` or `streamObject`.

### Frontend

- `src/app/(marketing)/` — public pages (home, blog, brand, zernio, design-system, contact).
- `src/app/app/` — authed back-office: brands, content, leads, lifecycle, channels,
  newsletters, pillars, dashboard, org, account, onboarding, plus the newer surfaces
  `overview` (canonical assistant), `plan` (organic authoring + Form|Chat AI agent),
  `apps` (marketplace and assistant storefront operations), `product-atlas`,
  `studio` (content wheel), `media`
  (asset library), `listen` (social listening + reply drafts), `inbox`, `campaigns`,
  `audiences`, `people`, `calendar`. `feed-v5` is the live swimlane timeline; older
  `feed*` variants are retired/in-progress prototypes.
- `src/app/lab/` — Kristian's private workspace (system maps, whiteboard, one-off
  tools), admin-gated via `src/server/lab-access.ts` (404 for non-admins; dev mode
  open). Diagnostic JSON endpoints live under `src/app/api/lab/*` behind the same
  gate (+ `Bearer ADMIN_TOKEN` for curl). Never link /lab from public pages, and
  never add an ungated "test" route outside it — the old open /api/test/\* routes
  leaked lead PII (removed 2026-07-10).
- UI components in `src/components/ui/` are shadcn/Radix-based.
- **Styling bridge:** `src/styles/globals.css` maps wandercom design-system tokens
  (`@wandercom/design-system-*`) into shadcn variables. Theming is via a `data-theme`
  attribute, **not** a `.dark` class.

## Env

Validated in `src/env.ts` via `@t3-oss/env-nextjs` (add new vars there). Manage Vercel env
vars with the `vercel-env` skill; inspect deploy logs with the `vercel-logs` skill.

## Important boundaries

- Use Bun. Do not run npm or yarn in this repository.
- `bun run build` includes `drizzle-kit push`; do not run it casually against an
  unknown database URL.
- Preserve the default-deny ad-account allowlist. Aggregator OAuth grants can
  expose unrelated personal or portfolio accounts.
- Provider sends, publishes, deletes, campaign changes, and conversion-action
  mutations require explicit policy and operator approval. Read-only audits do
  not authorize provider changes.
- Treat this repository as Wander-owned work. Do not copy or cherry-pick code
  from personal, client, or unrelated private repositories.
- Reimplement portable ideas from public documentation and Growth-native
  requirements. Keep branch names, commits, PRs, docs, fixtures, credentials,
  provider identities, and comments free of unrelated project provenance.

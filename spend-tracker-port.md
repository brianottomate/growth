# Spend Tracker → Growth: Port Strategy

> Status: **✅ SHIPPED (v1 built 2026-07-10)** · strategy written 2026-06-15
> Implementation: `src/server/services/spend-tracker/` + `/app/spend` + `spend` tRPC router + `/api/cron/spend`.
> Verification: `bun test` (methodology suite) + `bun --conditions react-server scripts/spend-verify.ts`.
>
> **Deviations from this doc, decided during the 2026-07-10 build:**
> - **Zernio is NOT the spend source.** Live probe found Zernio has no Google/Pinterest
>   connection, its `/ads/timeline` ignores account/campaign filters, and the metaads
>   connection blends 4 ad accounts (incl. Homi). Meta spend+bookings come from the
>   Meta API directly (campaign-level, marketplace denylist, 28d_click+1d_view) via
>   `meta.client.ts`; Google/others from BQ `marketing_adnetwork_daily_report` (alive
>   again); Pinterest dormant ($0/30d). Zernio remains a cross-check in spend-verify.
> - **No DB at all, including demand sales:** fixed costs AND demand-sales monthly
>   numbers are effective-dated config in `spend-tracker.config.ts` (no Google Sheets,
>   no Neon table — team reports numbers via a config edit + deploy).
> - Google bookings are BQ last-touch (no Google Ads API creds in growth/) — documented
>   v1 deviation from Decision #6; revisit if Google spend becomes material.
> - Option C (BQ write-back `growth_tracker_daily_spend` for the dbt north-star spend
>   CTE) is designed in (`computeDailySpendRows()`) — build after Joao ping.
>
> The strategy below is kept as historical context.

This doc captures the discussion and conclusions so we can pick it back up later.

---

## What we're porting

`brian/wander-growth-tracker` — an internal marketing dashboard ("replaces spreadsheet
reporting with a real-time, glanceable interface"). Currently a **separate app**:
Next.js 15 + **Supabase** (Auth + Postgres) + BigQuery + **Railway**.

It tracks marketing **unit economics**: ad spend, **DCPB** (Direct Cost Per Booking,
target **$500**), **ROAS** (on *take-rate revenue*, not GMV — the Dylan Wright
methodology, March 2026), Fully-Loaded CPB / CPAC, per-channel breakdown, 30-day trends,
validation/data-quality, and an "Ask Claude" panel.

**Channels:** meta, google, pinterest, mountain (Comcast TV), influencer, content,
demand_sales (BDRs), direct_mail, affiliate, seo. (OTA: airbnb/vrbo/booking/amex —
excluded from DCPB, included in totals.)

### What it actually is, structurally
1. **Ingest pipeline** — pulls spend (platform APIs) + revenue/bookings/funnel (BigQuery)
   + demand-sales (Google Sheet), **merges** them, injects **pro-rated fixed costs**, caches.
2. **Thin cache** — `channel_snapshots` (the dashboard's real source of truth),
   `fixed_costs`, `north_star_daily`, `sync_logs`. *BigQuery is the true source of truth;
   Supabase was just a materialized read layer.*
3. **Read/compute API** — dashboard / channels / trends / validation / insights (REST + hooks).
4. **Ask Claude + dashboard UI** (Recharts, password auth).

The **value** is almost entirely in layer 1's business logic — see "Crown jewels" below.

---

## Key realization: growth already has ~70% of the plumbing

`growth/` shares the **same BigQuery project** (`wander-9fc9c`) and already provides better
versions of everything the tracker hand-rolled on Supabase.

| Tracker need | Supabase/Railway today | `growth/` equivalent (exists) | Effort |
|---|---|---|---|
| Auth | Supabase Auth + password gate | **Better Auth**, already `@wander.com`-gated, verification off | 0 — delete |
| BigQuery | own `@google-cloud/bigquery` | **`src/server/clients/bigquery.client.ts`** — same project, `executeQuery()` | 0 |
| Meta spend | direct Meta Ads API | already synced daily → BQ `growth.meta_account_conversions_28d` | 0 (or via Zernio) |
| Read API | 14 REST routes + 6 hooks | **tRPC** + React Query (SuperJSON) | rewrite, not redesign |
| Charts | Recharts custom | **`src/components/ui/charts/MyAreaChart.tsx`** (Recharts v3) + shadcn | small |
| Claude | `@anthropic-ai/sdk` | **`src/server/clients/claude.client.ts`** (Sonnet/Opus/Haiku, streaming) | small |
| Cron | Railway scheduler | **`vercel.json` + `src/app/api/cron/*`** | small |
| Env | `.env` | **`src/env.ts`** (t3-env) | trivial |

---

## The Zernio finding (the big simplification)

Zernio (already integrated: `src/server/clients/zernio.client.ts`, `ZERNIO_API_KEY` set) is
a **unified cross-platform ad aggregator**, not just organic social. Verified against
`docs.zernio.com` (llms.txt, /ad-campaigns/get-ad-tree, /ads/list-ads) on 2026-06-15:

- **Daily granularity exists** — `GET /v1/ads/timeline` = *"daily aggregate metrics… one
  row per calendar day."* `/ads/tree`, `/ads` (list) take `fromDate`/`toDate` + `platform`
  + `adAccountId`. (This was the make-or-break check — **passes**.)
- **730-day (2-year) retention** on ad spend metrics → **we don't need to persist spend at
  all; Zernio is the durable store.** This dissolves the main objection to a no-DB design.
- **7 platforms**: facebook | instagram | tiktok | linkedin | **pinterest** | google |
  twitter — a *superset* of the tracker's Meta+Google+Pinterest.
- **Metrics per row**: spend, impressions, reach, clicks, CTR, CPC, CPM, engagement,
  conversions, costPerConversion, ROAS, purchaseValue.

### What Zernio replaces
**All three bespoke ad-platform clients (Meta SDK + google-ads-api + Pinterest) → one
integration.** Deletes the largest new-integration workstream and three sets of credentials.

### What Zernio does NOT replace
- **BigQuery revenue reconciliation** — Zernio's ROAS/conversions are *platform-reported*,
  not Wander's reconciled **take-rate revenue** (`booking_revenue_recognized`, `is_profit`).
  ROAS = takeRateRevenue / spend needs BQ for the numerator. Stays.
- **Fixed costs** (TV, BDRs, direct mail, SEO, affiliate, influencer) — not ad platforms.
- **Demand-sales Google Sheet** and **north-star metrics**. Stay.

### Methodology rule
Take **spend / impressions / clicks** from Zernio (objective, attribution-window-independent).
Take **bookings / revenue** from BigQuery. **Do not** use Zernio's `conversions` for canonical
numbers — they're platform-default attribution (and were observed as **0 on lead campaigns** in
a prior tree probe), not the tracker's 28d/1d / data-driven rules.

---

## Architecture decisions (how we got to "no database")

1. **No Supabase** — Better Auth already does the `@wander.com` password gate with
   verification off. Free.
2. **Drop the DB entirely.** The Supabase tables were a *cache*, not a source of truth.
   With Zernio holding 730 days of spend and BigQuery holding all revenue history, there's
   nothing left that *must* be persisted… except fixed costs.
3. **Don't go "pure live BQ"** — the dashboard numbers are a *merge* (BQ revenue + Zernio
   spend + pro-rated fixed costs). That pipeline runs regardless; the only question is where
   the result lands. Answer: a **cache**, not a database.
4. **Fixed costs = a hardcoded, typed config file in the repo.** They change a handful of
   times a year, by one person. Git becomes the editor *and* the audit log (who/when/why via
   commits) — better than a DB row with `updated_by`. Edit with Claude Code → push → redeploy.
   This deletes the entire Settings/fixed-costs-CRUD UI from the port.
   - **Must be effective-dated** (not a single current value), because we recompute live and
     historical months need that month's values. Comcast was $10.6K from Jan; "content"
     started May.
   - No Vercel Blob in this repo anyway (media uses Cloudflare R2/Stream) — so a config file
     is the natural choice, not object storage.

### Final architecture — zero persistence

```
Zernio (spend) ─┐
BigQuery (rev) ─┼─→ merge + pro-rate ─→ cache (use cache / cacheTag) ─→ dashboard
config.ts ──────┘   (fixed costs [effective-dated] + constants, in the repo)
```

No DB, no Blob, no R2, no schema/migrations/barrel, no settings page. A daily cron (or a
manual "refresh" mutation) revalidates the cache so Zernio's quota is hit on a schedule, not
per page-view.

---

## Crown jewels — port nearly verbatim

Pure TypeScript, no Supabase coupling. Copy and only swap the read/write calls. **Faithful
porting matters more than cleverness — a subtle change here silently changes a reported number.**

- `src/lib/bigquery/queries.ts` — the 3 BQ queries (spend / bookings+GMV / funnel). Same
  project, run unchanged via `executeQuery()`.
- `src/lib/bigquery/mapper.ts` → `mergeSpendBookingsAndFunnel()` — **the ~120-line merger.
  Single most valuable + fragile file. Port character-for-character.**
- Attribution + reconciliation rules; fixed-cost pro-ration (`fixed-costs/resolve.ts`);
  validation (`validation/post-refresh.ts`, incl. the 45-day-lookback rule from the Feb-2026
  data-gap incident); `types/index.ts` constants (`CPB_TARGET=500`, `BLENDED_TAKE_RATE=0.20`).
- `anthropic/prompts.ts` — the Ask-Claude system prompt with baked-in methodology.
- Bring along `.claude/contracts/*.md` as the porting checklist (the repo's own rule: "code
  that contradicts the contracts is a bug").

---

## Scope notes

- **Org-global, not brand-scoped.** `growth/` is org/brand-scoped, but the spend tracker is
  one global Wander view. Router = `protectedProcedure` (any `@wander.com` user), no brand
  filter. Lives at **`/app/spend`** — peer of `/dashboard`, not under `/brands/[slug]`.
- **Implementation detail to verify when building:** `/ads/timeline` is summed "across all
  ads in a SocialAccount." For the per-channel daily breakdown the dashboard shows, call
  `timeline` once per `platform` filter (or `/ads/tree` per day). Confirm `timeline` honors
  a `platform` filter against the live account.

---

## Phased plan (~4–6 days)

- **Phase 0 — Foundations (½ day):** `spend-tracker.config.ts` (effective-dated fixed costs +
  constants); confirm shared BQ creds read `analytics.*`; live-probe Zernio
  `getZernioAdsTree()` + `/v1/ads/timeline` to confirm **spend** (not just conversions) is
  populated daily per platform.
- **Phase 1 — Merge core (1.5–2 days):** port `queries.ts` + `mapper.ts` + fixed-cost
  pro-ration + validation into a `spend-tracker.service.ts`. Spend from Zernio, revenue from BQ.
- **Phase 2 — Read API (1 day):** `spendTracker.router.ts` (dashboard / channels / trends /
  validation / insights) + register in `root.ts`. Cache via Next 16 `use cache` + `cacheTag`;
  optional `/api/cron/tracker` to revalidate daily.
- **Phase 3 — UI (1.5–2 days):** `/app/spend` — KPI grid, channel table, `MyAreaChart`
  trends, validation + methodology pages. Reskin to design-system tokens.
- **Phase 4 — Ask Claude + polish (0.5–1 day):** wire `claude.client.ts` + ported prompts;
  data-as-of indicator from cache timestamp. (Stateless — no saved conversation history in v1.)

**Deleted vs. original:** Supabase, all 4 tables + migrations, Drizzle schema/barrel work,
the Meta/Google/Pinterest API clients, the settings/fixed-costs-CRUD UI, sync_logs,
saved Ask-Claude history.

---

## Open decisions (before building)

1. **v1 scope:** full parity (all channels + demand-sales Sheet + Ask Claude) vs. lean first
   cut (Zernio + BQ + fixed costs; defer Sheet/Claude). *Default: lean.*
2. **Bookings/revenue source per channel:** pure BQ (cleaner) vs. honoring the original's
   per-platform overrides. *Default: spend from Zernio, all revenue/bookings from BQ.*
3. **Demand-sales Sheet:** port the `googleapis` reader, or fold BDR numbers into the config /
   defer. *Default: defer to v1.1.*

**Default if "just go":** lean v1, spend-from-Zernio + revenue-from-BQ, fixed costs in
`spend-tracker.config.ts`, at `/app/spend`, Ask Claude deferred.

---

## Next step

Run the **Phase 0 Zernio probe** — call `getZernioAdsTree()` + `/v1/ads/timeline` against the
live Wander account and confirm daily *spend* comes back populated per platform. That single
check de-risks the whole plan (conversions were 0 in a prior probe; we need spend to be solid).

## References
- Tracker source: `../brian/wander-growth-tracker` (CLAUDE.md, ROADMAP.md, SESSION_CONTEXT.md,
  `.claude/contracts/*`).
- Zernio: `src/server/clients/zernio.client.ts`; docs.zernio.com (llms.txt, ad-campaigns, ads).
- Growth memory: `zernio-integration`, `growth-backoffice-data-model`, `growth-internal-tool-auth`.

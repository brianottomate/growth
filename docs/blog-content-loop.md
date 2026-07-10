# Blog Content Loop — Plan

**Status:** plan, not built. Seeded 2026-07-10.
**Purpose:** delegate the *writing* of wander.com blog articles to generative AI on a
plan-ahead cadence, gated by a human, and publish on schedule — replacing the agency
SEO-content pipeline that appears to have stopped.

## Why now (the finding)

DatoCMS `allBlogArticles` (1,210 total) queried 2026-07-10, `_publishedAt_DESC`:
agency-style templated SEO travel guides ("Where to Stay in {city}", "Large Group
Vacation Rentals in {place}", "Best Time to Visit {place}") ran heavy **through
~2026-05-29, then fell off a cliff.** June = a trickle; July 7–9 = a burst of internal
operator/owner-portal help docs (product content, not marketing SEO). Net: a ~6-week
gap in marketing blog output, consistent with the agency no longer being engaged.

## Relationship to existing docs

- `blog-integration.md` — the current manual DatoCMS → `platform_post` importer.
- `content-monthly-loop.md` — the human content-planning loop this feeds into.
- `agent-runtime-options.md` — **runtime decision framework; defer to it** (see Runtime below).
- `analytics-strategy.md` — Amplitude-first posture.

## Design principle: three separate concerns

Not one autonomous "write-and-publish" bot. Split by owner and cadence — which matches
how Growth already plans content ahead:

1. **Plan (ahead, human-owned).** Blog ideas are `content_post` rows with a *target
   publish date* + brief, on the same calendar as everything else. State machine:
   `proposed → drafted → in_review → approved → scheduled → published`. The calendar is
   the source of truth.
2. **Draft (near the slot, AI-owned).** When a slot comes due, an AI loop writes the body
   from the brief + fresh signals (`generateText` + `Output.object`, per house
   convention). It also proposes title/meta (to fix the CTR problems below) and proposes
   image candidates. Output lands on the `content_post` as a draft — nothing live.
3. **Publish (scheduled, gated, deterministic — not AI).** After one human approval, a
   publish step pushes to DatoCMS via the CMA write token on the scheduled date
   (create draft item → publish). Plain code, not the model.

**The weekly cron feeds step 1, not step 3.** It pulls GSC + Amplitude blog performance,
ranks *refresh* candidates (high-impression/low-CTR = title/meta; page-2 rankers =
expand/link) and *net-new topic gaps*, and queues `proposed` `content_post` rows. Humans
curate; drafting/publish happen on each slot's own schedule.

Do **not** publish ungated to the live domain: hallucinated place facts, brand-voice
drift, and cannibalizing existing ranking articles are real risks (and indexation is
already the bottleneck — see GSC findings). Agent drafts + schedules; human approves once;
system auto-publishes on the date.

## Data-access layer (the agent's "API")

Every source is a thin, **headless-safe** read/write client authed via Doppler-stored
creds — *not* via interactively-authenticated MCP (MCP is fine for ad-hoc/interactive
analysis but may be absent in cron/Eve runs). Follow the `src/server/clients/{name}.client.ts`
pattern (`posthog.client.ts` is a good reference; there is **no** Amplitude client yet).

| Source | Purpose | Auth | Creds location | Status / what's needed |
|---|---|---|---|---|
| **Google Search Console** | blog-page impressions/CTR/position | Service account (`marketing-sync-pipeline@wander-9fc9c`) + `webmasters.readonly` scope | **Reuse existing `GCP_SA_JSON_B64`** in Doppler `wander-growth` | ✅ `searchconsole.googleapis.com` enabled. ❗ **Add the SA as a user on the `sc-domain:wander.com` property** (only remaining gate). **No separate token** — the SA key *is* the credential. |
| **Amplitude** | blog engagement/traffic | Project **API key + secret** (Analytics REST / Export API) | New Doppler secrets + validate in `src/env.ts` | ❗ **Not the Taxonomy API** — that's event-schema governance, no traffic data. Use the Analytics/Dashboard REST API (fetch a saved chart's data by ID) or the Export API. New `amplitude.client.ts` needed. Blog dashboard already exists: `wander-hq/aqc691oc` (org slug **wander-hq**). |
| **DatoCMS (read)** | article catalog, dates, tags, body | CDA read token (GraphQL) | ❗ Currently read from bare `process.env` in `import-blog.ts` — **move into Doppler + `src/env.ts`** | Works today (manual). Model `allBlogArticles`, ~1,210. |
| **DatoCMS (write)** | create/publish drafts | **Scoped CMA token** | New Doppler secret + `src/env.ts` (e.g. `DATOCMS_CMA_TOKEN`) | ❗ Provisioning. Scope: **BlogArticle model only, create+update, NO delete, draft-by-default.** `@datocms/cma-client` write path. Gates the publish step only. |
| **Images** | hero/inline imagery | n/a | `media_asset` / R2 / PMS property library | Do **not** AI-generate for a real-places brand. Reuse Wander's own photography (match by location/property), fall back to DatoCMS media or licensed stock; human confirms image at the gate. |
| **Content store** | plan/draft/state | internal | Neon (`content_post`) | Add the state machine above. |

## Runtime choice — defer to `agent-runtime-options.md`

Per that doc's matrix, this is the **"external operator"** shape (lives on a schedule,
brings work back to the team). Its guidance: the *first* version can live as an in-product
snapshot/app service; a separate runtime (Eve) is only justified once schedules, channels,
durable runs, or separate observability become real requirements.

- **v1 (recommended):** in-app **Vercel Cron** + **AI SDK tool loop** + `content_post` +
  human gate (review in `/app/blog`, or Slack approve via existing `slack.client.ts`).
  Keeps content state and approval UI in one place.
- **Graduate to Eve** (Vercel's agent framework: durable checkpointed runs, cron, Slack
  channel, HITL approval gates, sandboxes) *if* the loop needs its own operational
  identity/observability or grows into a multi-agent fleet. **Rule: keep the content
  state + approval UI in Growth even then; use Eve only as the execution engine.** Never
  split content state across two systems.

This also connects to the "content gap workflow" already sketched in the Mastra section of
`agent-runtime-options.md`.

## Phased build order

Read-side is buildable today; only the final publish needs the write token.

- **Phase 0 — creds hygiene.** Move DatoCMS CDA token into Doppler + `src/env.ts`; add
  Amplitude API key/secret; **add GSC SA to the property**; provision the scoped CMA token.
- **Phase 1 — read clients.** `gsc.client.ts` (blog pages), `amplitude.client.ts` (blog
  perf), reuse DatoCMS read.
- **Phase 2 — weekly ideation cron.** `/api/cron/blog` → rank refresh vs new-topic →
  queue `proposed` `content_post` rows. Dedup against the existing 1,210 articles to
  avoid cannibalization.
- **Phase 3 — AI drafting.** On a due slot, draft body + propose title/meta + image
  candidates → `drafted`.
- **Phase 4 — human gate.** Review/edit UI in `/app/blog` (+ optional Slack approve) →
  `approved`/`scheduled`.
- **Phase 5 — gated publish.** CMA draft→publish on the scheduled date → `published`.
- **Phase 6 (optional).** Graduate to Eve if operational needs demand it.

## Open questions

- CMA token: allow the role to *publish*, or restrict to *create draft* and require a
  human to click publish in DatoCMS? (Convenience vs. safety.)
- Amplitude: build a dedicated blog-perf chart and fetch by ID, or query the Export API? 
- Image matching: how to map an article's location → Wander's own photo library reliably.
- Cannibalization guard: topic-dedup against existing articles before proposing.

## Prior findings that inform priorities

- Traffic is overwhelmingly **branded**; blog articles are the main non-branded engine.
- `/article/bachelor-party-ideas`: 203K impressions, pos 8.8, **0.9% CTR** → title/meta +
  intent problem (snippet, not ranking).
- `/united-states/large-groups`: 102K impressions, pos 16.4, 0.9% CTR → **ranking** problem
  (page 2), title is fine.
- Indexation is the ceiling: **5.57K indexed vs ~60K not** — getting pages indexed matters
  before ranking/CTR. Broad indexation/crawl-health work belongs in `seo-agent`, not here;
  this loop is scoped to blog *content*.

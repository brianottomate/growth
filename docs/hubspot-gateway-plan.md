# HubSpot Gateway & Mirror — Working Plan

**Status:** living working document — Phases 1 & 4 SHIPPED; Phase 3 (inbound
router port) IN REVIEW; link pass, sequence mirror, and first segments LIVE
(see Progress log). For review by Danny (sales engineering / HubSpot).
**Date:** 2026-07-06 · **Authors:** Kristian + Claude
**Decision owners:** Kristian (growth), Danny (HubSpot/sales systems)

## Progress log (2026-07-06)

- 🔄 **Phase 3 — inbound router ported** (this PR): wander.com's
  `osInboundLeadRouter` moved verbatim to
  `src/server/services/inbound-router.service.ts` (classification, round-robin,
  contact/company/deal upserts, Slack notify to `C0A3PMXE3MG`), exposed as
  bearer-authed `POST /api/hubspot/v1/inbound` (validate → 200 → route via
  `after()`). Round-robin weight tables synced to wander.com post-#3180 —
  **weights now live here**; Danny PRs this repo (`hubspot.client.ts`,
  ROUND-ROBIN TABLES section) instead of wander.com. Simplifications agreed
  with Kristian: no submissions table (v2), no caller-side fallback — verify on
  preview, then wander.com forwards directly. Cutover = merging the wander.com
  caller PR.

## Progress log (2026-07-03 — all shipped & verified)

- ✅ **Gateway Phase 1**: wander.com's full client superset merged into
  `src/server/clients/hubspot.client.ts` (contacts create/upsert, deals,
  associations, notes, label maps, round-robin); `pms-mapping` ported to
  Anthropic; `/api/hubspot/v1` live in prod (health · companies/find ·
  companies/upsert · contacts/upsert, bearer-auth). Bonus fix:
  `HUBSPOT_ACCESS_TOKEN_OPERATED` had never been set in Vercel prod — the
  deployed /leads HubSpot features were silently dead until now.
- ✅ **Decisions locked**: single shared private app ("Operated", id 1855067,
  a legacy private app) — no dedicated gateway app; provenance via custom
  fields; only new env var is `HUBSPOT_GATEWAY_API_TOKEN` (caller bearer for
  our routes). Kristian flipped `automation.sequences.read` +
  `automation.sequences.enrollments.write` on the app. Notes/engagement
  writes turned out to already work (no extra scope needed).
- ✅ **Sequence mirror + strategic layer** (`scripts/import-hubspot-sequences.ts`,
  rerunnable): 202 sequences → `lifecycle_campaign` (provider `hubspot`,
  runState derived from live enrollment), 327 touchpoints across 36 live
  sequences, and **Danny's six active flows seeded as `lifecycle_program`s**
  (66 derived steps, linked both ways via the new `campaign.programId` FK).
  The six: Cold Outbound Main (407 enrolled) · Email Only (193) · GK
  Mainline (69) · Call Only (58) · Re-engage (44) · Standard non-listed
  Inbound (43).
- ✅ **Link pass** (`scripts/link-leads-hubspot.ts`): **58,814 of 58,890 lead
  domains (99.9%) matched to HubSpot companies** — real `hubspotRecordId` +
  live lead status/owner now on every `leads.domain` row; stale CSV flags
  dead. True net-new: **38 domains**, mostly garbled/AI-guessed domains from
  the June-1 pregen import — net-new sourcing is laid to rest (if sourcing
  resumes, stamp attribution on the way in). ~86% of the pool (50k) sits
  untouched in HubSpot (`NEW`/`Research Needed`).
- ✅ **First segments** (`scripts/push-hubspot-segments.ts`, rerunnable):
  MANUAL company lists — **"Growth · Untouched small PMs (5–49 units,
  integrated PMS)"** = 772 companies (list 3748) and **"Growth · Re-engage
  candidates"** = 77 companies (list 3749; No Response + Follow Up Later —
  Danny to sanity-check the status vocabulary before anyone enrolls, and to
  decide whether stale MQL (500) / Connected (214) widen it).
- 📐 **Next up: enrichment → projection** (§9) — the agreed architecture for
  running enrichment flows from this repo into HubSpot.

> ⚠️ This plan **inverts the core idea in `leads-system.md`** ("the internal Neon
> DB is the system of record; Instantly and HubSpot are projections"). That model
> assumed ~20k clean sales leads in HubSpot worked in isolation, plus 50–100k
> "less savory" leads bulk-sent from our side via Instantly. Reality: we have far
> fewer net-new leads than assumed, and HubSpot already holds the big universe.
> So we flip it: **HubSpot becomes the system of record and collaboration
> surface; the growth tool becomes a mirror + sync layer on top.**

---

## 1. What changed (portal ground truth, 2026-07-03)

Verified live against account `22480390`:

| Fact | Number |
|---|---|
| Companies in HubSpot | **~215k** (212,928 from IMPORT) |
| Companies with `pms_ai_identified` set | **206,245** |
| Contacts | ~288k |
| Sequences with enrollment history | **205** |
| Contacts currently enrolled in a sequence | 1,148 |
| Seats | Sales Hub **Enterprise** + Pro |

The "less savory universe" already lives in HubSpot, with PMS enrichment, at
3.5× the size of our 58k-domain Neon pool. Sequences are not a future
capability — sales runs them at scale today. The work is **reconciliation and
provenance, not import**.

## 2. The decision

1. **HubSpot is the system of record.** All lead/contact/company writes go to
   HubSpot. The growth tool never mutates lead data in Neon directly.
2. **Neon (`leads.*`) is demoted to a disposable read model** — a projection
   hydrated by HubSpot webhooks + backfill sweeps, rebuildable from zero (same
   contract as `scripts/import-cio.ts`: delete, re-import). It exists because
   the app needs SQL joins/aggregations HubSpot's public API can't do (see §5).
3. **The growth repo becomes Wander's HubSpot gateway.** We move the HubSpot
   client *and the inbound lead router* out of `wander.com` into this repo and
   expose them as an internal REST API (`/api/hubspot/v1/*`) callable from
   wander.com, the monolith, and anywhere else. One codebase owns "how Wander
   talks to HubSpot" instead of three repos, three SDK versions, two token env
   vars. (Danny proposed this; growth endorses.)
4. **Sequences run natively in HubSpot**, sent by real reps or marketing people
   with connected inboxes. The custom contact properties we planned for
   Instantly sequences are created in HubSpot instead (Danny has blessed free
   creation of properties and sequences).
5. **All HubSpot sequences get mirrored into `/lifecycle`** as a second provider
   next to Customer.io, so the strategy overview lives here: author intent as a
   program → build the sequence in HubSpot → link + "mark as reflected".
6. **Instantly is demoted to a dormant escape hatch** for true cold bulk — which
   HubSpot's AUP bans (purchased/scraped-list email → suspension) and which the
   lead math says we may never need again.

## 3. The gateway

### What moves (from `wander.com`)

- `src/services/hubspot/hubspot.client.ts` — the superset client (contact
  create/upsert, deals, association creation, notes, owner/stage/lead-status
  label maps, `nextRepInRR` round-robin). Growth's client is a trimmed fork of
  this file — same account, same token, same audit-style "only backfill empty
  fields" writes — and growth's is ahead on batch/fuzzy company lookup, so the
  merge direction is **inward into growth's `hubspot.client.ts`**.
- `pms-mapping.ts` — AI mapping of free-text PMS → HubSpot enums.
- `api/os/inbound/route.ts` — the inbound lead router (upsert contact + company
  + deal, lead-type classification, AE/BDR round-robin, Slack alert).
- `api/slack/operated-submission/route.ts` — Slack ❌ → unqualify (coupled to
  the router; moves with it).

The monolith's `@wosc/hubspot` (custom Listing object `0-420`, `wos_org_id`
conversion-deal idempotency) ports **later, opportunistically** — distinct and
low-churn.

### The API surface (`/api/hubspot/v1/*`)

Plain REST route handlers + zod, bearer auth from a shared secret (callers are
wander.com and the Deno monolith — not tRPC clients). Keep it small:

- `POST /inbound` — the ported router
- `POST /companies/upsert`, `POST /contacts/upsert`
- `POST /touches` — log email/note/task engagements onto the timeline
- `POST /sequences/enroll` — enroll contact (see constraints in §5)
- `GET /owners/resolve`, `GET /health`

### Revenue-path safety (the one real risk)

The inbound router is on the revenue path: every inbound lead flows through it.
This repo today deploys casually (straight to main, `bun run check` as the only
gate, and deploys have died for weeks on an expired `GH_PACKAGES_TOKEN`).
Mitigations, built in from day one:

- **Accept-then-process:** `POST /inbound` persists the raw payload (one
  insert), returns 200, then does HubSpot/Slack/round-robin async. A lost lead
  becomes impossible; downstream failures become retryable rows.
- **Idempotency** on inbound payloads (dedupe by email + timestamp window).
- **Caller-side fallback** during transition: wander.com keeps its local path
  (or a dumb queue-and-Slack) if the gateway errors.
- `/health` endpoint + log-based alerting.

## 4. Provenance ("mark growth-sourced leads better")

HubSpot's Record Source is immutable: private-app creations get
`INTEGRATION` + the app's name; `hs_object_source_detail_2/3` are writable **at
creation only**. **Decision (2026-07-03): no dedicated gateway app.** We keep
the single shared private app (`HUBSPOT_ACCESS_TOKEN_OPERATED`, same as
wander.com) and expand its scopes as later phases need them (sequences
read/enroll, webhooks). Record Source attributes everything to that shared
app — fine, because provenance lives entirely in our own fields:

- **`hs_object_source_detail_2/3`** stamped with batch/import ids at creation
  (available to any integration regardless of which app writes).
- **Custom properties**, extending the existing vocabulary
  (`inbound_outbound`, `lead_type`, `inbound_date`) rather than inventing a
  parallel one: e.g. `growth_source`, `growth_import_id`, plus per-sequence
  planning fields. Limit is 1,000 custom props/object — not a constraint.
- **A MANUAL v3 list** as the literal "growth-sourced" join list.

**→ Danny to review the property names + which existing conventions to extend.**

## 5. Platform facts the plan is built on (verified 2026-07-03)

**Sequences API (v4 / `2026-03`, GA).** Exactly four operations: list
sequences, get one sequence **with full step definitions**, enroll a contact
(`sequenceId + contactId + senderEmail`, `userId` param), read a contact's
current enrollment. Private-app scopes suffice (`automation.sequences.read`,
`automation.sequences.enrollments.write`). **Not available:** unenroll, batch
enroll, enrollment history, sequence create/edit — authoring stays in HubSpot's
UI, which fits the "build in HubSpot, mark as reflected here" loop.

**Sending identity.** Sequences send only from a **personal connected inbox**.
Shared/team inboxes are explicitly prohibited; Gmail aliases work. API
enrollment on behalf of another user works in practice (their `userId` +
`senderEmail`, needs paid seat + connected inbox + sequence shared) but is
**undocumented — treat as fragile**. Caps: 1,000 enrollments/portal-inbox/day;
500 sequence emails/day per Pro seat, 1,000 per Enterprise seat.
**→ Danny: which reps / marketing senders should the gateway enroll as?**

**Enrollment reality is bulk-readable without the API:** contacts carry
built-in `hs_latest_sequence_enrolled` / `hs_sequences_is_enrolled` /
`…_enrolled_date` / `…_ended_date` properties (values are sequence IDs; the
Sequences API resolves names + steps). This is what makes the `/lifecycle`
mirror cheap.

**Webhooks work from private apps** (contact/company creation, propertyChange,
associationChange, merge) — no public OAuth app needed. This is the primary
Neon-hydration signal; polling is backfill-only because CRM Search has a hard
**10,000-result window**, 200/page, and a **5 req/s cap shared account-wide**
(including wander.com's inbound flow today — another reason to centralize).

**Engagement logging** (emails/notes/tasks as v3 objects) works from a private
app. Timeline *event templates* require a public app — skipped; notes/emails
suffice.

**Why Neon survives at all:** the public REST API has no GROUP BY/aggregation
and no joins. The `/leads` stat cards and anything joining CRM data against
`lifecycle_program` / `lead_outreach` / content tables need SQL. (The SQL-ish
`query_crm_data` we used for the portal numbers is HubSpot's **MCP/agent
surface** — OAuth-interactive, LLM-formatted output — not a backend API.)
Detail views read HubSpot live (cheap by-ID gets, freshest); lists/stats/joins
read the Neon projection.

## 6. Migration plan

| Phase | What | Done when |
|---|---|---|
| 1 ✅ | Merge wander.com's FULL client superset into growth's `hubspot.client.ts` (incl. round-robin, label maps, pms-mapping → Anthropic rewrite); `/api/hubspot/v1` with bearer auth + `/health` + company/contact find/upsert. Shipped on the shared `HUBSPOT_ACCESS_TOKEN_OPERATED` token (decision: one private app, no dedicated gateway app) | **DONE 2026-07-03** — deployed, verified in prod |
| 2 | Enrichment → projection (§9): growth property group + `hubspot_synced_at` + projection script + nightly cron. Sequences scopes ✅ (flipped by Kristian); link pass ✅ (99.9% matched); first segments ✅ (lists 3748/3749) | Enrichment lands in HubSpot within a day; sales filters on `growth_*` props |
| 3 🔄 | Port inbound router with accept-then-process (`POST /api/hubspot/v1/inbound`); weights synced post-#3180. Simplified per Kristian: no flag/fallback — preview-verify, then wander.com forwards directly | Router **IN REVIEW** here; wander.com caller PR + HubSpot-code removal are follow-ups |
| 4 ✅ | `/lifecycle` HubSpot provider: `import-hubspot-sequences.ts` → 202 campaigns + 327 touchpoints + six programs linked via `campaign.programId` | **DONE 2026-07-03** — rerun script to refresh; cron-schedule it later |
| 5 | Webhook receiver → Neon read-model hydration; trim `leads.*` columns that existed only because Neon was SoR; rebuild script. (Interim: rerun the link pass for status refresh) | Stale-flag hedging (`HsMarker` "?") deleted |
| — | Later: monolith `@wosc/hubspot` port; Instantly decommission decision | — |

## 7. Open questions for Danny

1. **Property naming:** extend `inbound_outbound` with new values vs. new
   `growth_source` property? Which property group should growth-owned props
   live in?
2. **Sender identity:** which AEs/BDRs/marketing people connect inboxes for
   gateway-enrolled sequences? Are we comfortable with the undocumented
   on-behalf-of enrollment, or do we enroll only as a service-ish real user?
3. **Round-robin ownership:** the `nextRepInRR` weights move into the gateway —
   who maintains them, and should they become HubSpot-driven (team membership)
   instead of hardcoded tables?
4. **Sequence conventions:** naming/sharing conventions so the /lifecycle
   mirror can group sequences by program; who owns archiving the stale ones
   (205 with history vs. what's actually active)?
5. **Private app scopes:** we're expanding the shared app (not creating a new
   one) — Danny to add sequences read/enroll + webhook scopes when Phase 2/4
   land; heads-up that one rotation affects both wander.com and the gateway.
6. **Cutover window** for the inbound router (phase 3) — quiet week preference,
   and what the fallback alert should look like in Slack.
7. **Existing 215k imports:** any known provenance for the big IMPORT batches
   (BuiltWith exports?) so the join list can distinguish "ours" vs. "already
   theirs" honestly?

## 8. Sequence → /lifecycle mapping (Phase 4 preview, explored 2026-07-03)

What the real sequence data looks like (probed live; scope check: the shared
app currently 403s on `automation/v4/sequences` — needs
`automation.sequences.read`, see §7 Q5):

- **205 sequences have enrollment history; only 37 have anyone currently
  enrolled**, and the top 3 hold ~63% of the 1,148 live enrollments. Most of
  the 205 are stale — the /lifecycle cleanup-candidates view will light up.
- **Sequences are per-rep clone families.** Naming pattern:
  `"{Source} Final Sequence | {Year} | {Rep}"` — e.g. OTAs / MLS for Sale /
  MLS for Rent / MLS All Other, each cloned per AE (Cheyenne, Maggie Tran,
  Sara Lawrence, …, plus `(clone)` variants). The *strategy* grain is the
  family (~4 plays); the *execution* grain is the rep clone. Sequence names
  are readable without the scope via the `hs_latest_sequence_enrolled`
  property options (internal/MCP surface only — the public properties API
  returns them empty).

**Mapping onto the schema** (`lifecycle-schema.ts`):

| HubSpot | lifecycle model | Notes |
|---|---|---|
| Sequence | `lifecycle_campaign` | `provider: 'hubspot'` — **schema delta: add to `delivery_provider` enum** (additive) |
| — | `externalKind` | `'sequence'` — free-text column, no migration |
| — | `kind` | `'outbound'` — enum value already exists |
| — | `externalId`/`externalUrl` | sequence id / `app.hubspot.com/sequences/22480390/sequence/{id}` |
| — | `runState` | Derived, **no scope needed**: currently-enrolled > 0 → `running`, else `ended` (contacts GROUP BY `hs_latest_sequence_enrolled` × `hs_sequences_is_enrolled`) |
| — | `metrics.matched` | Historical enrollment count (approximate — `hs_latest_*` only tracks each contact's latest sequence) |
| Step (email) | `lifecycle_touchpoint` `channel:'email'` | Needs the scope (`GET /sequences/{id}` returns stepOrder, delayMillis, actionType) |
| Step (task) | `lifecycle_touchpoint` `channel:'bdr_task'` | Enum value already exists |
| Clone family | `lifecycle_program` | **Design decision:** one program ↔ N rep-clone campaigns. `lifecycle_program_step.campaignId` (1 step → 1 campaign) doesn't fit; suggest a nullable `lifecycle_campaign.programId` FK, with family clustering by normalized name (strip `\| {year} \| {rep}` + `(clone)`) |

**Incremental path:** a v1 `scripts/import-hubspot-sequences.ts` (sibling of
`import-cio.ts`) can ship **before the scope lands** — campaigns + derived
run-states + enrollment metrics from contact aggregates alone (names where
known). Step-level touchpoints follow once `automation.sequences.read` is
granted. Strategy altitude first, step detail second.

## 9. Enrichment → projection (agreed 2026-07-03, not yet built)

How enrichment flows in this repo reach HubSpot. Core rule: **Neon is the
system of intelligence, HubSpot is a projection of learnings — never couple
the two inline.** Enrichment (discovery fan-out, extraction, unit estimates,
channel discovery, Minerva verify) keeps writing to Neon exactly as today; a
separate projection pass pushes dirty rows. One new column drives it:
`leads.domain.hubspot_synced_at` — projection = rows where
`updated_at > hubspot_synced_at`. Self-healing, rerunnable, resumable.

### Two write rules, never confused

**Our namespace (`growth_*`) — always overwritten, we own it** (and sales can
build native ACTIVE lists on it, which eventually replaces manual list pushes):

| Property | Object | From |
|---|---|---|
| `growth_unit_estimate` + `growth_unit_confidence` | company | unit-estimate service |
| `growth_tier` | company | computedTier / composite score |
| `growth_pms_detected` | company | discovery (vs their `pms_ai_identified`) |
| `growth_pregen_url` | company | pregen pipeline |
| `growth_reachability` | company | channel discovery (form/phone/chatbot) |
| `growth_enriched_at` | company | projection timestamp |
| `growth_source`, `growth_import_id` | both | provenance (if sourcing resumes) |
| `growth_outreach_status`, `growth_verification` | contact | outreach / verify history |

**Their namespace (`portfolio_size`, `pms_ai_identified`, `city/state/country`,
`sites_preview_url`) — audit-always backfill only** (`computeFieldsToWrite`:
fill blanks, never overwrite sales edits).

A "Growth" property group renders it all as one card on the record.
**→ Danny reviews property names before creation (§7 Q1).**

### Batching

- **Enrichment: small batches** — constraint is LLM/scraper cost + quality,
  not HubSpot. ~100 domains/night via the existing cron pattern
  (`/api/cron/channels` is the precedent). Priority queue = **untouched +
  integrated PMS + no unit estimate (31,928 companies)** — every batch grows
  list 3748 mechanically.
- **Projection: canary 50, then bulk.** Id-based batch update API (100
  records/call, generous non-search bucket) — the whole matched pool projects
  in ~10 min. Search was the slow part of the link pass; projection never
  touches search.

### Build order

1. `scripts/create-hubspot-growth-properties.ts` — group + properties
   (scopes already granted; blocked only on Danny's naming nod).
2. `hubspot_synced_at` column + `scripts/sync-hubspot-companies.ts`
   projection (canary 50 → the ~4k already-enriched → all).
3. Nightly cron: enrich next-100 by priority → project dirty rows.
4. Contacts wave, gated on the marketing-contacts billing check
   (API-created contacts default non-marketing — confirm portal setting).

End state: anything any flow learns lands in Neon and reaches HubSpot within
a day, with provenance, without ever fighting sales' edits.

## Appendix: source research

- Sequences API guide (`automation/v4/sequences`, date-versioned `2026-03`),
  scopes confirmed selectable on private apps.
- Send limits: knowledge.hubspot.com *Sales email send limits*; alias rules:
  *Send sequence emails using an email alias*.
- Record source: knowledge.hubspot.com *View and use the record source
  property* (source + detail 1 immutable; detail 2/3 integration-settable at
  creation).
- Private-app webhooks: developers.hubspot.com *Configure webhooks* (private
  apps, `webhooks.json`); Webhooks Journal API for batched reads.
- CRM Search: 10k window, 5 req/s account-wide (changelog: *CRM search API rate
  limit increase*).
- AUP / Trust & Safety: purchased/rented/borrowed lists prohibited.
- Repo comparison (growth vs wander.com vs monolith clients): explored
  2026-07-03; growth + wander.com share account `22480390` and
  `HUBSPOT_ACCESS_TOKEN_OPERATED`; monolith uses `HUBSPOT_ACCESS_TOKEN`,
  SDK v12.

# HubSpot Gateway & Mirror — Working Plan

**Status:** working document, for review by Danny (sales engineering / HubSpot).
**Date:** 2026-07-03 · **Authors:** Kristian + Claude
**Decision owners:** Kristian (growth), Danny (HubSpot/sales systems)

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
creation only**. With one gateway app writing everything, Record Source says
"the gateway" for all of it — so source distinction lives entirely in our own
fields:

- **A dedicated private app** (new token, sequences + webhook scopes) so
  creations are at least attributable to the gateway, with batch/import ids
  stamped into `hs_object_source_detail_2/3` at creation.
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
| 1 | Merge wander.com client superset into growth's `hubspot.client.ts`; dedicated private app (sequences + webhook scopes); `/api/hubspot/v1` skeleton + auth + `/health` | Gateway deployed, callable, no consumers yet |
| 2 | Provenance layer: property group + custom props, MANUAL join list, promotion path (automates today's manual `applyMerge`) | Growth-sourced records identifiable in HubSpot filters/lists |
| 3 | Port inbound router with accept-then-process; wander.com calls gateway behind a flag with local fallback; dual-run ~1 week, compare in Slack; delete wander.com copy | wander.com has no HubSpot code |
| 4 | `/lifecycle` HubSpot provider: cron import of sequences → `lifecycle_campaign`/`lifecycle_touchpoint`, program↔sequence linking, "reflected in HubSpot" check-off | All 205 sequences visible in /lifecycle strategy view |
| 5 | Webhook receiver → Neon read-model hydration; trim `leads.*` columns that existed only because Neon was SoR (snapshot flags, source booleans); rebuild script | Stale-flag hedging (`HsMarker` "?") deleted |
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
5. **Private app admin:** who besides Kristian holds admin on the new gateway
   app; where does the token live (Vercel env + Doppler)?
6. **Cutover window** for the inbound router (phase 3) — quiet week preference,
   and what the fallback alert should look like in Slack.
7. **Existing 215k imports:** any known provenance for the big IMPORT batches
   (BuiltWith exports?) so the join list can distinguish "ours" vs. "already
   theirs" honestly?

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

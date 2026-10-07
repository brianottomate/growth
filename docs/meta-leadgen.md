# Meta lead ads → Growth

Meta Lead Ads submissions for WanderOS now land in Growth directly: a Page
webhook, with a manual backfill script for anything it misses. Growth normalizes
unstructured form answers into structured facts, then qualifies
each lead and sends the qualified-lead event to Meta itself. This replaces the
Make.com "Meta→HubSpot v2" scenarios and the HubSpot lifecycle-stage bridge
that never fired.

The browser + server Purchase side of pixel 340 (the CAPI PR train across
wander, wander.com, tracking and sites) is tracked in
[`meta-capi-handoff.md`](./meta-capi-handoff.md).

## Moving parts

| Piece | Where |
| --- | --- |
| Webhook (handshake + signed POST) | `src/app/api/webhooks/meta-leadgen/route.ts` |
| Backfill (manual) | `bun run meta-leadgen:backfill --hours 24` under `doppler run --config prd` (up to 168 h) |
| Signature, payload parsing, qualification threshold | `src/lib/meta-leadgen.ts` |
| Structured result schema | `src/server/services/meta-lead-normalization.service.ts` |
| AI normalization | `src/server/services/meta-lead-normalization.service.ts` |
| Graph + Conversions API client | `src/server/clients/meta-leadgen.client.ts` |
| Orchestration, idempotency | `src/server/services/meta-leadgen.service.ts` |
| Ledger table | `leads.meta_leadgen_lead`, managed by committed Drizzle migrations |
| RevenueHero meeting lookup (Make.com webhook) | `src/server/clients/revenuehero.client.ts` |
| Meeting-link drain cron | `src/app/api/cron/meta-leadgen/route.ts` |

Flow per lead: store the leadgen id → fetch the lead with a Page token → normalize
and persist the answers → apply the deterministic 10-unit threshold → if
qualified, send `Marketing Qualified Lead` to pixel
`340252052212435` (CRM event keyed on `lead_id`, `event_id`
`Marketing Qualified Lead:<leadgen id>`) → if the lead was created at or after
`META_LEADGEN_ROUTE_FROM`, hand it to `osInboundLeadRouter` (HubSpot upsert,
round robin, Slack).

Each step claims its stamp (`capi_sent_at`, `routed_at`) with a conditional
update before it runs, so a webhook redelivery and a backfill run on the same
lead can't both send; a failed step releases the claim and records
`last_error`. A handoff only counts when HubSpot returns a contact id (the
router swallows its own HubSpot errors). Nothing retries on its own: run
`bun run meta-leadgen:backfill --hours N` (under `doppler run --config prd`),
which re-reads every active form's last N hours and drains any unfinished
ledger row up to 7 days old. The hourly cron was dropped 2026-09-24 in favour
of this.

### Qualification

Growth uses the existing Anthropic integration (`claude-sonnet-5`) with
`generateText` + `Output.object` + Zod to interpret the full form submission.
The result is one small object: audience, conservative managed-property count,
email, first/last name, phone, PMS, and optional booking-site hostname/pathname.
Missing facts are null. There are no answer indexes, quotes or evidence objects.

AI handles question wording, written numbers, languages and URLs in prose.
Code interpolates the hostname/pathname into an HTTPS URL, constructs tracking
parameters, and passes the facts to the existing HubSpot/Slack router. Code
also owns the operator-only conversion rule and the 10-unit threshold.

A range counts by its low end (`1-10` → 1, `10-199` → 10); upper bounds
(`<10`, "less than ten", "menos de diez") count as 0. A Yes/No gate carries no
count, even when its question mentions a threshold. Conflicting counts are null.
Guest submissions never reach the HubSpot router or the qualified-lead event.

The generated object lives only in memory while processing a lead. Existing
email/unit/qualification fields and delivery stamps are updated as before;
an unfinished lead is normalized again on retry. Only operator emails enter
the sales retry queue; guest contact details remain in the raw answers.

The preview already applied the earlier nullable `normalization` column to the
shared database. Its original migration and snapshot remain as applied history;
a forward migration removes the unused column on the next production release.
The lead ledger and delivery records remain in place.

Invalid output, an unknown audience or an API failure leaves the lead pending
for manual backfill, with no regex fallback. The model receives at most 24,000
characters without truncation and has a 30-second timeout and 1,000-token output
limit, with two retries handled by the AI SDK. This requires the existing `ANTHROPIC_API_KEY` and adds per-lead AI
cost/latency after webhook acknowledgement. No AI evaluation or feature-specific
tests run with the normal checks.

Measured on Meta's raw leads 2026-09-09 → 09-23: **782 leads, 92 qualified
(11.8%), ~43/week**. That sits inside Meta's CRM-optimization guidance (1–40%
conversion, ~50 qualified events/week). HubSpot's view showed ~1 because it only
maps the Conditional form's buckets.

## Meeting-link forms

Meeting-link forms send the lead to book a RevenueHero call with a specific
rep after the submit. They are recognised by name (`isMeetingLinkForm`, case
insensitive): the form name must contain "meeting link", "book a meeting",
"book a call", "book meeting" or "book call". Name new booking forms to match.
Those leads route to that rep instead of the round robin,
through the router's `salesRepEmail` override (the Slack post shows "Meeting
Booked For"). The lead must still normalize as an operator to be routed at all.

The booking lags the Meta webhook by a few minutes, so the webhook usually does
not route these leads. Each pass over an unrouted meeting-link lead asks the
Make.com webhook at `REVENUEHERO_LOOKUP_WEBHOOK_URL` (POST `{ email }` →
`{ "salesRepEmail": "<rep>" }` or `{ "salesRepEmail": null }`,
`src/server/clients/revenuehero.client.ts`) and then:

| Answer | Lead age | Outcome |
| --- | --- | --- |
| rep email | any | `meeting_rep_email` stamped; routed to that rep |
| none, or lookup error | < 5 min (`MEETING_LOOKUP_WINDOW_MS`) | `meeting_checked_at` stamped; `routed_at` left null, next pass asks again |
| none, or lookup error | ≥ 5 min | routed by round robin |
| env var unset | any | routed by round robin (warning logged once) |

"None" is only an explicit no-match (`{}`, or a null or empty `salesRepEmail`).
A non-2xx, a timeout, a body that isn't that JSON, or a rep that isn't an email
is a lookup error, recorded in `last_error`, so a broken Make scenario shows up
instead of passing for "nobody booked".

Every lookup stamps `meeting_checked_at`. `/api/cron/meta-leadgen` re-asks only
the leads that were told to wait (`drainMeetingLookups`): unrouted, no rep yet,
last lookup inside the 5-minute window, and created within the last 6 hours. A
lookup past the window is always followed by a routing attempt, so a lead whose
attempt failed drops out of the cron and is left to the manual backfill like any
other failure; retrying it every pass would repost it to Slack each time, since
the router posts even when HubSpot fails. A pass stops starting leads after
200 s (the route allows 300 s), leaving the lead in flight 100 s to finish so
the pass isn't cut off between claiming `routed_at` and the router returning;
the rest wait for the next pass. It runs
`*/20` in ET business hours on weekdays, hourly otherwise, all on marks Neon is
already awake for. An empty pass is one ledger query. The manual backfill covers
them too. In practice the first cron pass lands after the window, so most leads
get one more lookup and route on that pass, 5–25 minutes after submit in business
hours and up to an hour otherwise. Because normalization is not persisted, a
waiting lead is normalized again on that pass (a second model call per lead).

A rep found once is kept on the row, so a router failure retried by the manual
backfill uses the same rep without asking again. A booking made after the lead has routed does not
change its owner.

## Meta setup (done 2026-09-23)

- App **Wander Growth Leads** `2121713918736592`, owned by the Wander business
  portfolio `472007163864199`, use case "Capture & manage ad leads", **Live**.
  Privacy/deletion URL `wander.com/privacy`, terms `wander.com/terms`.
- System user **Wander Automations** `61575927132574` has Manage app on it.
  Token (never expires): `ads_read, leads_retrieval, pages_manage_ads,
  pages_manage_metadata, pages_read_engagement, pages_show_list`. Approved by
  Brooke Hughes. CAPI to pixel 340 verified with a `test_event_code`.
- Doppler `wander-growth` prd/stg/dev: `META_LEADS_ACCESS_TOKEN`,
  `META_LEADS_APP_SECRET`, `META_LEADGEN_VERIFY_TOKEN`.
- Page **Leads Access → CRMs** lists Wander Growth Leads (assigned
  2026-09-23). Without it Meta verifies the callback but never POSTs a lead;
  Graph reads still work through the system user, so only the backfill
  delivers.
- The Page carries 68 active forms, 62 of them marketplace guest waitlists.
  Only forms that ask the unit question are routed to HubSpot
  (`isOperatorLead`). The separate "WanderOS" Page `1035111979680271` has OS
  Handle forms with no leads and is not watched.
- The system user can't read the pixel's `/stats`; check MQL arrival in the
  Events Manager UI.
- The older `FB_SYSUSER_TOKEN` (app "Wander Data Lake Transfer"
  `245420291973931`) also reads leads but lacks `pages_manage_metadata`, and
  that app's Page webhook callback may belong to the data lake, so leave it.

## Cutover checklist

1. ~~Merge, ship a release.~~ v1.0.130, 2026-09-23. 7-day backfill sent 47
   MQLs.
2. ~~Subscribe the Wander Page to the app for `leadgen` and assign the app in
   Leads Access.~~ Done 2026-09-23; a test lead reached the webhook in 4 s.
   HubSpot workflow `1887873568` disabled the same day.
3. ~~Turn Make off and route from Growth.~~ 2026-09-23: all ten Make
   "Meta→HubSpot v2" scenarios deactivated; `META_LEADGEN_ROUTE_FROM` =
   `2026-09-23T21:22:55Z` (the earliest final Make run); the two leads Make
   handled after it are stamped `routed_at` with `last_error` "routed by Make
   before cutover". Live from v1.0.131; first routed leads verified in HubSpot.
   Make never watched the "…- No less than 5" Matt/Nick forms, so their older
   leads never reached HubSpot; not backfilled (the goal is CAPI).
4. ~~Retire the HubSpot bridge.~~ Workflow `1887873568` and the HubSpot Ads
   conversion event "HubSpot - Marketing Qualified Lead" are off. The other stage
   events (Deep Dive Scheduled, Closed Won…) stay on; Meta joins them on the same
   lead id.
5. `Marketing Qualified Lead` is Active on dataset 340 from the Conversions API.
   Still open (Brooke): configure the CRM funnel (target = MQL) and point the
   qualified-leads ad set at it, in its own campaign (error #1885760: a CBO
   campaign's ad sets must share one optimization goal).

Later: Growth writes to HubSpot itself instead of through the inbound router,
and takes over the remaining Make scenarios (below).

## Why the HubSpot path never fired (investigated 2026-09-23)

- Workflow `1887873568` ("Lead Ads · Qualified (10+ units) → lifecycle MQL")
  sets `lifecyclestage=83628208`, but Wander's lifecycle option order puts
  Marketing Qualified Lead **before** New Lead (`1036403070`). HubSpot blocks a
  backwards stage move unless the workflow clears the property first.
- Its enrollment requires Original source = Paid Social; 5 of the 6 qualified
  Conditional-form leads were pre-existing contacts and 3 had Original source
  Offline. The Meta event's consent gate uses the same property.
- Only the Conditional form's buckets map to a HubSpot property; the other
  forms' free-text counts never become a number HubSpot can test.

## Make.com inventory (us2.make.com, org 26854, "Wander Make Org")

Every Meta scenario has the same shape: **Facebook Lead Ads "List Leads" (poll
every 30 min) → Sleep 10 s → OpenAI "simple text prompt" (normalises answers) →
Set variables ×2 → HTTP POST `/api/os/inbound`** (wander.com, which forwards to
Growth's `/api/hubspot/v1/inbound`). All owned by Danny Mancini, all enabled.

| Scenario | Created | Last edit |
| --- | --- | --- |
| Meta→HubSpot v2 (Call Form - Matt M) | 2026-08-25 | 2026-08-25 |
| Meta→HubSpot v2 (Call Form - Nick) | 2026-08-25 | 2026-08-28 |
| Meta→HubSpot v2 (July 2026 - Long Form + Audit) | 2026-07-23 | 2026-07-23 |
| Meta→HubSpot v2 (July 2026 - Long Form - No Audit) | 2026-07-23 | 2026-07-23 |
| Meta→HubSpot v2 (Long Form) | 2026-05-07 | 2026-07-02 |
| Meta→HubSpot v2 (Long Form - CombinedLALs) | 2026-05-07 | 2026-07-02 |
| Meta→HubSpot v2 (Long Form w/ Intro Updated) | 2026-06-29 | 2026-07-02 |
| Meta→HubSpot v2 (Long Form w/ Intro Updated - Spanish) | 2026-07-08 | 2026-07-08 |
| Meta→HubSpot v2 (Qualified Lead List) | 2026-06-17 | 2026-07-02 |
| Meta→HubSpot v2 (Sept 2026 - Conditional Form) | 2026-09-21 | 2026-09-22 |

One scenario per form, so each new form needs a new scenario. Growth reads every
active form, so new forms are covered automatically.

Other scenarios in the org, for the later takeover (names only, not opened):
HubSpot→Slack (C/W Deals) + backfill, PMS Enrichment (Browser Use), Update
DocuSign Trackers for non-DocuSign Deals, **wOS Onboarding Receiver** (Connor
Adams, 5.5k ops, edited 2026-09-23, webhook-triggered), Apollo - Phone Response,
Advisor Agreement Automation v1, the "ai contract reader" family (Docusign
folder), plus folders Apollo, Commissions, DealHub, Demand Sales, Docusign,
Email Sequences. The OpenAI prompt inside each Meta scenario was not read; check
it before retiring in case it does more than normalise the unit count and PMS.

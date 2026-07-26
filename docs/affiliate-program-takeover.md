# Affiliate Program Takeover — Running Impact.com In-House from growth/

**Status:** proposal, 2026-07-09.
**Context:** Acceleration Partners (AP) hands the Wander affiliate program (Impact.com)
back to Wander effective **8/1/26**. AP's transition plan spreadsheet ("Wander Client
Transition Plan", July 2026) enumerates both the handoff tasks (owners Dan/Emma at AP,
dates 7/10–7/29) and the ongoing program-management playbook Wander now owns.
**Companion doc:** `docs/agent-runtime-options.md` (2026-07-08) — the runtime reasoning
(AI SDK loop vs in-app workflow vs Mastra vs Eve) is settled there; this doc applies it.

## TL;DR recommendation

Run the program from **growth/ with the primitives that already exist** — Impact.com
Brand API client + Vercel crons + Resend inbound email + the generic triage engine +
Slack radio + an `/app/affiliate` room. Every task in AP's playbook maps onto a pattern
this repo has already shipped for social listening, leads, or the HubSpot gateway.
No new runtime is needed for the 8/1 deadline. Eve/Mastra stay on the shelf until the
decision signals in `agent-runtime-options.md` fire (they eventually will — see §8).

The hard deadline shapes the plan: **AP stops monitoring on 7/31.** The mandatory tier
(correspondence, tracking health, voids) must be covered by 8/1; everything else is
optimization and can land in August.

## 1. What AP actually did (the playbook we inherit)

From the transition plan, tiered by AP's own key:

**Mandatory / maintain-program**
| Cadence | Task | Substance |
|---|---|---|
| Daily | Affiliate correspondence | Answer partner emails/calls about the program |
| Daily | Performance & balance | Watch daily reports; catch tracking breaks & balance issues |
| Daily | Network management | Liaison with Impact on compliance/tracking/features |
| Weekly | Fraud check | Referring-URL review of transactions vs approved sources |
| Weekly | Reports | Program performance recap |
| Monthly | Process voids | Submit void file to Impact |
| Monthly | Update terms | Keep program terms current on the partner page |
| Monthly | Monthly report | Campaign recap |
| Quarterly | FTC check | Verify top content affiliates post FTC disclosures |
| Quarterly/Ad hoc | Creative | Keep banners/text links fresh and in popular sizes |

**Optimization / grow-program**
| Cadence | Task | Substance |
|---|---|---|
| Daily | Applications | Review affiliate applications, approve/decline, group, set I/O |
| Monthly | Publisher development | 1:1 outreach to top performers (reviews, giveaways, placements) |
| Quarterly | Recruitment | Prospect via Impact marketplace + outreach outside the network |
| Semi-annual/Yearly | Planning reports, affiliate survey | Strategy + feedback |

**Operational gold from the handoff doc** (preserve regardless of automation):
- Monthly correction procedure: download month's orders via Advanced Action Listing
  incl. the **Text 3** parameter → CSV with `ActionTracker=53787, OID, Amount(Text3),
  Reason=ORDER_UPDATE` → email to `2763eadb-d052-4910-ab2e-0e2c37f572e3@batch.impact.com`
  → propagates in 1–2h.
- Merchant contact becomes `partnerships@wander.com` (AP updates it in Impact by 7/29).
- Wander-side owners: **Ornella Nuñez** (Social Media Manager, program lead —
  tag first on all affiliate matters) and Micaela (cc). (AP's doc lists
  "Ornella, Micaela, and Partnerships@" as the transition-notification set.)
- Known gaps in the doc itself: commission rates are literally `Base/Content: x,
  Loyalty: x, Coupon: x` (unfilled), and the goodbye newsletter has `X` / `email
  address` placeholders needing Wander's named contact + approval before the 7/27 send.

## 2. What already exists in growth/ (the reuse map)

| Building block | Where | Reuse for affiliates |
|---|---|---|
| Inbound email → LLM ingest | `src/app/api/webhooks/resend/route.ts` fans out by recipient local-part (`f5bot` → F5Bot, `inspo` → inspiration); full body fetched via `resend.emails.receiving.get` | Add an `affiliate`/`partnerships` branch → `affiliate-inbound.service.ts` (clone of `ingestF5BotEmail`'s shape) |
| Receiving domain | `src/lib/inbound-email.ts` — catch-all `lexaomo.resend.app` | Any address works today, e.g. `affiliate@lexaomo.resend.app`; nicer domain later |
| Generic AI triage | `triage.service.ts` — `scoreItems(ScoringChannel, items)` (Sonnet), `draftReply` (Opus), channel-parameterized, no core changes needed | Define an affiliate `ScoringChannel` (intent tags: `partner-question`, `application`, `placement-offer`, `compliance`, `fraud-signal`, `noise`) |
| Slack radio | `postOnSlack` (channel-ID posts, non-prod → `#radio-slack-testing`), owner @-ping pattern in `listening-notify.service.ts` | New `#radio-affiliate` channel + owner ping; persist `slackTs` for idempotency |
| Cron infra | `src/app/api/cron/{meta,growth,instagram,x,channels}` + `vercel.json`; `CRON_SECRET`/`ADMIN_TOKEN` auth pattern | `/api/cron/affiliate?job=…` (daily/weekly/monthly jobs multiplexed like `cron/growth`) |
| Authed external gateway | HubSpot gateway `src/app/api/hubspot/v1/*` — bearer + Zod + accept-then-`after()` | Same shape for `/api/webhooks/impact` (event-notification postbacks) |
| Triage queue UI + lifecycle | `mention` table (status/assignee/resolution/replyUrl/decisionNote/slackTs) + `/app/listen` tabs + `mention.router` (`list`/`setStatus`/`assign`) | `affiliate_item` table with the same lifecycle columns; `/app/affiliate` room with the same tab pattern |
| Desired-state "setup tasks" | `listening_source.config.alertTerms[].status: live/to_add/to_remove` + amber panel in `Sources.tsx` | Same pattern for dashboard-only Impact actions (approve application, update terms) — decide in-app, apply in Impact, "Mark applied" |
| Web scraping for checks | `firecrawl.client.ts`, `search-providers.client.ts` | FTC-disclosure checker; recruitment prospecting |
| Outbound email | `resend.client.ts`, verified sender `email.wander.com` | Void-file email to batch.impact.com; publisher-dev drafts; survey |
| Leads pipeline | `leads.*` schema + Instantly/HubSpot projections | Recruitment outside the network is literally this pipeline with an affiliate ICP |

Attribution context (don't touch): conversions already fire **server-side from the
monolith** to Impact.com ("canonical emitter for Order Completed", server-authoritative —
see `src/data/wander-ecosystem.ts` / `tracking-audit.ts`). The ecosystem doc flags a
historical **3-active-Impact-instances dedup/triple-pay risk** — verify current state on
the 7/22 call. This plan adds an *operations* layer; it does not change conversion
emission.

## 3. Impact.com API — verified facts and open questions

Verified against integrations.impact.com (July 2026):

- **Auth:** HTTP basic — `AccountSID` as username, `AuthToken` as password. Tokens are
  created per-user in the Impact dashboard (Settings → API Access).
- **Actions:** list (max 45-day window, filterable), get by ActionId,
  **Update Actions** (action- and line-item-level, async queued with a `QueuedUri`),
  **Reverse Actions** (by ActionId or ActionTrackerId+OrderId). → Voids and the monthly
  Text3 correction process can become API calls instead of the batch-email CSV.
- **ReportExport:** async job → poll Jobs endpoint or get a **Job Completion postback**
  → download result. (Legacy `Reports` endpoint is deprecated for large volumes.)
- **MediaPartners:** list (with `State` incl. `PENDING`/`DECLINED`/`ACTIVE`), get,
  create direct partner, update MPValue custom fields. **No documented approve/decline
  endpoint** — application approval appears dashboard-only → model it as a setup-task
  (decide in-app, click in Impact, mark applied).
- **Event-notification postbacks for brands:** configurable in dashboard (Settings →
  Technical → Event Notifications): action lifecycle (tracked/modified/reversed),
  action inquiries, action clearing, tracking value requests, job completion → HTTP
  POST to our URL. → real-time tracking-health signal without polling.

Open questions → §7 (the 7/22 call agenda).

## 4. Coverage matrix — every playbook task, mechanized

| AP task | Mechanism | Human in the loop | Phase |
|---|---|---|---|
| Affiliate correspondence | partnerships@ Google group forwards a copy to the Resend inbound address → triage (score + intent) → `affiliate_item` + Slack ping with **drafted reply** | Human sends the reply from Gmail (v1); marks item handled in-app | 1 |
| Applications review | Impact's new-application notification emails hit the same inbound pipe; daily cron also lists `State=PENDING` MediaPartners as backstop → LLM site-quality check (Firecrawl fetch of the partner's site) → recommendation + deep link | Human clicks approve/decline in Impact; "Mark applied" | 1 |
| Daily performance & balance | Daily cron: Actions/ReportExport snapshot → `affiliate_metric_daily`; alert on zero-actions (tracking break), balance thresholds, anomalous spikes; action-lifecycle postbacks for real-time | Alert-only; humans act | 1 |
| Weekly fraud check | Weekly cron: actions + referring URLs → rules (approved domains per partner) + LLM classification → flagged items to queue + Slack digest | Human confirms before any reversal | 2 |
| Process voids | Monthly job stages reversals as approval items; on approve → **Reverse Actions API** (fallback: generate CSV + Resend outbound to the batch address) | Explicit approval gate per batch | 2 |
| Monthly corrections (Text3) | Same as voids via **Update Actions API**, once Text3 semantics are confirmed | Approval gate | 2 |
| Weekly/monthly reports | Cron: ReportExport → snapshot → LLM recap (`generateText` + `Output.object`) → Slack + stored in-app | None (read-only) | 1 (weekly) / 2 (monthly) |
| Update terms | Monthly reminder finding with current-terms diff vs `docs/`-tracked terms text | Human edits in Impact | 2 |
| FTC check | Quarterly cron: top content partners by actions → Firecrawl their top pages → LLM disclosure check → findings digest | Human follows up with partners | 2 |
| Creative refresh | Quarterly reminder finding; creative production stays human (media library `/app/media` already exists for assets) | Human | 3 |
| Publisher development | Monthly cron: top/rising partner report + `draftReply` 1:1 outreach drafts (pills: `placement-offer`, `review-ask`, `giveaway`) | Human approves/sends | 3 |
| Recruitment | Reuse the leads pipeline with an affiliate-publisher ICP (search-providers fan-out + enrichment); Impact marketplace browsing stays manual/agent-browser | Human owns outreach | 3 |
| Semi-annual/EOY planning | LLM synthesis over stored snapshots | Human strategy | 3 |
| Affiliate survey | React Email + Resend outbound + a short form route | Human reviews results | 3 |

Nothing in the mandatory tier requires a capability the repo doesn't already have.

## 5. Target architecture

```
Impact.com ──(Brand API: Actions/ReportExport/MediaPartners)──► impact.client.ts
Impact.com ──(event-notification postbacks)──► /api/webhooks/impact (bearer, Zod, after())
partnerships@wander.com (Google group)
   └─ forwards copy ──► affiliate@lexaomo.resend.app ──► /api/webhooks/resend (existing)
                                                            └─ new "affiliate" branch
                                                                └─ affiliate-inbound.service.ts
crons: /api/cron/affiliate?job=daily|weekly|monthly ──► affiliate-monitor.service.ts
services ──► scoreItems/draftReply (triage.service.ts, unchanged)
         ──► affiliate_item / affiliate_partner / affiliate_metric_daily (affiliate-schema.ts)
         ──► postOnSlack → #radio-affiliate (+ owner ping, slackTs persisted)
             (partner-email items are NOT posted — owners already get the mail;
              set AFFILIATE_RADIO_EMAIL_ALERTS=true to re-enable)
UI: /app/affiliate — tabs: inbox | applications | partners | reports | playbook
    (Listen.tsx tab pattern; setup-task amber panel for dashboard-only Impact actions)
```

New pieces, following house conventions (thin client, orchestration in services,
`pgTable` + barrel export, `z.string().optional()` env vars):

- `src/server/clients/impact.client.ts` — basic-auth fetch wrapper; `listActions`,
  `getAction`, `updateAction`, `reverseAction`, `exportReport`+`pollJob`,
  `listMediaPartners`. Env: `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN`,
  `IMPACT_PROGRAM_ID`, `IMPACT_WEBHOOK_TOKEN` (all optional → client no-ops).
- `src/server/db/affiliate-schema.ts` — `affiliate_partner` (Impact cache + our notes/
  grouping), `affiliate_item` (triage queue: kind = email|application|fraud_flag|
  correction_batch|finding; mention-style lifecycle columns), `affiliate_metric_daily`.
  Remember the barrel.
- `src/server/services/affiliate-inbound.service.ts`, `affiliate-monitor.service.ts`,
  `affiliate-notify.service.ts`; `affiliate.router.ts` (list/setStatus/assign/approve).
- Slack: create `#radio-affiliate`, invite the wandercom bot (same manual step as
  #radio-social-listening), owner TBD (partnerships owner — Micaela?).

Email plumbing detail: wander.com MX is Google, so partnerships@ can't point at Resend
directly. The Google group simply gets the Resend address added as a member (or a
forwarding rule) — humans keep Gmail, the system gets a copy of every message including
Impact's own notification emails. Outbound (void CSVs, publisher-dev sends if we ever
automate them) goes via the already-verified `email.wander.com` sender. If we want a
prettier inbound address later, delegate MX on a dedicated subdomain (e.g.
`in.wander.com`) to Resend — subdomain only, never the root.

## 6. Phased plan against the transition calendar

**Phase 0 — this week (before the 7/22 AP call)**
1. Get Impact API credentials: Settings → API Access in the Wander Impact account
   (or ask AP/Ornella to enable). Doppler `IMPACT_*` in dev/stg/prd.
2. Build `impact.client.ts` read-only + a behind-a-flag daily snapshot cron. Seeing
   real Actions data before the call makes the questions concrete.
3. Create `#radio-affiliate`, invite the bot.
4. Fill the two gaps in AP's doc from Wander's side: named contact for the newsletter
   (recommend just `partnerships@wander.com`) and chase the commission-rate breakdown.

**Phase 1 — by 8/1 (mandatory-tier coverage live)**
5. Resend inbound branch + affiliate triage channel + `affiliate_item` + Slack radio.
6. Group-forward partnerships@ → the inbound address (needs Workspace admin).
7. Tracking-health alerts (zero-actions, day-over-day drop, balance if exposed).
8. Applications queue (notification emails + PENDING partner backstop) with drafted
   verdicts + Impact deep links.
9. Weekly report digest to Slack.
10. `/app/affiliate` room v1 (inbox + applications tabs suffice).

**Phase 2 — August (actions with approval gates)**
11. Voids/corrections as staged approval batches → Reverse/Update Actions API
    (CSV-email fallback until Text3 semantics are confirmed).
12. Weekly fraud check; FTC quarterly checker; monthly report + terms reminder.
13. Impact event-notification postbacks → `/api/webhooks/impact`.

**Phase 3 — September+ (growth tier)**
14. Publisher-development drafts, recruitment via leads pipeline, survey, planning
    synthesis. Revisit runtime choice (§8) once approval-gated multi-step workflows
    are real.

Effort calibration: Phase 1 is roughly the size of the inbox/listen split (a two-day
push) because every piece is a clone of a proven pattern.

## 7. Agenda for the 7/22 AP handoff call

1. **API access:** Is API Access enabled on the Wander account? Who holds admin to
   create an AccountSID/AuthToken? Any existing postbacks/integrations configured?
2. **Corrections:** What does **Text3** carry exactly, and why do corrections flow
   through it? Is the batch-email CSV required, or is Update/Reverse Actions API
   equivalent? What's ActionTracker `53787` (which event tracker)?
3. **Commission rates:** actual Base/Content, Loyalty, Coupon values (doc says "x").
4. **Applications:** dashboard-only approve/decline? What rubric did AP apply?
   Any auto-approval rules configured? Expected weekly volume?
5. **Fraud check:** which Impact reports exactly; the red flags they look for;
   any past incidents.
6. **Balance/funding:** how the account is funded, autopay thresholds, who gets
   balance alerts today.
7. **Top partners:** the 7/10 contact list; who needs white-glove intros; any
   placements/deals in flight (their placement/recruitment trackers).
8. **Instances:** confirm the historical 3-Impact-instances situation is resolved —
   exactly one active program? Any duplicate-enrollment tracking quirks (their
   "daily network management" mentions dupe-enrollment work)?
9. **Terms:** where the canonical program terms live; cadence and process for the
   monthly best-practice update.
10. **Newsletter:** approve copy + confirm contact = partnerships@wander.com.

## 8. Runtime choice — applying `agent-runtime-options.md`

Per the decision signals in that doc:

- **Phase 1–2 is "in-app deterministic workflow + batch analyst":** crons gather,
  rules + `scoreItems` judge, findings land in a queue, humans act. That's the
  "stay with AI SDK plus app services" column. No Mastra, no Eve.
- **Mastra's trigger** ("named steps and resumable approval gates, same workflow
  repeatedly over batches") is exactly the **voids/corrections batch** and, later,
  fraud-investigate→confirm→reverse. If those grow beyond stage-approve-execute
  (they may not), that's the first Mastra candidate — behind the same app services.
- **Eve's trigger** ("wake on a schedule and talk to people outside the app; a
  staff-facing channel is the primary surface") fits a future **affiliate ops agent
  in #radio-affiliate** that answers "how's the program doing", chases approvals,
  and files findings via growth's authed API (HubSpot-gateway pattern = the tool
  surface Eve would call). Worth an experiment *after* 8/1, not on the critical path —
  Eve is three weeks old and the deadline is real.
- The structured-findings shape proposed there (`finding`/`run` records) is what
  `affiliate_item` should stay compatible with, so a future runtime swap writes the
  same records.

## 9. Decisions needed from Kristian / team

1. Who owns the affiliate program day-to-day (the Slack ping target + Gmail replier)?
   The AP doc implies Micaela is already the Impact contact.
2. Approve the partnerships@ → Resend copy-forward (Workspace admin action).
3. Named contact + copy approval for AP's 7/27 goodbye newsletter.
4. Green-light Phase 0 API credential setup (needs whoever holds Impact admin).
5. Slack channel name: `#radio-affiliate` (proposed).

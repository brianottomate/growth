# Wander Message Streams: From Independent Channels to Orchestrated Communication

> **Author**: Growth Engineering
> **Date**: March 5, 2026
> **Audience**: Kyle (CMO), Brian (Customer.io), Sorrell (Outreach/Demand Sales)
> **Status**: Proposal — requesting alignment on vocabulary, current gaps, and next steps

---

## Why This Document Exists

A Wander user doesn't experience "the Customer.io team" or "the Outreach team." They experience *Wander*. When they get a welcome email at 9am, a BDR cold email at 11am, and a newsletter at 2pm — all on the same day — they experience a company that doesn't know what it's doing.

Today we have good tools, good people, and good intentions. What we're missing is the connective tissue between them: shared rules for who talks to a user, when, and what happens when two teams want to talk to the same person at the same time.

This document proposes a shared vocabulary for that problem, describes where we are today, and outlines what coordinated messaging could look like.

---

## Overarching Concept

Wander messaging should be treated as one **Communication Orchestrator**, not separate campaigns by team.

### 1) Two-tier channel model

- **Tier 1 (decisioning channels)**: Onboarding, Newsletter/Topics, Property Recommendations, Sales Outreach, Transactional, Concierge.
- **Tier 2 (downstream amplification channels)**: Ads, Social, and later Video.

Tier 2 should not decide independently. It should consume eligibility and suppression state from Tier 1.

### 2) Ads are part of orchestration

- Ads must follow the same suppression and frequency logic as email and sales outreach.
- Example: if a user is in onboarding or an active booking window, prospecting ads should be paused or narrowed.

### 3) Video is downstream

- Video is a content format/distribution channel, not a separate decision engine.
- We decide *who should be messaged* upstream; video decides *how that message is delivered* downstream.

### 4) Newsletter topic subscription source of truth

- **Customer.io should be the writable source of truth** for topic subscriptions and channel preferences.
- The `wander.com` UI in the Next.js app should be a wrapper interface:
  - User updates preferences in the app.
  - Backend writes to Customer.io profile attributes/lists.
  - Backend emits events to Segment for audit/history.
- Avoid dual writable truth between app DB and Customer.io.

### 5) Practical implication

The system we are designing is not "just better campaigns." It is shared state + explicit rules across channels:

- Enrollment rules
- Suppression/precedence rules
- Handoff rules
- Frequency caps
- Observability of what each user has received across all channels

---

## Part 1: Vocabulary

Before we can fix anything, we need to agree on what we're talking about. These six concepts are the building blocks:

### Streams

A **message stream** is a series of messages from a single team/tool with a shared purpose. Wander currently has six:

| Stream | Tool | Owner | Purpose |
|--------|------|-------|---------|
| **Onboarding** | Customer.io | Growth/Lifecycle | Welcome sequence — introduce Wander, nudge first booking |
| **Newsletter & Topics** | Customer.io | Brian's team | General newsletters, destination guides, seasonal promos |
| **Property Recommendations** | Customer.io | Growth Engineering | Personalized recs based on search/wishlist behavior |
| **Sales Outreach** | Outreach | Sorrell / Demand BDRs | 1:1 personal outreach for high-value leads |
| **Transactional** | System (backend) | Engineering | Booking confirmations, check-in instructions, receipts |
| **Concierge** | Human (manual) | Nick Waze | 1:1 trip planning and VIP support for booked guests |

Each stream has its own trigger, its own cadence, and its own exit criteria. The problem is they run independently.

### Phases

A **phase** is where a user is in their lifecycle. A user moves through phases over time, but they can only be in one phase at a time:

```
Signup → Onboarding → Active Browsing → Qualified Lead → Booking → Pre-Trip → During Trip → Post-Trip
          (7-14 days)    (ongoing)        (event-driven)   (instant)  (days-months)  (1-14 nights)  (30 days)
```

Phases matter because they determine which streams *should* be active. During onboarding, the user should hear one clear voice. During pre-trip, transactional and concierge are appropriate but newsletters are noise.

### Enrollment Rules

An **enrollment rule** defines what puts a user into a stream. Today these are implicit — someone set up a campaign trigger months ago and it just runs. We need to make them explicit:

- Onboarding: enrolls on `User Signed Up`
- Sales Outreach: enrolls when lead score crosses threshold, or `Payment Info Entered` on high-value property
- Concierge: enrolls on `Order Completed` (for qualifying bookings)

### Suppression Rules

A **suppression rule** says: "when stream A is active, pause or skip stream B." This is the most critical missing piece today.

Two flavors:
- **Hard suppression**: stream B *must not* send while A is active (e.g., no newsletters during onboarding)
- **Soft coordination**: stream B *should avoid* sending within a time window of A (e.g., don't send newsletter same day as BDR outreach)

### Conflict Zones

A **conflict zone** is a specific phase where multiple streams overlap and no suppression rule exists. These are the places where users get a bad experience. We've identified five — detailed in Part 2.

### Handoff Rules

A **handoff rule** defines what happens when a user transitions between phases — which streams start, which stop, and what data gets passed. For example: when a user books, onboarding should end, transactional should start, and the BDR should be notified so they can adjust their sequence.

---

## Part 2: Where We Are Today (Status Quo)

### Current concerns

- No centralized naming, planning, or stream inventory.
- Fear of "double touch" from overlapping streams.
- Lack of design and brand cohesion between emails.
- Customer.io to Outreach sync (and reverse sync) is incomplete.
- No shared user-state model (`onboarding`, `sales-engaged`, `booked`, `in-trip`, etc.).
- No explicit stream precedence when streams conflict.
- Inconsistent trigger and exit definitions across teams.
- No global frequency caps across all channels.
- Weak observability into "what this user received this week."
- Limited auditability for suppressions and handoffs.
- Manual handoffs between Marketing, Sales, and Concierge are brittle.
- Sync latency/failure risk can create stale or conflicting state.
- Deliverability risk from overlapping campaigns near booking windows.
- Unclear ownership and escalation path for orchestration incidents.

### The good

- **Customer.io** is well-configured with 172 tracked events flowing through Segment, solid campaign infrastructure, and a working abandoned cart flow.
- **Outreach** has active BDR sequences for demand-side leads, with CIO webhook integration for lead handoff.
- **Transactional emails** fire reliably on booking events from the backend.
- **The growth platform** (this codebase) handles CIO ↔ Outreach sync, BDR assignment, and property recommendation pipelines.

### The gaps

Here's what's actually happening to users today, based on our audit of the event pipeline and tool configurations:

#### Gap 1: No suppression during onboarding

When a user signs up, the onboarding sequence starts in CIO. But there's nothing stopping a newsletter from also going out that week, or property recs from firing if they view 3+ properties during their first session.

**Result**: New user gets welcome email (day 0), then a newsletter (day 2), then a "properties like the ones you viewed" email (day 3). Three emails in three days from three different "senders" within CIO. The onboarding narrative is broken.

**What's missing**: A CIO segment or attribute that marks users as "in onboarding" and suppresses other campaigns.

#### Gap 2: Sales and marketing don't know about each other

When a user qualifies for BDR outreach (high intent, payment info entered, enterprise inquiry), Sorrell's team picks them up in Outreach. But CIO doesn't know this happened. The user continues receiving automated marketing emails — including generic recs — while a BDR is trying to build a personal 1:1 relationship.

**Result**: BDR sends a carefully personalized "I noticed you were looking at properties in Tahoe" email. Two hours later, CIO sends "Top 10 Beach Houses This Spring!" The personal touch is undercut.

**What's missing**: Outreach enrollment status synced back to CIO as an attribute, so marketing campaigns can check it and suppress.

#### Gap 3: Booking creates a message flood

When `Order Completed` fires, multiple streams activate simultaneously:
1. Transactional: booking confirmation, payment receipt
2. Concierge: welcome message, trip planning offer
3. Newsletter: doesn't know a booking happened, sends on its regular schedule
4. Property recs: may still be running from pre-booking browsing

**Result**: User books a trip and gets 3-4 emails within 48 hours from different parts of Wander. The concierge sends personalized check-in info, then the system sends automated check-in instructions covering the same ground.

**What's missing**: Post-booking suppression window for marketing streams. Coordination flag between concierge and transactional.

#### Gap 4: Concierge and system step on each other

The concierge team (Nick) manually handles high-touch guest communication — trip planning, special requests, check-in coordination. The transactional system also sends automated check-in instructions, pre-trip checklists, and mid-stay check-ins.

Neither system knows what the other has sent.

**Result**: Guest gets a warm personal message from their concierge with check-in details at 2pm, then gets an automated "Your check-in instructions" email at 4pm with the same information in a different format.

**What's missing**: A flag in CIO (or the booking system) that marks when concierge has handled a specific touchpoint, so the automated message can be skipped.

#### Gap 5: Post-trip is a free-for-all

After checkout, everything fires at once:
- Transactional: review request (day 1), rebooking nudge (day 14)
- Concierge: thank you / feedback follow-up
- Newsletter: resumes regular cadence
- Property recs: resume based on new browsing

There's no sequencing.

**Result**: Day 1 after checkout: review request email + concierge follow-up. Day 2: newsletter. Day 3: property recs. Four emails in three days, right when the user's inbox goodwill from the trip is at its peak.

**What's missing**: A post-trip sequencing plan that spaces messages out and prioritizes the highest-value touchpoint first (review request), then gradually re-enrolls the user in marketing streams.

### The technical root cause

These aren't tool problems. CIO can suppress campaigns. Outreach can sync data back. The backend can set flags.

The root cause is that **each stream was built independently, by different people, at different times, with no shared orchestration layer.** There's no place where the rules live, no place where "is this user in a sales sequence?" is checked before sending a marketing email.

---

## Part 3: Proposed Future

### The goal

Any Wander user, at any point in their lifecycle, receives messages that feel like they're coming from **one coordinated team** — not six independent systems racing to their inbox.

### Principle: Fewer, better messages

The instinct is always to add more messages. The higher-leverage move is to *remove* messages that conflict and *sequence* messages that complement each other. A user who gets 2 perfectly-timed emails trusts Wander more than a user who gets 6 overlapping ones.

### Content wheel baseline (Marketplace)

To operationalize this for `wander.com`, we should run a fixed baseline and then layer "special" interventions on top.

#### Baseline cadence

| Channel | Baseline |
|--------|----------|
| Themes | 12 per year (1 per month) |
| Blog | Current reality: ~25 posts per month |
| Ads | 3 per week, derived from monthly theme + blog/video/stories + specials |
| Video | 1 every 2 weeks, derived from existing content + specials |
| Social | 3-4 posts per week, mix of cross-post and channel-native |
| Newsletter (general) | 1 per week |
| Newsletter (Wander recs) | 1 per week |

#### Source content for derivatives

- Blog posts
- Videos
- Customer stories
- Operator stories
- Specials (human intervention)

#### "Special" slot policy

When a special campaign is launched, it must follow one explicit slot rule:

- **Replace**: push planned content by 1 slot
- **Insert**: add an extra bulletin without moving baseline slots

This keeps the calendar predictable while preserving flexibility.

#### Why this matters for orchestration

At ~25 blog posts/month, production volume is already high. The risk is not "too little content"; the risk is uncoordinated distribution across channels. The orchestrator needs to control:

- Which audience gets which derivative content
- Which channels are suppressed in each lifecycle phase
- Frequency caps across email + ads + social touches

### Proposed suppression rules

These are the specific rules we'd implement across CIO, Outreach, and the transactional system:

#### Hard suppressions (must enforce)

| When this is active... | ...suppress this | Implementation |
|------------------------|------------------|----------------|
| Onboarding sequence | Newsletter | CIO segment: `onboarding_active = true` → exclude from newsletter campaigns |
| Onboarding sequence | Property recs | Same segment check in recs campaign trigger |
| Active booking (pre-trip / during-trip) | Property recs | CIO attribute: `has_active_booking = true` → pause recs |

#### Soft coordinations (should enforce)

| When this happens... | ...coordinate this | Implementation |
|----------------------|-------------------|----------------|
| BDR sends in Outreach | Newsletter within 48h | Sync `outreach_sequence_active` attribute to CIO via growth platform webhook |
| BDR sends in Outreach | Property recs | Same attribute check |
| Transactional email sent | Newsletter within 24h | CIO workflow: check `last_transactional_email_at` timestamp before newsletter send |
| Concierge handles check-in | Automated check-in email | CIO attribute: `concierge_handled_checkin = true` → skip automated version |

### Proposed post-booking sequence

Instead of everything firing at once after `Order Completed`:

| Timing | Stream | Message |
|--------|--------|---------|
| Immediately | Transactional | Booking confirmation + receipt |
| +4 hours | Concierge | Personal welcome + trip planning offer |
| +24 hours | *suppress all marketing* | — |
| +48 hours | *suppress all marketing* | — |
| +7 days (or 7 days before trip) | Transactional | Pre-trip checklist |
| Pre-trip period | Concierge | Active trip planning (as needed) |
| Post-checkout day 1 | Transactional | Review request |
| Post-checkout day 3 | Concierge | Thank you + feedback |
| Post-checkout day 7 | Property recs | Resume (new recs based on completed trip) |
| Post-checkout day 14 | Newsletter | Resume regular cadence |
| Post-checkout day 14 | Transactional | Rebooking nudge |

### What needs to change in each tool

#### Customer.io (Brian)

1. **Add lifecycle attributes** to every user profile:
   - `onboarding_active` (boolean) — set true on signup, false on sequence completion or booking
   - `outreach_sequence_active` (boolean) — synced from growth platform when BDR enrolls/completes
   - `has_active_booking` (boolean) — set on `Order Completed`, cleared on checkout date
   - `concierge_handled_checkin` (boolean) — set by concierge team (manual or via Slack trigger)
   - `last_transactional_email_at` (timestamp) — set by transactional system

2. **Add suppression checks** to newsletter and recs campaigns:
   - Newsletter: skip if `onboarding_active = true` OR `outreach_sequence_active = true` AND last BDR message < 48h OR `last_transactional_email_at` < 24h ago
   - Recs: skip if `onboarding_active = true` OR `has_active_booking = true` OR `outreach_sequence_active = true`

3. **Post-booking suppression window**: On `Order Completed`, suppress all non-transactional campaigns for 48 hours.

#### Outreach (Sorrell)

1. **Webhook on sequence enrollment/completion**: When a prospect enters or exits an Outreach sequence, fire a webhook to the growth platform so we can update CIO attributes.
   - This already partially exists — the growth platform has Outreach webhook infrastructure. We need to extend it to capture sequence lifecycle events.

2. **Check CIO state before manual outreach**: Before BDRs reach out, they should be able to see (in Outreach or a shared view) whether the user just booked, is in onboarding, or has an active concierge conversation. This prevents "hey, have you considered booking?" emails to people who booked yesterday.

#### Growth Platform (Engineering)

1. **Attribute sync service**: Listen for Outreach webhooks (sequence start/stop) and update CIO attributes in real time. We already have the CIO client and Outreach webhook infrastructure — this is wiring them together.

2. **Booking lifecycle hooks**: On `Order Completed` and checkout events, update the relevant CIO attributes (`has_active_booking`, suppress window).

3. **Concierge flag API**: Simple endpoint or Slack command that lets the concierge team mark "I've handled check-in for booking X" → updates CIO attribute.

#### Transactional System (Engineering)

1. **Write `last_transactional_email_at`** to CIO on every transactional send. This is a one-line addition to the existing email service.

2. **Check `concierge_handled_checkin`** before sending automated check-in instructions. Skip if true.

### Phased rollout

We don't need to do everything at once. Here's a suggested order based on impact and difficulty:

**Phase 1 — Quick wins (week 1-2)**
- Add `onboarding_active` attribute to CIO, set it in the onboarding campaign
- Add suppression filter to newsletter and recs campaigns
- This alone fixes Gap 1 for every new user going forward

**Phase 2 — Sales coordination (week 3-4)**
- Build Outreach → growth platform → CIO attribute sync for `outreach_sequence_active`
- Add suppression filter to marketing campaigns
- This fixes Gap 2 — BDRs get a clean field when they're working a lead

**Phase 3 — Booking orchestration (week 5-6)**
- Implement `has_active_booking` lifecycle attribute
- Add post-booking suppression window (48h)
- Build the sequenced post-booking timeline
- This fixes Gaps 3 and 5

**Phase 4 — Concierge coordination (week 7-8)**
- Build concierge flag system (Slack command or simple UI)
- Add `concierge_handled_checkin` check to transactional system
- This fixes Gap 4

---

## What We're Asking For

1. **Alignment on the vocabulary** — do these six streams and eight phases match how you think about our communication? Are we missing any?

2. **Agreement on the suppression rules** — are the hard/soft designations right? Are there rules we should add or remove?

3. **Ownership commitment** — each tool change needs an owner:
   - CIO attributes and campaign filters → Brian
   - Outreach webhook setup → Sorrell
   - Growth platform sync + booking hooks + concierge API → Growth Engineering

4. **Priority call** — the phased rollout puts onboarding suppression first (highest impact, lowest effort). Does that match your priorities?

---

## Appendix: Stream Activity by Phase

This table shows which streams are active (or should be active) in each lifecycle phase. Cells marked with **!** indicate conflict zones where suppression rules are needed.

| Phase | Onboarding | Newsletter | Recs | Sales | Transactional | Concierge |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| Signup | ON | **!** | **!** | - | - | - |
| Onboarding | ON | suppressed | suppressed | - | - | - |
| Active Browsing | - | ON | ON | - | - | - |
| Qualified Lead | - | **!** | **!** | ON | - | - |
| Booking | - | **!** | suppressed | winds down | ON | - |
| Pre-Trip | - | suppressed | suppressed | - | ON | ON **!** |
| During Trip | - | suppressed | suppressed | - | ON | ON **!** |
| Post-Trip | - | sequenced | sequenced | may re-enroll | ON | ON |

**Legend**: ON = actively sending, suppressed = paused by rule, **!** = conflict zone / needs rule, sequenced = resumes on a timed schedule, - = not active

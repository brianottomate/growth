# Wander Digital Infrastructure Overview

> **Audience**: Kyle (CMO), Brian (CIO), C-suite, Design leads
> **Purpose**: Alignment on current state, open decisions, and recommended direction
> **Date**: March 2026
> **Status**: Draft — requesting alignment

---

## The Two-Surface Model

Everything in this document flows from one foundational decision we've already made:
Wander operates two distinct products with different users, different goals, and different
marketing motions. They should be treated as separate surfaces.

| | **Marketplace** | **WanderOS** |
|---|---|---|
| **What it is** | Guest-facing vacation rental marketplace | B2B SaaS for property operators |
| **Users** | Travelers booking stays | Property managers / hosts |
| **Scale** | Millions | Thousands |
| **Conversion KPI** | Booking completed | Site published / listing approved |
| **Primary domain** | wander.com | app.wander.com |
| **Acquisition pages** | wander.com (everywhere) | wander.com/os, wander.com/listed |
| **Segment source** | `marketplace-web`, `marketplace-backend` | `host-web`, `host-backend` |

A host who also books a vacation as a guest appears in both surfaces — tracked in one
shared Segment workspace with a unified profile. The overlap is small but fully visible.

---

## 1. Domains

| Domain | Surface | Status | Notes |
|--------|---------|--------|-------|
| `wander.com` | Marketplace + WanderOS acquisition | Live | Hosts all guest-facing pages and WanderOS landing pages. Design lead requirement: WanderOS marketing stays on wander.com, not a subdomain. |
| `app.wander.com` | WanderOS product (host dashboard) | Live / active development | Single dashboard for all external operators — whether managing marketplace listings or running a WanderOS direct booking site. Target state for all host-facing product. |
| `os.wander.com` | Legacy back office | Legacy / no new investment | Wander-Operated homes only. Small user base, indefinite hold. Not part of the growth roadmap. |

**No open decisions here.** Domain strategy is settled.

---

## 2. Social Media Handles

### Marketplace

| Platform | Handle | Status |
|----------|--------|--------|
| Instagram | [@wander](https://www.instagram.com/wander) | Primary |
| TikTok | [@wander](https://www.tiktok.com/@wander) | Active |
| Facebook | [/wanderfb](https://www.facebook.com/wanderfb/) | Active |
| LinkedIn | [/company/wandercom](https://www.linkedin.com/company/wandercom) | Active |

### WanderOS

WanderOS has its own social handles — distinct from the marketplace because the audience
(property managers, operators) is completely different from travelers.

| Platform | Recommendation | Rationale |
|----------|---------------|-----------|
| LinkedIn | **Must have** | Primary channel for B2B SaaS. Property managers are professionals. Required for paid acquisition. |
| Instagram | **Worth having** | WanderOS is a visual product (website builder). Showcasing customer direct booking sites is strong content. |
| YouTube | **Eventually** | Product demos, tutorials, customer stories. High value once the product has depth to show. |
| TikTok | Not yet | Doesn't fit B2B audience. |
| Facebook | Page only | Needed for pixel / ad purposes, not a content investment. |

**Open decision for CMO**: Is WanderOS positioned as a Wander sub-brand ("built by the team
behind Wander") or as a standalone product brand? This determines how aggressively we need
to build a separate WanderOS audience vs. leveraging the existing @wander following.

---

## 3. Blog

### Current state

The blog lives within `wander.com`, managed by an agency via CMS. Content is guest-facing:
destination guides, travel inspiration, property spotlights. Approximately 25 posts/month.

The blog is part of the Marketplace surface. Blog events (`Blog Post Viewed`, page views)
carry `page_family: 'marketplace'` and route to the marketplace Segment source.

### WanderOS blog

No dedicated WanderOS blog exists yet. Options:

| Option | Effort | Notes |
|--------|--------|-------|
| WanderOS tag on existing blog | Low | Simplest. No new setup. Content appears alongside guest content. |
| `wander.com/os/blog` dedicated section | Medium | Clean separation, same domain. Better for SEO targeting operator keywords. |
| Standalone WanderOS blog | High | Full brand separation. Only worth it with dedicated content person. |

**Recommendation**: WanderOS tag on the existing blog for now. Revisit when WanderOS
has dedicated content headcount.

**Open decision for CMO**: What's the WanderOS content strategy? Is there a plan for
operator-focused content (PMS guides, direct booking benchmarks, host playbooks)?

---

## 4. Newsletter & Message Streams

### Current state

Wander currently has six messaging streams running across three tools — but they run
independently, with no shared coordination layer.

| Stream | Tool | Owner | Purpose |
|--------|------|-------|---------|
| Onboarding | Customer.io | Growth | Welcome sequence, nudge to first booking |
| Newsletter & Topics | Customer.io | Brian | Weekly blasts, destination guides, seasonal promos |
| Property Recommendations | Customer.io | Growth Engineering | Personalized recs based on browsing/wishlist |
| Sales Outreach | Outreach | Sorrell / BDR team | 1:1 personal outreach for high-value leads |
| Transactional | Backend | Engineering | Booking confirmations, check-in instructions |
| Concierge | Manual | Nick Waze | 1:1 trip planning and VIP support |

### The core problem

These streams were built independently, at different times, by different people.
There are no suppression rules between them. A user can simultaneously receive
a personalized BDR email, an automated newsletter, and a property recommendation
— all on the same day, all feeling like they come from different companies.

Five specific conflict zones are documented in detail in
[`message-streams-proposal.md`](./message-streams-proposal.md).
The most critical: **post-booking message flood** (booking confirmation + concierge
welcome + newsletter + property recs all firing within 48 hours) and **sales/marketing
blindness** (BDR sends a personal email; CIO sends a mass blast two hours later).

### Proposed direction

Treat Wander's messaging as one **Communication Orchestrator**, not six independent
campaigns. Key principles:

- **Suppression rules over more sends.** Fewer, better-timed messages outperform
  more messages by volume.
- **Customer.io is the source of truth** for user preferences and suppression state.
- **Ads follow the same suppression logic** as email — if a user just booked, pause
  prospecting ads.
- **Lifecycle phases** determine which streams are active. A user in onboarding
  should hear one clear voice. A user in pre-trip should get transactional and
  concierge — not newsletters.

**Phased rollout** (full detail in message-streams-proposal.md):

| Phase | What | Impact |
|-------|------|--------|
| Week 1–2 | Onboarding suppression in CIO | Fixes email flood for every new user going forward |
| Week 3–4 | Outreach → CIO attribute sync | BDRs get a clean field; marketing backs off during sales |
| Week 5–6 | Post-booking orchestration | Sequences the booking confirmation, concierge, and re-entry |
| Week 7–8 | Concierge coordination flag | Prevents automated system stepping on personal concierge |

### WanderOS comms

No defined WanderOS comms infrastructure exists yet. When it's built, it should be
a **separate stream entirely** — host onboarding, product activation, billing —
kept distinct from guest comms via `business_line: 'host'` segmentation in Customer.io.

**Open decision for CMO/Brian**: Separate Customer.io workspace for WanderOS, or
segments/attributes within the existing workspace? Same workspace with strict segmentation
is probably sufficient unless there's a billing or compliance reason to separate.

---

## 5. Analytics & Tracking (Segment)

### Architecture

**One Segment workspace, multiple sources.** Segment's own guidance is to avoid
splitting workspaces for product or brand separation — splitting creates a hard wall
that makes cross-product questions (guest-host overlap, suppression, lifetime value)
structurally harder. Instead: one workspace, separate sources per surface, labels
for partitioning (`Product=Marketplace/Host`, `Env=Prod/Dev`), resource-scoped roles.

**One shared client instance on wander.com.** Segment prohibits loading Analytics.js
twice on the same page. wander.com uses one Segment snippet everywhere. Pages on
`/os` and `/listed` fire events through the same instance with additional properties
— `page_family: 'os' | 'listed'`, `business_line: 'host'` — to distinguish them
downstream without a second write key.

**Server-side sources are separate.** No browser constraint applies. The backend and
`app.wander.com` can use distinct write keys to route events to different downstream
configs (e.g. Impact.com enabled only on the marketplace backend source).

### Current state (11 sources in Segment)

**Key known issue — Order Completed triple-fire**: The single most important
conversion event fires from three places: the browser (wander.com), the backend, and
the mobile app. Impact.com has three destination instances configured, one of which
is on a deprecated source. This creates a real risk of triple-counting affiliate
commissions. **Highest-priority tracking fix.**

### Target state

| Surface | Segment Source | Key Destinations |
|---------|---------------|-----------------|
| wander.com (all pages) | `marketplace-web` | Amplitude, Mixpanel, Customer.io, ad pixels |
| Mobile app | `marketplace-mobile` | Same as above |
| Wander backend | `marketplace-backend` | Impact.com ✓, Customer.io, reporting |
| app.wander.com | `host-web` | Customer.io (host), host reporting |
| WanderOS backend | `host-backend` | Customer.io (host) |

**Rule**: Impact.com conversions only from `marketplace-backend` — never client or mobile.

---

## 6. Pixels (Ad Attribution)

Pixels are tracking scripts that fire events back to ad platforms (Meta, Google).
They're used for conversion measurement, remarketing audiences, and lookalike audience
building. The key question is whether Marketplace and WanderOS share pixels or have
their own.

### Current state

The marketplace has a Meta pixel and Google tag installed on wander.com.
WanderOS has no dedicated pixel setup yet.

### Recommended approach: one pixel, custom events

One Meta pixel with well-named custom events is sufficient for now and is how mature
platforms (Airbnb included) operate. Fire `Purchase` on booking completion,
`CompleteRegistration` on WanderOS signup, `Lead` on /listed form submit — all through
one pixel, attributed to their respective campaigns. Ad platforms handle this cleanly.

**When to add a second pixel ID**: Only when WanderOS has dedicated ad campaigns needing
fully independent audience pools — likely when there's a dedicated WanderOS marketing
person. Note: Segment's Facebook Pixel destination is device-mode only; a second pixel ID
routed through Segment would require a second web source.

**Open decision for CMO**: Shared ad accounts with one pixel for now, or are there
plans for dedicated WanderOS ad accounts that would warrant earlier pixel separation?

---

## Open Decisions Summary

| Decision | Owner | Blocks |
|----------|-------|--------|
| WanderOS ad account structure: shared accounts + separate pixels, or fully separate accounts? | CMO | Pixel setup, WanderOS acquisition tracking |
| WanderOS brand positioning: sub-brand of Wander or standalone product? | CMO | Social media strategy, content tone |
| WanderOS social handles: which platforms to launch with? | CMO | Not a technical blocker, but needed before launch |
| `/listed` priority: active investment or maintenance mode? | CMO | How much tracking depth to build for that funnel |
| WanderOS blog strategy: tag on existing blog, or dedicated section? | CMO | Content infrastructure |
| WanderOS comms: separate Customer.io workspace or segments within existing? | CMO + Brian | Host onboarding email setup |
| Message streams suppression rollout: approve phased plan? | CMO + Brian + Sorrell | Full detail in message-streams-proposal.md |

---

## What Engineering Can Proceed On (No CMO Input Needed)

- Fix `Order Completed` triple-fire and Impact.com destination cleanup — highest priority
- Add `page_family` + `business_line` properties to events on `/os` and `/listed` pages
- Build out `host-web` and `host-backend` Segment sources for `app.wander.com`
- Phase 1 of message streams: onboarding suppression in CIO (quick win, no alignment needed)
- Outreach → CIO attribute sync infrastructure (growth platform, already partially built)

# CMO Alignment — Growth & Marketing Infrastructure
**Format**: Working agenda — talk through each item, decisions noted inline
**Date**: March 2026

---

## 1. The two products and their domains

**What we're aligning on**: Wander operates two distinct products. Everything downstream
(pixels, tracking, social, email) should reflect this split.

| Product | Domain | Users | What they do |
|---------|--------|-------|-------------|
| **Marketplace** | wander.com | Guests | Browse and book vacation rentals |
| **WanderOS** | app.wander.com | Hosts / operators | Build direct booking sites, manage listings |

**Note on os.wander.com**: This is a legacy back office for Wander-Operated homes only.
Small user base, no investment planned. Not part of this conversation.

**Note on acquisition pages**: wander.com/os and wander.com/listed are marketing entry
points — they live on wander.com but funnel users into the WanderOS product on app.wander.com.

---

## 2. Why we double-track users (and why it's fine)

**What we're aligning on**: A host who also books a vacation as a guest will appear in
both the Marketplace and WanderOS analytics systems. This is intentional, not a bug.

**The scale argument**: We expect millions of guests on the marketplace. WanderOS, even
at strong adoption, will be thousands of operators. The overlap between "host who also
takes a vacation" and "guest who also runs a rental business" exists but is tiny relative
to total volume. Contaminating our guest funnel data with B2B operator data — or vice versa
— would meaningfully distort our ad optimization and reporting.

**What this means in practice**: Two separate Segment workspaces. Two separate ad pixel
setups. Guests tracked in one, hosts in the other. When someone is both, they're in both.

---

## 3. Pixel setup and the "everything on wander.com" question

**What we're aligning on**: How to handle ad attribution across two products that share
a domain, without contaminating audiences.

**Background**: The head of design has strong conviction that WanderOS landing pages
(wander.com/os, wander.com/listed) should live on wander.com — not a subdomain. This
is locked in. The question is how we handle tracking given that constraint.

**The approach we're recommending**:

- **Marketplace pixels load everywhere on wander.com** — this is the base layer. Every
  page view, every guest conversion, every ad click tracked as normal.
- **WanderOS pixels additionally load on /os and /listed only** — layered on top of the
  marketplace base. A visit to wander.com/os fires into both the marketplace analytics
  (useful: you can see how OS traffic relates to overall site traffic) AND the WanderOS
  attribution system (useful: you can measure OS ad performance independently).

**Why this is better than a hard either/or split**: The design team wins (everything on
wander.com), we win (clean separate attribution), and we get the bonus of being able to
see cross-product flow — how many OS visitors also browse marketplace properties, etc.

**What this requires**: Separate pixel IDs for WanderOS (Meta and Google). These can live
in the **same ad accounts** for now, just different campaign tags.

**Decision needed**: Will WanderOS campaigns run from shared ad accounts with campaign-level
splits, or will WanderOS eventually have dedicated ad accounts? This affects how urgently
we need new account setup vs. just new pixel IDs within existing accounts.

---

## 4. /listed and the supply vs. OS user question

**What we're aligning on**: Are /listed (apply to list on Wander marketplace) and /os
(build a WanderOS direct booking site) the same funnel, different funnels, or converging funnels?

**Current situation**:
- `/listed` — hosts apply to list their property on the Wander marketplace. Wander is
  the exclusive, curated channel. High bar for acceptance.
- `/os` — hosts build their own direct booking website using WanderOS. They distribute
  independently. Lower bar; they may or may not ever list on Wander.
- New marketplace supply is increasingly coming through OTA integrations, not direct
  host applications.

**The question this creates**: How much investment does /listed warrant as an acquisition
channel? If it's becoming a secondary path, does it need its own ad campaigns, its own
conversion tracking, its own content strategy?

**Why this matters for tracking**: We can treat both under the WANDER_OS workspace
(same analytics system, differentiated by a `surface` property on events). But if /listed
gets its own ad campaigns, it may eventually need its own pixels too.

**Decision needed**: Is /listed an actively invested funnel in 2026, or maintenance mode?
What's the relationship — do we push OS users toward /listed as a natural upgrade path,
or are they genuinely separate audiences?

---

## 5. Message streams and the coordination problem

**What we're aligning on**: We have six messaging channels running in parallel with no
shared rules about who talks to a user, when, and what happens when two channels want
to talk to the same person at the same time.

**The six streams**:
Onboarding (CIO) → Newsletter (CIO) → Property Recs (CIO) → Sales Outreach (Outreach)
→ Transactional (backend) → Concierge (manual / Nick)

**The problem in one sentence**: A user can book a trip and receive a booking confirmation,
a personal concierge message, an automated newsletter, and a property recommendation —
all within 48 hours — all feeling like they come from different companies.

**The full proposal** is in `message-streams-proposal.md`. The short version:
- Add lifecycle attributes to CIO (in onboarding, in sales sequence, has active booking)
- Use those attributes to suppress the right channels at the right times
- Sequence post-booking messages instead of firing them all at once
- Four phases, ~8 weeks total, starting with a one-day quick win (onboarding suppression)

**What we need from this meeting**:
- Does the six-stream vocabulary match how Kyle thinks about our comms?
- Approve the suppression rules (hard vs. soft)
- Confirm ownership: Brian owns CIO changes, Sorrell owns Outreach webhook, Engineering
  owns the growth platform sync

---

## 6. Social media handles

**What we're aligning on**: WanderOS needs its own social presence because the audience
(property managers, operators) is completely different from our guest audience (travelers).

**Current Marketplace handles**: @wander on Instagram, TikTok, Facebook, LinkedIn

**Recommended WanderOS handles to establish**:

| Platform | Priority | Rationale |
|----------|----------|-----------|
| LinkedIn | Must have | Primary B2B channel. Property managers live here. Required for paid acquisition. |
| Instagram | High | WanderOS is a visual product (website builder). Showcasing customer sites is strong content. |
| YouTube | Eventually | Product demos, tutorials, customer stories. |

**The brand question**: Is WanderOS a Wander sub-brand ("built by the team behind Wander")
or a standalone product? This determines whether we lean on the existing @wander audience
initially or build a separate following from scratch.

**Decision needed**: Handle naming (e.g. @wanderos? @wander.os?) and brand positioning.

---

## 7. Blog

**Keeping this short since CMO is primarily paid ads focused.**

Current blog: guest-facing, ~25 posts/month, agency-managed CMS, lives on wander.com.

WanderOS needs operator-focused content eventually (PMS guides, direct booking playbooks,
host stories) but a dedicated blog is a resource question. Recommendation: WanderOS tag
on existing blog as a starting point. Revisit with dedicated content headcount.

**Decision needed** (low urgency): When does WanderOS content become a priority, and
who owns it?

---

## Decisions Summary

| # | Decision | Urgency |
|---|----------|---------|
| 3 | WanderOS ad account structure: new pixel IDs in shared accounts, or separate accounts? | High — blocks pixel setup |
| 4 | /listed investment level in 2026: active funnel or maintenance mode? | High — affects tracking depth and ad strategy |
| 4 | Supply vs. OS relationship: separate audiences or converging funnel? | High |
| 5 | Message streams: approve suppression rules + ownership assignments | High |
| 6 | WanderOS social: handle naming and brand positioning | Medium |
| 6 | WanderOS brand: sub-brand of Wander or standalone? | Medium |
| 7 | WanderOS blog: when and who owns it? | Low |

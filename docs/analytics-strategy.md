# Wander Analytics Strategy

> Working doc — reference during CMO alignment meeting.
> Last updated: 2026-03-09

---

## The two-surface model

Wander operates two distinct products with different users, different conversion goals,
and different marketing motions. They share infrastructure (same backend, same wander.com
domain) and — critically — **the same Segment workspace and shared user identity model**.

### Surface 1 — Marketplace

**What it is:** Guest-facing vacation rental marketplace. Think Airbnb.

**Users:** Travelers booking stays. Scale: millions.

**Where it lives:** wander.com (Next.js app), iOS + Android mobile app.

**Conversion KPIs:** Booking completed, revenue, repeat bookings.

**Current marketing:** Google Ads + Meta Ads (global accounts). "Global" social handles.
Blog is guest-facing content, lives within wander.com.

**Segment source:** `marketplace-web`, `marketplace-mobile`, `marketplace-backend`

---

### Surface 2 — Host Platform (WanderOS)

**What it is:** B2B SaaS for property operators. Two entry points, one product.

**Users:** Property managers / hosts. Scale: smaller, B2B-ish.

**Entry points on wander.com:**
- `/os` — WanderOS acquisition landing page ("build your direct booking site")
- `/listed` — Supply acquisition ("list your property on Wander marketplace")

**Product:** `app.wander.com` — single dashboard for all external operators,
whether they manage listings on the Wander marketplace or run their own
direct booking site via WanderOS. Both `/os` and `/listed` acquisition paths
funnel here.

**Note:** `os.wander.com` is a legacy back office for Wander-Operated homes only.
Small user base, indefinite hold. No new tracking investment needed there.

**Conversion KPIs:**
- `/os` path: site published + first direct booking
- `/listed` path: listing approved + first marketplace booking

**Segment source:** `host-web` (app.wander.com), `host-backend`

---

## Segment architecture — one workspace, multiple sources

**One Segment workspace.** Segment's own guidance is to avoid splitting workspaces
for product or brand separation. Splitting creates a hard wall that makes cross-product
questions structurally harder to answer: guest-host overlap, suppression across journeys,
unified lifetime value. Segment's Unify model is built around one production profile space.

**Separate sources per surface.** Each surface gets its own write key and source,
enabling independent downstream routing and tool configs. Sources are labeled
`Product=Marketplace` or `Product=Host` and `Env=Prod/Dev` for access control.

**Shared client instance on wander.com.** Segment explicitly prohibits loading
Analytics.js twice on the same page — even with different write keys. wander.com
uses one shared Segment snippet. Events fired from `/os` or `/listed` use the same
instance but carry `page_family: 'os' | 'listed'` and `business_line: 'host'`
properties to distinguish them in downstream tools.

**Properties distinguish surfaces, not write keys:**

```ts
// On wander.com marketplace pages
analytics.track('Product Viewed', { ...props, page_family: 'marketplace', business_line: 'guest' })

// On wander.com/os and wander.com/listed
analytics.track('Viewed Host Landing Page', { ...props, page_family: 'os', business_line: 'host' })
```

**Server-side sources are separate.** The browser constraint doesn't apply server-side.
The backend and app.wander.com server can use different write keys to route events
to different source-level downstream configs (e.g. Impact.com only on marketplace backend).

---

## What happens when the same person uses both products

A host who also books a vacation as a guest exists in both surfaces. This is intentional —
and the unified workspace is what makes it tractable. A single Segment Unify profile
spans both their guest and host behaviour. Suppression rules in Customer.io can see
the full picture. Cross-product questions ("how many OS users also have a booking?")
are answerable without joining across workspaces.

---

## Decisions already made (engineering can proceed)

- **One Segment workspace** — not two. Labels and resource-scoped roles for access control.
- **Multiple sources** — separate write keys per surface/runtime. Separate routing.
- **One shared client instance on wander.com** — one Segment snippet everywhere.
  Surface distinguished by event properties, not separate Analytics.js loads.
- **Properties-based surface tagging** — `page_family`, `business_line` on every event.
- **Blog stays in marketplace** — guest-facing content, no separate WanderOS blog for now.
- **Mobile app is marketplace only** — no host mobile component.
- **`app.wander.com` is the single host dashboard** — all host events route to host sources.
- **`os.wander.com` (legacy)** — no new tracking investment.
- **Order Completed** must only reach Impact.com from the **backend source** — eliminates
  triple-pay risk. Client and mobile fires are for UX signals only.

---

## Open questions for CMO

### 1. `/listed` vs `/os` — marketing priority

**The question:** Is `/listed` (apply to list on Wander marketplace) an actively invested
acquisition channel, or is it moving to maintenance mode?

**Context:** New marketplace supply increasingly comes through OTA integrations, not direct
host applications. WanderOS is the bigger new initiative. `/listed` and `/os` may be
converging into one host acquisition funnel.

**Why it matters for tracking:** If `/listed` is still a priority funnel, it needs dedicated
conversion events and ad campaign tracking. If it's maintenance mode, basic page view
tracking is enough.

---

### 2. Ad pixel strategy

**The question:** One shared pixel with custom events, or separate pixel IDs?

**Recommended default — one pixel, custom events:**
Fire `Purchase` on booking completion, `CompleteRegistration` on WanderOS signup,
`Lead` on /listed form submit — all through one pixel. Ad platforms attribute each
to their respective campaigns. This is how mature platforms (Airbnb included) operate.

**When to add a second pixel ID:**
Only when WanderOS has dedicated ad campaigns that need fully independent audience pools
— likely when there's a dedicated WanderOS marketing person managing separate campaigns.
Note: if routing through Segment's Facebook Pixel destination, a separate pixel ID
requires a separate Segment web source (device-mode constraint).

**Open decision for CMO**: Shared ad accounts with one pixel for now, or are there
plans for dedicated WanderOS ad accounts that would warrant earlier pixel separation?

---

### 3. Email / comms — one Customer.io workspace or two?

**The question:** Will guests and hosts use the same Customer.io instance?

**Recommendation:** Same workspace for now, with strict segmentation by `business_line`
attribute. The shared Segment workspace already gives you the unified profile. Separate
CIO workspaces make sense only if host comms need a genuinely different billing owner
or compliance boundary.

---

### 4. WanderOS content / SEO strategy

**The question:** Will WanderOS have its own blog, or a tag on the existing blog?

**Recommendation:** WanderOS tag on the existing blog for now. Revisit when WanderOS
has a dedicated content person.

---

## Recommended next steps (sequenced by dependency)

1. **Fix `Order Completed` triple-fire** — highest priority, real financial risk.
   Disable Impact.com on deprecated source. Client/mobile fires stay for UX signals only.
2. **CMO alignment** on pixel strategy and /listed priority.
3. **Instrument marketplace guest funnel** — `Product Viewed`, `Checkout Started`,
   `Order Completed` (server-side). Highest ROI.
4. **`/os` and `/listed` acquisition events** — add `page_family` / `business_line`
   properties, define host-specific conversion events.
5. **`app.wander.com` tracking** — host source, activation funnel
   (signup → PMS connected → site published).
6. **Message streams suppression** — Phase 1 (onboarding suppression) can start now,
   no CMO input needed.

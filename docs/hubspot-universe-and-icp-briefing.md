# HubSpot Company Universe, ICP, and Leads Strategy — Briefing

**Prepared for:** Danny Mancini (RevOps / HubSpot owner)
**By:** Kristian + Claude · **Date:** 2026-07-09
**Companions:** `leads-status-quo.md` (the full four-system inventory),
`leads-convergence-plan.md` (the architecture decisions), `hubspot-gateway-plan.md`
(the gateway). This doc stands alone — read it first.

All company numbers below come from a full **HubSpot "all companies" CSV export
taken 2026-07-09** (215,844 rows, 318 properties), validated independently in
Python and DuckDB against the CRM's own canonical domain normalizer.

---

## TL;DR

1. HubSpot holds **215,844 companies**, but the raw count massively overstates
   addressable market: 92% were bulk-imported this year, <1% are customers, and
   ~94% have never been worked.
2. The addressable ICP (property managers on a WanderOS-integrated PMS) is
   **~30k operators, phased by geography** — not a single US number. Non-US is
   pipeline for the Canada/Mexico/Europe ramp, not junk.
3. Two properties are actively misleading and should be fixed: **`PMS (AI
   Identified)` is 71.5% the placeholder string `"your PMS"`**, and **`Current
   Customer` is 100% empty**.
4. The plan: **HubSpot stays the system of record; the growth app (Neon) becomes
   the intelligence layer** where we enrich and score companies + contacts, then
   sync learnings back to HubSpot through one gateway. Nothing gets deleted —
   junk gets *tagged*.
5. This export is also the best chance we've had to **audit and tighten HubSpot's
   318 properties**. Section 6 is the concrete list.
6. **Decisions we need from you** are collected in Section 7.

---

## 1. What the 215,844 companies actually are

| Signal | Finding |
|---|---|
| Total companies | **215,844** |
| Created in 2026 | **92%** (199,281) — one large recent bulk import |
| Has a domain (our join key) | **99.7%** — 215,037 distinct domains, 647 blank, only 160 domain collisions |
| Record ID | 100% unique (clean primary key) |
| Phone present | 87.9% (189,772) |
| Email present | 20.7% (44,591) |
| Has an owner | **8.5%** (18,450) |
| Ever worked (owned or past "New Lead") | **8.6%** |
| Customer-ish (Closed Won / active deal / Wander Customer) | **1,242 (0.6%)** |

**Lead Status** carries the real state (Lifecycle Stage is 99% just "New Lead"):

- `New Lead - Research Needed` 154,016 + `New Lead` 50,080 = **94.6% never touched**
- Worked tail: `In Progress` 2,944 · `Closed Won` 803 · `Post-DD (Active Deal)`
  376 · `Deep Dive` 177 · `Connected` (DM+ADM) ~636 · `wOS Inbound` 912
- Suppression signals: `Unqualified - *` ~3,800 (No Website 1,774, not a PM
  1,159, Junk 598, 30-Day 143, Parent Company 142) · `DUPLICATE` 197

**Read:** this is overwhelmingly an unworked sourced list, with a small hand-worked
sales pipeline living in the tail. That's fine — it's what a top-of-funnel looks
like — but "215k companies" is a sourcing artifact, not addressable market.

---

## 2. The ICP funnel — and why geography changes it

The single most discriminating ICP signal is **running a WanderOS-integrated PMS**
(Guesty, Hostaway, OwnerRez, Streamline, Escapia, Hospitable, Hostfully, Track,
CiiRUS, Lodgix, Rentals United, Lodgify). Filtering to that:

- ~52k companies carry a *real* PMS name (of any kind).
- The WanderOS-integrated subset, **by market**:

| Market | Integrated-PMS operators | …with unit data |
|---|---|---|
| **US** (live) | ~19,500* | ~16,800 |
| **Canada** (ramping) | 1,404 | 1,228 |
| **Mexico** (ramping) | 627 | 533 |
| **Europe** (soon: FR 1,717, UK 1,608, ES 1,189, IT 1,047, DE 750, GR 305, PT 264, CH 192, BE 150, AT 119, NL 111) | ~7,450 | ~6,700 |
| Rest of world (AU 980, NZ 283, CR 207, …) | ~2,000 | ~1,500 |
| **Unknown country** | 8,608 | 1,454 |

\*US is split across three country values (`United States` 18,506 + `US` 597 +
`USA` 382) that should be normalized to one.

**The reframe:** addressable ICP is **~30k+ integrated-PMS operators across our
live and near-term markets**, released in waves as each geography opens — not the
~18.5k US-only figure. **Non-US is the expansion funnel**, since we're ramping
Canada and Mexico now and Europe soon. The **8,608 integrated-PMS operators with
no country** are a cheap geo-enrichment win — real operators we currently can't
route to a market.

The remaining gate is **unit count / scale**, and it's the sparse one: portfolio
size is present on only 24% of companies, our WW-properties estimate on 7%.
Type detection (is this a real PM on an integrated PMS?) is essentially solved;
scale detection is the open problem, and it's where enrichment effort should go.

---

## 3. Two properties that are actively misleading

These aren't nitpicks — anything built on them today is wrong:

- **`PMS (AI Identified)` is 71.5% junk.** Of 206k "populated" values, **154,412
  are the literal placeholder string `"your PMS"`**. Only 51,915 (24%) carry a
  real platform. Any segment, report, or workflow that treats this field as
  "populated = enriched" is off by 3x. We null the placeholder on our side; the
  fix in HubSpot is to stop writing it and re-derive.
- **`Current Customer` is 100% empty.** The property exists with zero values, so
  customer status has to be read from Lead Status / Lifecycle instead. Either
  populate it (from Closed Won / active-deal signals) or retire it.

---

## 4. The architecture: HubSpot = record, growth = intelligence

The direction (detailed in `leads-convergence-plan.md`):

- **HubSpot stays the system of record** for companies, contacts, owners, status,
  and sequences. Sales works in HubSpot.
- **The growth app (Neon Postgres) becomes the system of intelligence** — a mirror
  of the HubSpot universe where we can do the SQL joins, aggregation, scoring, and
  enrichment HubSpot's API can't, then **project the learnings back to HubSpot
  through a single gateway** (`/api/hubspot/v1`). One code path owns "how Wander
  writes to HubSpot," with provenance, instead of several tools writing directly.
- **The sync is two-way and live already**: a HubSpot webhook receiver (shipped
  2026-07-09) streams company changes into Neon in near-real-time; our own writes
  go out through the gateway. A rep editing lead status in HubSpot shows up on our
  side within seconds.

**Keep, don't delete — segment instead.** Every company gets two orthogonal tags,
never a filter that drops it:

- **Quality:** `junk` / `unqualified` / `icp-candidate` / `customer`
- **Market tier:** `us-live` / `camx-live` / `europe-soon` / `row-later` /
  `geo-unknown`

A French operator on Lodgify with 40 units is `europe-soon / icp-candidate` — kept
and filterable, activated when Europe opens — not deleted only to be re-sourced
later. Junk (`"your PMS"`, no domain, Unqualified-not-a-PM) is tagged with its
*reason*, so it never gets blindly re-added.

**Keying:** domain is the natural key for ~99% of companies. The exception is large
operators with a corporate domain plus regional/sub-brand domains; those are a
*relationship* (HubSpot company hierarchy / parent-child associations), which we
mirror via association webhooks — not a reason to change the key.

---

## 5. Where contacts, send-review, and sequences stand today

Honest current state, so nobody assumes more exists than does:

- **Contacts:** the growth app has ~31k contacts, but they're the **cold-outbound
  (Instantly) population** — keyed on (domain, email), with verification and email
  engagement, but **no link to HubSpot's ~288k contacts** (no `hubspotContactId`).
  So company-side we're about to have a clean mirror; **contact-side, growth and
  HubSpot are still disconnected.** Building the contact projection (backfill +
  `hubspotContactId` + contact webhooks) is the next major build and is what
  unlocks *contact* enrichment campaigns and "best contacts."
- **Send-review** (`/app/leads/send-review`) is live, but its premise ("net-new =
  not in HubSpot") inverts once we mirror the whole CRM into Neon. It becomes an
  **ICP-qualified, ready-to-work queue** over the full pool, driven by
  enrichment/scoring rather than CRM-absence.
- **Sequences:** two things exist — a (currently dormant) cold-email engine, and
  `/lifecycle`, a read-only **mirror** of the 202 HubSpot sequences + your six
  active flows + CIO. Sends still happen in HubSpot; growth reflects the strategy.

---

## 6. HubSpot property cleanup (the RevOps opportunity)

The export is the clearest look we've had at property health. 318 properties, and
the profile argues for a tightening pass. Candidates, for your call:

- **Fix / re-derive:** `PMS (AI Identified)` (71.5% `"your PMS"` placeholder).
- **Populate or retire:** `Current Customer` (100% empty), `Sites Preview URL`
  (5 rows), `Record Purchased Date` (0), `Inbound/Outbound` (99% blank).
- **Redundant enrichment clusters** describing the same underlying facts:
  `clay_*`, `zoominfo_*`, `apollo_*`, `adapt_*`, plus native `phone`/`email`/
  `portfolio_size`. Worth consolidating to a canonical field per fact + provenance.
- **Country normalization:** `United States` / `US` / `USA` are separate values;
  ~21k companies have no country at all (8,608 of them integrated-PMS operators).
- **Export noise:** ~60 auto-generated `Cumulative time in "X"` / `Date entered
  "X"` / `Date exited "X"` / `Latest time in "X"` lifecycle-pipeline columns bloat
  every export; worth pruning the pipeline stages or excluding from exports.

Deliverable we can produce off the Neon mirror: a **property health report** (fill
rate, junk-value detection, redundancy clusters across all 318 properties) →
a proposed tightened property set for you to approve.

---

## 7. Decisions we need from you

1. **ICP unit threshold.** The written ICP says 10+ units; grading behavior
   enforced 20+. Proposal (with Torger): `FIT ≥ 20` / `BORDERLINE 10–19` (nurture)
   / `NOT_FIT < 10` / `UNKNOWN` never guessed. Confirm and we write it into one
   shared ICP definition file.
2. **Market-tier phasing.** Confirm `us-live`, `canada + mexico = ramping now`,
   `europe = soon`, and how you want rest-of-world and unknown-geography handled.
3. **Property cleanup scope.** Which of the Section-6 items you want to act on,
   and whether we produce the full property-health report first.
4. **`growth_*` property namespace.** Names for the growth-owned projection fields
   (unit estimate, tier, PMS-detected, reachability, enriched-at) — still pending
   your nod from the gateway plan.
5. **International sourcing.** Nathan built a Canada/Mexico operator census with
   working connectors (Mexico SIEM, StatCan, provincial tourism boards, AMHM/APAR)
   and ~141 CRM-ready CA/MX operators. We had shelved it on throughput grounds —
   but with CA/MX now active, its sourcing connectors are exactly what we lack.
   Worth a conversation on harvesting them (see Section 8).
6. **BigQuery sync.** Cadence, object/property coverage, direction, and owner of
   the existing HubSpot↔BigQuery sync — so we know whether to lean on it for
   backfill/reconciliation.
7. **Contact hygiene before the contact wave.** The Adapt automation creates
   `"<Company> - Mainline"` pseudo-contacts and HubSpot auto-stamps
   `{id}@fake-email.com` on email-less ones; these need a filter before any
   contact-based list, sync, or send.

---

## 8. Proposed priorities

1. **Seed companies into Neon, tagged not filtered** (in flight) — all 215k, each
   with a quality class + market tier. Junk kept and labeled.
2. **Contact projection** — link Neon to HubSpot's contacts (`hubspotContactId`,
   backfill, contact webhooks). Unlocks contact enrichment + "best contacts."
3. **Redefine send-review** as an ICP-qualified / ready-to-work queue over the
   whole pool.
4. **HubSpot property audit** off the mirror → tightened property proposal (§6).
5. **International sourcing** — evaluate harvesting Nathan's CA/MX connectors +
   cohort into growth's enrichment engine, now that CA/MX is on-strategy.

Enrichment campaigns (agentic verification, PMS/unit detection, reachability) run
as background jobs on top of 1–2, feeding the `growth_*` projection back to
HubSpot. The qualification method and a 141-row graded ground truth from the
Snowball Consult engagement give us a validation set to test every enrichment
change against before it writes anything to the CRM.

---

*Numbers are a point-in-time snapshot (2026-07-09 export). The Neon mirror will
keep them live via webhooks going forward.*

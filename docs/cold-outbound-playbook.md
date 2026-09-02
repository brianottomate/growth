# Cold Outbound — Playbook & Learnings (2026-06-18)

> ⚠️ **2026-07-03:** the Instantly-based send machine described here is now a
> **dormant escape hatch** — cold motions run as HubSpot sequences and the
> leads DB projects into HubSpot instead (see `hubspot-gateway-plan.md`). The
> enrichment/verification learnings below remain fully valid.

Living doc for the first WanderOS cold-email campaign. Captures what we learned
building the lead → enrich → contact → send pipeline so we don't re-derive it.

## The goal

Stand up and **de-risk the cold-outbound machine** with a throwaway first batch —
not a max-impact blast. First send tests copy / deliverability / reply-loop, so we
use _mid-tier_ prospects (don't burn the best) and Kristian as a proxy AE.

## The leads funnel (reality)

- `leads.domain` ≈ **58.9k** domains, but that's a contactless BuiltWith/CRM universe.
- The historical sendable pool was **net-new** (not in CRM, ranked, has a
  credible contact) → **543** after a live-HubSpot scrub. That count is context,
  not a current queue contract.
- "Pregen sites 1.8K" was a **mislabel** — it was a curated prospect catalog.
  Nothing was built; `LIVE_RENTAL`/`LIVE_OTHER`, `in_pregen`, page titles, and
  `PREGEN_URL_PATTERN/...` values were retired in July 2026. Current targeting
  uses our ranker score and explicit send batches. A future generated-site
  lifecycle must use separate state backed by real production artifacts.

## HubSpot scrub (done)

- The ingested `in_hubspot` flag is a **June-1 CSV snapshot, ~stale**. A live
  per-domain scrub (`scripts/scrub-netnew-hubspot.ts`, batched `IN` search) flipped
  **93 of 543** to `in_hubspot=true` → net-new pool **543 → 450**.
- Lesson: don't trust the stored flag; verify against live HubSpot before send.

## Enrichment SOP (what's valuable)

Pipeline: `scripts/rank-leads.ts` → `lead-ranker.service.ts` (scrape + screenshot
+ vision + our HubSpot correspondence, writes back to `leads.domain`).

`scripts/enrich-batch.ts` (ranker v1, `score_version = enrich-batch-v1`) was
retired 2026-09-02 and its 198 scores cleared: two incompatible scales in one
sortable column made `score_pregen_potential` meaningless to sort by. The v1
judgements survive under `enrichment.extraction` on each row. Discovery,
extraction and unit estimation were never lost with it — they live in
`lead-discovery`, `lead-extraction` and `lead-unit-estimate` services and are
still reachable from the leads router's enrich drawer.

Findings from the 100 net-new enriched under v1, which still hold:

- ✅ **`pregenFit`** — v1's targeting signal (0–78). Superseded by v2's
  weighted `overall`; the idea survives, the numbers do not.
- ✅ **`redFlags`** — disqualifier gate (aggregator / single-property / not-a-PM).
  **v2 has no structured equivalent**, only a free-text `concerns` array. Porting
  this back is the biggest open gap in the ranker.
- ✅ **`unit_estimate` + confidence** — the size axis; ~60% high-confidence, 40% null.
- ❌ **stored `unit_count`** — NOISE. Wrong on ~19/20, 30–150× off (it's HubSpot's
  distrusted `portfolio_size` / a `property_count` CSV column; airvillage 1524→10).
  Keep only as a _prior_ the estimator ingests, never as the ranking truth.
- ⚠️ **`computed_tier`** — redundant with fit; derive, don't store.
- Rich extraction (brand voice, etc.) = **personalization** later, not targeting.
- **fit ≠ size** — orthogonal. Rank on fit gated by flags, then prefer real size.
  The prize is high-fit + high-size (rare); high-fit + tiny is abundant test fodder.

### Portfolio-size detection — a skill to evolve (NOT today)

Today = web-search + scrape + LLM guess. Future, more structural: count unique
listings in **sitemaps**, **Airbnb host-profile** unit counts, financial filings.

## Contacts — the big finding (2026-06-18)

Our purchased/appended contact list is **mostly mis-associated freemail junk**:

- **0 of the 20** test companies have a single corporate-email contact. ~all freemail.
- **Minerva `enrichByEmail` DOES enrich freemail** (42% match) — but the matches sit
  in **random, wrong cities** (a Maui rental's "co-owner" in Chehalis WA). So Minerva's
  real job here is a **geo-validator / junk-detector**, not a source.
- The **company websites have the real, clean channel.** Proven by scrape:
  - fripprentals.com → `info@fripprentals.com`, owners **Gary & Diane DeLuca** (NOT
    the randos in our DB).
  - cityninestay.com → `info@cityninestay.com`, mgr "Nick", contact form + WhatsApp.
  - grandcaymancondos.net → corporate email + form, address in Grand Cayman (our DB
    had FL gmail/yahoo contacts).
- Lesson (contacts-layer version of the unit_count lesson): **don't trust appended
  contact data — derive the channel from the company's own site.**

### Contact strategy (the plan)

1. **Don't send to the freemail list.** Use only where Minerva geo matches company geo.
2. **Site-scrape "contact channel resolver"** per domain → corporate email
   (`info@`/`bookings@`/`owner@`), owner name, contact-form yes/no, phone/WhatsApp.
   (`scripts/resolve-contact-channels.ts` — first pass plain fetch+regex; firecrawl
   for JS-heavy misses.)
3. **Route:**
   - Email found → enroll in **Instantly** (a generic `info@` is fine for micro-operators).
   - Form-only → **lifecycle "contact-form outreach" sequence** — a queue a human (or
     an agentic browser: Browserbase / browser-use) submits. A legit channel.
4. **Minerva** = geo-validator in the pipeline, not the source.

### Deferred / future

- **Existing-user check (BigQuery)** — don't cold-pitch a current Wander user/host.
  Needs the warehouse users/hosts table discovered. `bigquery.client.executeQuery`.
- **Agentic browser** for contact-form submission.
- **Unified send-activity ledger** — Instantly + CIO (the newsletter "mess") + user
  lists into one `contact_event` timeline so we stop being reactive. `lead_contact`
  already has open/click/reply counters; reply webhook exists (`api/instantly`).

## Outbound test setup (A/B/C)

- 3 lifecycle programs (`scripts/seed-outbound-sequences.ts`), all → `wander.com/os`:
  - **A** Reply-first (text only) · **B** Self-serve (text + /os link) · **C** Visual (+ image)
- Built into Instantly DRAFT campaigns by `scripts/create-outbound-campaigns.ts`.
- **Persona/signature = Kristian** ✅ (proxy AE).
- **Identity gap:** every connected mailbox is an **Emily Collins** burner (across
  trywanderos.com / getwanderos.com / etc.). No Kristian mailbox exists, so the From:
  shows "Emily Collins" while the body signs "Kristian." Fix = connect a Kristian
  mailbox, or rename the warmed mailboxes' display name (shared infra — decide first).
- **Reply routing:** keep replies in the Instantly Unibox (preserves stop-on-reply +
  deliverability), alert Kristian via the reply webhook. NOT reply-to personal email.

## Email signature (Emily)

Set as the **mailbox-level signature** on the Emily account in Instantly (auto-
appends; bodies sign off with just "Emily" so we don't double-sign). Adapted from
Kristian's template: name "Emily Collins", title "Account Executive", phone
dropped (no Emily line), email matched to the From address (`emily@trywanderos.com`
— swap to `emily@wander.com` if that inbox is real). Note: a logo-image HTML sig is
fine for warm/personalized sends, but a lighter text sig often delivers better on
pure-cold variants. HTML lives in this repo via the seed-script comment + here.

## State / next steps

- ✅ Net-new pill (450), Send-20 pill, enrich-drawer (company info, contacts w/ ★ picks,
  Copy context, CRM marker), HubSpot scrub, 100 enriched, contact deep-dive.
- ▶ Contact resolver over the 100 → choose a NEW 20 (best clean contact channel) → upload to Instantly.
- ▶ Self-test: enroll Kristian's emails in A/B/C, launch, judge the feel.
- ▶ Sending identity (Kristian mailbox) before any real prospect send.

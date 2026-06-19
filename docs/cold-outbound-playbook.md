# Cold Outbound — Playbook & Learnings (2026-06-18)

Living doc for the first WanderOS cold-email campaign. Captures what we learned
building the lead → enrich → contact → send pipeline so we don't re-derive it.

## The goal
Stand up and **de-risk the cold-outbound machine** with a throwaway first batch —
not a max-impact blast. First send tests copy / deliverability / reply-loop, so we
use *mid-tier* prospects (don't burn the best) and Kristian as a proxy AE.

## The leads funnel (reality)
- `leads.domain` ≈ **58.9k** domains, but that's a contactless BuiltWith/CRM universe.
- Sendable pool = **net-new** (not in CRM, `LIVE_RENTAL`, has a credible contact) →
  **543** after a live-HubSpot scrub (see below). NOT 50k.
- "Pregen sites 1.8K" was a **mislabel** — it's the curated shortlist that has
  contacts; nothing was actually built (`pregen_site_url` = `PREGEN_URL_PATTERN/...`).

## HubSpot scrub (done)
- The ingested `in_hubspot` flag is a **June-1 CSV snapshot, ~stale**. A live
  per-domain scrub (`scripts/scrub-netnew-hubspot.ts`, batched `IN` search) flipped
  **93 of 543** to `in_hubspot=true` → net-new pool **543 → 450**.
- Lesson: don't trust the stored flag; verify against live HubSpot before send.

## Enrichment SOP (what's valuable)
Pipeline: `scripts/enrich-batch.ts` (discovery → extraction + triangulated unit
estimate, writes back to `leads.domain`). Findings from 100 enriched net-new:
- ✅ **`pregenFit`** — the targeting signal (0–78). The cut.
- ✅ **`redFlags`** — disqualifier gate (aggregator / single-property / not-a-PM).
- ✅ **`unit_estimate` + confidence** — the size axis; ~60% high-confidence, 40% null.
- ❌ **stored `unit_count`** — NOISE. Wrong on ~19/20, 30–150× off (it's HubSpot's
  distrusted `portfolio_size` / a `property_count` CSV column; airvillage 1524→10).
  Keep only as a *prior* the estimator ingests, never as the ranking truth.
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

## State / next steps
- ✅ Net-new pill (450), Send-20 pill, enrich-drawer (company info, contacts w/ ★ picks,
  Copy context, CRM marker), HubSpot scrub, 100 enriched, contact deep-dive.
- ▶ Contact resolver over the 100 → choose a NEW 20 (best clean contact channel) → upload to Instantly.
- ▶ Self-test: enroll Kristian's emails in A/B/C, launch, judge the feel.
- ▶ Sending identity (Kristian mailbox) before any real prospect send.

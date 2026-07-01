# Processing the Government-Permit List

_Status: 2026-07. Prototype validated on probes; nothing ingested to the DB or
committed yet. This doc captures the list, what we built to process it, the
results, and the path to production._

Companion to `leads-system.md` (the general leads overview) and
`cold-outbound-playbook.md` (the strategy + the "appended contacts are junk"
findings this work builds on).

---

## The list (from Brian)

STR property managers assembled from **public short-term-rental permit filings**
across 13 markets (Florida statewide, New Orleans, Nashville, San Diego, Sonoma,
Bend, Louisville, Marin, Arlington TX, San Juan County WA, Sacramento, Columbus GA).

Delivered as one master + 5 pre-sliced CSVs (all the same ~16-column schema,
joined by a `national_key` dedup key):

| Slice | Rows | What |
|---|---|---|
| `master_clean.csv` | **84,394** | full dataset |
| `direct_mail_list.csv` | 84,254 | rows with a mailing address |
| `phone_list.csv` | 59,153 | rows with a phone |
| `meta_audience_emails.csv` | 13,433 | rows with an email (business 1,029 / personal 12,404) |
| `pm_companies.csv` | 4,569 | the `pm_company` cohort (5+ properties) — the prize |
| `website_list.csv` | ~1,028 | rows where a website was already known |

Pre-computed: `recommended_channel` (83,365 direct_mail / 1,029 cold_email),
`grade` (A 15,024 / B 69,370), `net_new` (83,677), `national_key` (`nm:` name /
`dom:` domain).

### Why it's a real upgrade — and where to calibrate
- **High-integrity identity.** Permit filings require real info, so names /
  addresses / phones are authoritative. This is the *opposite* of the old
  BuiltWith/appended list, whose failure was mis-associated freemail contacts.
- **But cold-email is the small slice.** Only **4.5% of PM companies (205/4,569)**
  had a domain out of the box. The 84K is mostly *individual* permit-holders
  (`long_tail`), not companies — great for **direct mail + Meta**, not cold email.
- **Trust the verified subset, not the raw counts.** The list has noise (see
  data-quality findings below). Send only from what verification passes.

Channel split of value: **direct mail + Meta are usable immediately** (84K real
addresses, 12.4K personal emails); **cold email is an enrich-then-send pipeline**
whose addressable set is realistically hundreds to ~1–1.5K PM companies after
enrichment.

---

## The problem we solved tonight

95% of these companies have a **name + market but no domain**, and our existing
enrichment (`resolveContactChannel`, `channel-discovery`) all starts *from* a
domain. So the missing capability was **name → verified domain**.

First attempt was regex/string-matching (Firecrawl search → filter → token
score). It produced **confident-but-wrong** picks — `tonti.net` for "Tonti
Street LLC", a generic Orlando site for "Amazing Home in Orlando LLC", `plumlee…`
for "Royal Plum" (matched "plum" inside "plumlee"). Exactly the trap the old list
fell into. **The fix: stop string-matching; hand it to an AI analyst.**

---

## What we built

All in `src/server/services/domain-discovery.service.ts`,
`src/server/clients/hubspot.client.ts`, and `scripts/probe-*.ts` (local, uncommitted).

### 1. Agentic domain discovery (`domain-discovery.service.ts`)
A `claude-sonnet-5` agent (`generateText` + `stopWhen: stepCountIs`) with tools:
- **`web_search`** + **`read_site`** — Firecrawl as the *fetch* layer (search + markdown).
- **`submitVerdict`** — a structured tool (Zod schema) for the final answer.

The agent searches, reads candidate sites, and verifies the domain against the
**permit identity** (exact company name / DBA on the site, the permit phone/email
appearing, owner name, consistent location). It returns null rather than guess.
It scores **two separate axes**:

- **Verification** — `belongsToCompany` + `confidence` + `evidence[]`.
- **Fit** — `tier` (strong/possible/weak/disqualified) + `segment`
  (independent_operator / regional_manager / enterprise_or_brand / timeshare /
  ota_or_aggregator / individual_host / not_str) + `disqualifiers[]`.
  This exists because **verified ≠ viable**: `vistana.com` is a real, correctly
  identified vacation-rental domain — but it's Marriott's *timeshare* arm, so
  `fit: disqualified/timeshare`. Uses the permit count as a size hint.

### 2. HubSpot cross-reference (`hubspot.client.ts`)
- `findCompaniesByDomains` (pre-existing) — batched exact-domain match.
- **New:** `findCompaniesByName`, `findCompaniesByPhone`, `findContactsByPhone`.
- Match by **precision**: domain > phone > name. Name is a weak *candidate* only
  (never auto-suppress on a bare name). Purpose: don't cold-email an account
  already in the CRM / owned by a rep. Writes into the `lead_domain` HubSpot
  guard flags the send-review net-new predicate already reads.

---

## Results (probes)

### 40-company agentic enrichment
- **24/40 verified** (23 high, 1 medium); **16 declined** (all correct — individuals, holding LLCs, or defunct companies).
- **0 genuine false positives.** Every prior regex false positive was fixed: Tonti→`vcay.com`, Royal Plum→`royalplumclub.com`, Move America→none, Elyon→none.
- **Recoveries regex couldn't do:** Amore Property Mgmt→`bluewaterbaypropertymanagement.com` (DBA, matched by exact permit phone on site); JW Rentals→`305miamivacations.com` (name on homepage); Kathy Campbell (a *person*)→`patriotfamilyhomes.com` (via LinkedIn + news + email domain).
- **Bonus — it audited the list:** flagged a defunct company (stay Alfred, ceased 2020), a mislabeled entity row ("AIDS Healthcare Foundation" carrying a `@vacasa.com` email), `@tulane.edu` holding-entity noise, and a non-STR homebuilder (Pulte).

### 20-company enrich → HubSpot cross-reference
- **13/20 enriched**; **8 already in HubSpot** (all via domain; **7 owned by a rep**); 1 name-only candidate; **11 net-new**.
- **Key finding: enrichment is what unlocks the HubSpot match.** Permit legal names ≠ CRM brand names — "Wallace International" → `fairwaysflorida.com` → HubSpot "Fairways Florida Villas"; "Jesse J Smith" (a person) → `paramountsuites.com`. Name-matching alone would have wrongly treated these as net-new and cold-emailed accounts sales owns. **The domain is the join key.**

### Fit validation
- Vistana Management (2,907 permits) → `vistana.com` verified **high**, but **fit: disqualified/timeshare** (`isStrOperator: false`).
- Cape San Blas Vacation Rentals (37) → `capesanblasvacationrentals.com` → **fit: strong/independent_operator**.

---

## Known gaps / to fix
- **HubSpot phone finder returns 0 matches.** All matches came via domain. Either these permit phones aren't in HubSpot, or `CONTAINS_TOKEN` on bare digits doesn't match HubSpot's formatted storage — the real fix is searching `hs_searchable_calculated_phone_number`. Domain carried the result, so not blocking, but the phone axis isn't earning its keep yet.
- **`lead-verify` company-match is still string-overlap** (Minerva geo layer). Should move to AI like the rest.
- **Cost/latency:** agentic enrichment is a multi-step loop per company (~30–60s, several sonnet-5 + Firecrawl calls). Fine for batch/background; not inline. Cost is not currently a constraint.

## Future / next steps
1. **Land the list in Neon** — a new `leads.permit_entity` table (entity-keyed on `national_key`, holding all columns + raw jsonb). Keeps it decoupled/droppable; gives Brian a queryable home (his DB ask → **Neon**, not Supabase).
2. **Promotion path** — for the PM cohort, run agentic discovery → gate on
   **`verified domain` AND `isStrOperator` AND `fit ≥ possible` AND `not in HubSpot`**
   → promote into `lead_domain` → flows through send-review normally.
3. **Direct mail + Meta straight from `permit_entity`** — the 84K addresses and
   12.4K personal emails don't need domains; wire those channels off the raw table.
4. **Fix the phone finder** (normalized field) and **port `lead-verify` to AI**.
5. **Data-quality note to Brian** — dead companies, mislabeled entity-name rows.

## Metrics snapshot (for reference)
- List: 84,394 rows · 4,569 PM cos · 84,254 addresses · 59,153 phones · 13,461 emails · 13 markets · domain coverage 4.5% of PMs.
- Agentic enrichment (sample): ~53% domain recovery on unknowns, ~0 false positives, ~65% of a fresh 20 verified.
- HubSpot overlap (fresh 20): 40% already in CRM, mostly rep-owned — all caught via discovered domain.

# The Leads System

> ⚠️ **2026-07-03 — the "core idea" below is superseded.** The link pass
> (`scripts/link-leads-hubspot.ts`) matched **99.9% of lead domains to
> existing HubSpot companies** (38 true net-new, mostly garbled domains), so
> the direction inverted: **HubSpot is the system of record; Neon is the
> enrichment/intelligence layer that projects into it.** Instantly is a
> dormant escape hatch. See `hubspot-gateway-plan.md` — the living plan.
> Everything below about the schema, grain rule, and enrichment pipeline
> mechanics is still accurate.

The **outbound prospecting engine** for Wander Sites — a system-of-record for
companies we might cold-contact (property managers, STR operators), the
enrichment that decides whether they're worth contacting and how, and the
pipeline that turns a raw company into a sent, personalized cold sequence.

> This is the generalized overview. Companion docs go deeper on specific pieces:
> - `cold-outbound-playbook.md` — the strategy + hard-won findings (why appended contacts are junk, Minerva-as-geo-validator, site-scrape channel resolution).
> - `outbound-channel-strategy.md` — channel selection notes.
> - `permit-list-processing.md` — the government-permit list + the agentic domain-discovery/fit/HubSpot work (2026-07).

---

## The core idea

**The internal Neon DB is the system of record. Instantly and HubSpot are
projections.** Contacts flow *out* to Instantly to be emailed; HubSpot is pulled
*in* as a dedup/suppression signal and written *back* to. Neither is the source
of truth — the `leads.*` Postgres schema is. This is deliberate: if the outbound
experiment dead-ends, `DROP SCHEMA leads CASCADE` removes it and nothing else is
touched.

## The grain rule (the whole point)

```
lead_domain   = ONE row per normalized domain   — the unit we score & rank
lead_contact  = MANY per domain                 — the unit we send to (Instantly grain)
```

This split is what fixed the original CSV fan-out disaster (a single domain
appearing thousands of times). Scoring/ranking lives on the domain; the
send-explosion lives on contacts. Provider data follows the repo convention:
queryable/rankable fields are first-class columns; raw provider rows live in an
`enrichment` JSONB keyed by source, so anything can be re-derived without
re-importing.

## Schema (`src/server/db/leads-schema.ts`)

Isolated in its **own Postgres schema** (`leads.*`, not `public`) so it stays
decoupled and droppable. `drizzle.config.ts` keeps `schemaFilter: ["public", "leads"]`.

| Table | Grain | Purpose |
|---|---|---|
| `lead_domain` | one per domain | the spine — geo, PMS/tech, unit estimate, scores, HubSpot guard flags, pregen state, `enrichment` JSONB |
| `lead_contact` | many per domain | people to email — email/name/title/phone, deliverability, Instantly linkage + synced engagement, `verification` JSONB (trust layer) |
| `lead_channel` | many per domain | reachability channels discovered on the company's own site (email/phone/form/chat), dedup on (domain, kind, value) |
| `lead_outreach` | per domain (+contact) | the per-lead "meal" — an AI-generated cold sequence (steps, angle, status draft→queued→sent→replied) |
| `lead_import` | one per CSV run | provenance/audit — how data got in and when |

Enums: `lead_source` (builtwith · hubspot · pregen · instantly_upload · minerva · manual · other), `lead_tier`, `lead_channel_kind`, `lead_channel_state`, `lead_outreach_status`.

Rough live size: ~58.9K domains, ~31K contacts, ~17.9K flagged `in_hubspot`.

## Sources

Every source is a CSV ingest that upserts on normalized domain and flips a
presence flag (`inBuiltwith`/`inHubspot`/`inPregen`/`inInstantly`):

- **BuiltWith** — the tech-stack / PMS-detection universe (the bulk, ~45K).
- **HubSpot export** — dedup + exclusion signals (`hasHubspotDeal`, `isExistingCustomer`, owner). ~17.9K.
- **Pregen** — the pre-built Wander Sites catalog.
- **Instantly upload** — the contact-level CSVs that seeded the send list.
- **Government permits** (2026-07, in progress) — STR permit filings; real operator identity but usually no domain. See `permit-list-processing.md`.

## Enrichment services (`src/server/services/`)

The pipeline that turns a bare row into a scored, contactable target. Per the
house rule, judgment/extraction is done with **AI (`generateText` + `Output.object`,
`claude-sonnet-*`)**, not regex.

| Service | Does |
|---|---|
| `lead-discovery` | source ingest / candidate discovery |
| `lead-extraction` | AI: scraped site → structured `{company, portfolio, pms, brand, pregenFit}` (the `LeadEnrichmentSchema`) |
| `lead-unit-estimate` | AI: triangulated unit/portfolio-size estimate + confidence (stored `unit_count` is noisy; this is the real size signal) |
| `lead-merge` | AI: dedup / merge two records |
| `lead-channel` | site-scrape contact-channel resolver + heuristic channel scoring → send/review/form/skip verdict |
| `channel-discovery` (#19) | Firecrawl `map` + structured `scrape` → persist every reachability channel as `lead_channel` |
| `domain-discovery` (2026-07) | **agentic** name→domain: claude-sonnet-5 + Firecrawl search/read tools verify the operator's site AND score target fit |
| `lead-verify` | trust layer: Minerva geo-validation + Bright Data LinkedIn on freemail contacts (is this the right person?) |
| `lead-outreach` | AI: generate the personalized cold sequence for a domain |
| `outreach-send` | headless push to Instantly |
| `cio-to-outreach` / `outreach-to-cio` workflows | bridge outbound ↔ CustomerIO lifecycle |

## The send pipeline

```
ingest → enrich/score → SEND-REVIEW queue → generate sequence → Instantly (headless) → reply webhook mirrors back
```

- **`/app/leads`** — domain-centric table with stats cards, source pills, PMS/net-new filters, and an enrichment drawer. Deep-linkable via `?lead=`.
- **`/app/leads/send-review`** — the operator queue: enriched net-new domains with a **verdict** (send / review / form / skip), the selected channel + evidence, the candidate contacts, and the drafted **Sequence**. Actions: *Resolve channel*, *Generate/Regenerate sequence*, *Verify people*. (Redesigned 2026-06 to verdict-as-hero cards with a colored rail.)
- **Instantly** — the cold-email projection; a contact is pushed as a lead into a campaign. The reply webhook mirrors replies/interest back onto `lead_contact`.

## Guards (before anything is sent)

- **HubSpot suppression** — the net-new predicate excludes `inHubspot`, `hasHubspotDeal`, `isExistingCustomer`. Don't cold-email an account sales already owns. Cross-reference is by **discovered domain** (via `findCompaniesByDomains`), because permit/legal names rarely match the CRM brand name.
- **`excludeFromOutreach`** — an operational kill-switch independent of score (opted out, bad domain, etc.).
- **Pregen guard** — placeholder pregen URLs are never written back to HubSpot.

## Lessons baked into the design

From `cold-outbound-playbook.md` and this session:

1. **Don't trust appended contact lists.** Purchased contacts are mostly
   mis-associated freemail junk. Derive the channel from the company's *own site*.
2. **Minerva is a geo-validator, not a source.** It matches freemails but often
   in the wrong city — use it to *downgrade* mismatches, not to supply contacts.
3. **`unit_count` is noise; `pregenFit` / the AI unit-estimate is the signal.**
4. **AI extraction beats regex for any judgment.** String-matching produced
   confident-but-wrong results (a domain "matching" because it shared a word).
   Hand the page to an analyst (the model) and ask "does this make sense."
5. **Verified ≠ viable.** A real, correctly-identified company can still be a bad
   target (enterprise, timeshare, aggregator) — score *fit* separately.

## Evolution (from git history)

- `fb81545` — domain-split Drizzle schema + isolated `leads` Postgres schema.
- `9697df0` — leads prospecting pipeline + HubSpot pull/merge.
- `dd46615` / `09cd9b1` — net-new concept + `/app/leads` UI + audit script.
- `934451c` / `d44c0ad` — Instantly v2 client + reply webhook → mirror onto `lead_contact`.
- `c69b070` — SEND-20 cohort, contact-channel resolution, enrich polish.
- `bc25ffd` / `b1662ac` — personalized AI outreach + headless Instantly send.
- `6637c00` — cold-outbound sequences modeled as lifecycle programs (Export-to-Claude).
- `dce6be0` → `677f6df` (2026-06) — send-review queue, **trust layer** (Minerva + LinkedIn), send-review redesign.
- `dc05533` / #19 — contact-channel discovery (`lead_channel` + Firecrawl backfill).
- 2026-07 (in progress) — agentic domain-discovery + fit-scoring + HubSpot name/phone finders (see `permit-list-processing.md`).

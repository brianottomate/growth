# The Leads Estate — Status Quo

**Status:** point-in-time inventory, 2026-07-08. Companion: `leads-convergence-plan.md`
(the decisions and the path forward). This doc is deliberately unvarnished — it states
what exists and what is awkward about it, so the plan doc can be short.
**Authors:** Kristian + Claude.

## The one-paragraph summary

Wander currently has **four independently built lead systems** (five if you count
HubSpot itself), created by four different owners who were pairwise unaware of each
other until this week. They converge on the same CRM through at least four separate
write paths and two-plus token copies. Each system is genuinely good at something the
others are not. The convergence plan exists because this is a coordination problem
first and an architecture problem second.

## The systems

### 1. HubSpot — the system of record (account 22480390)

The CRM and collaboration surface everything else orbits. Operational owner:
**Danny Mancini (RevOps)** — who is also the connective tissue across every effort
below, and the reason they can converge at all.

- ~215k companies (212,928 from IMPORT), 206,245 with `pms_ai_identified`.
- ~288k contacts. Sales Hub Enterprise + Pro seats.
- Sequences run natively at scale: 205 with enrollment history, 37 currently active,
  1,148 contacts enrolled.
- Platform constraints that shape everything: CRM Search has a 10k-result window and a
  **5 req/s cap shared account-wide** across every integration below; no joins, no
  aggregation — HubSpot cannot be anyone's analytical database.

### 2. `growth/` — the activation product (Kristian)

The anointed code home. Live in production on Vercel.

- **UI:** `/app/leads` (domain-centric pool, stats, filters, enrichment drawer) and
  `/app/leads/send-review` (verdict queue: send / review / form / skip, AI-drafted
  sequences).
- **Data:** Neon `leads.*` schema — 58,890 domains, ~31k contacts. Currently a
  **partial, stale-by-design projection**: the link pass
  (`scripts/link-leads-hubspot.ts`) matched 58,814 domains (99.9%) to HubSpot
  companies and stamped real `hubspotRecordId` + live status/owner, but freshness
  depends on someone rerunning the script. Only 38 domains were true net-new — the
  finding that inverted the architecture (see `hubspot-gateway-plan.md`).
- **Enrichment:** AI-first services (extraction, unit estimate, channel discovery,
  Minerva/LinkedIn trust layer) plus the **agentic domain-discovery + fit-scoring**
  pattern proven on the permit list (24/40 verified, ~0 false positives, ~30–60s and
  several claude-sonnet-5 calls per company). See `permit-list-processing.md`.
- **HubSpot gateway:** `/api/hubspot/v1` live in prod (health, companies/find,
  companies/upsert, contacts/upsert; bearer auth). Gateway plan Phase 1 ✅ and
  Phase 4 ✅ (202 sequences + Danny's 6 programs mirrored into `/lifecycle`);
  Phase 2 (enrichment → projection) agreed, not built; Phase 3 (inbound router port)
  pending; Phase 5 (continuous Neon hydration) pending — superseded by the sync design
  in `leads-convergence-plan.md`.
- **Segments pushed:** HubSpot lists 3748 ("Untouched small PMs", 772 companies) and
  3749 ("Re-engage candidates", 77).
- **Working clients:** HubSpot (1,454 lines, merged superset), BigQuery (real, used
  for the CIO/lead sync queries), Minerva, Instantly (dormant escape hatch).
- **Agent surfaces:** `/overview` chat (AI SDK tool loop), plan-agent, and the
  batch-analyst pattern. Operator layer is a written plan
  (`overview-operator-agent-plan.md`, `agent-runtime-options.md`), not built.
- **Honest weakness:** no test runner; `bun run check` is the only gate; deploys have
  historically broken silently. Mitigations (accept-then-process for the inbound
  router) are designed, not yet built.

### 3. `wander/leads` — the TAM census (Nathan Potter) — **stopping, agreed**

`~/Developer/wander/leads`, github.com/wandercom/leads. A local-first Python 3.11 +
SQLite system for a global near-census of short-term-lodging operators. Built by
driving Codex against spec files; 72k LOC source, 52k LOC tests, 48 migrations,
31 connectors, ~4.2k lines of docs. Runs on a production server (`/opt/wander-leads`,
systemd timer, 3.86 GB SQLite).

- **Philosophy:** deterministic, zero-AI, fail-closed, human review queues, strict
  personal-data minimization, per-source access reviews. Never writes to HubSpot
  (CSV suppression baseline only); outreach is banned scope.
- **Results:** global goal closed 2026-06-18 with 100 net-new verified operators
  across 17 countries. Current Canada/Mexico goal (target 250) is mid-flight:
  CA/MX baseline holds 1,073 active in-scope companies, 208 likely-qualified,
  180 release-eligible, **141 CRM-ready** — with no delivery path by design.
- **Why it's stopping:** throughput. The zero-AI posture routes every judgment call
  to deterministic gates or humans; recent pilots repeatedly failed their own
  continuation gates (StatCan: 416 staged companies, 0 qualified; New Brunswick:
  100 properties, 0; hosted-footprints v2: 86 pages, 0). The engineering is
  excellent; the yield per effort is not.
- **Worth salvaging:** the 141 CRM-ready operators (one export through the gateway),
  the hosted-booking/PMS tenant-footprint discovery concept, and the DB snapshot.

### 4. `wander-icp-playbook` — the qualification method (Andreas Wernicke, Snowball Consult)

`~/Developer/wander/wander-icp-playbook`. A June 4–26 engagement with Danny and
Torger Philosophos (VP Sales): find and qualify WanderOS ICP accounts from domains
alone. **A methodology handoff, not a codebase** — six short docs plus data; the
production code and prompts stay with Snowball, but the docs are an explicit rebuild
spec.

- **Method:** reverse-PMS technographics sourcing (876 raw US domains from ~25
  BuiltWith queries, $0) → deterministic evidence stack (DNS CNAME, HTML signatures,
  technographics, booking-host) → one narrow temp-0 AI classification →
  precision-max verdicts with a first-class UNKNOWN bucket. ~1.5¢/domain; the whole
  engagement cost ~$5 in data.
- **Results:** 95.2% precision against 200 team-graded accounts; 429 net-new
  candidates (~70% fit on the graded sample); the **v2 property counter** reads unit
  counts from the PMS booking engine's own catalog — 90.2% threshold-side accuracy,
  mean absolute error 1.13 units.
- **Unclaimed assets sitting in the repo:**
  - `data/ground-truth.csv` — 141 graded rows (99 fit / 42 not) + 33 exact reviewer
    unit counts. The only labeled test set at Wander.
  - `data/candidates-429.csv` — never CRM-deduped (Andreas had no HubSpot access).
  - Doc 04 — a near-build-spec for the booking-engine unit counter, which beats
    growth's current AI unit estimate on accuracy and cost.
  - Doc 05 — the **10-vs-20 unit threshold divergence**: the written ICP says 10+,
    the graders enforced 20+. Unsettled; gates what "qualified" means everywhere.

### 5. Adapt automation — person-level enrichment (Danny) — **running its course**

Live today: an Adapt-operated (AI agent) automation writing to HubSpot **every
15 minutes**. Snapshot PR: [growth#25](https://github.com/wandercom/growth/pull/25)
— the runtime is an Adapt skill artifact; the repo copy is a manually-synced mirror.

- Pulls 5 companies/run from HubSpot list 3729 ("Adapt Enrichment") lacking
  `adapt_last_enrichment_status`; enriches mainline phone/on-domain email under
  "policy A" (fill-blank + fix-junk — functionally the same rule as growth's
  `computeFieldsToWrite`); upserts a `"<Company> - Mainline"` pseudo-contact; finds
  up to 5 decision-makers (website → People Data Labs → public LinkedIn, incl. a
  realtor-license lookup for direct cells); stamps `adapt_*` provenance properties;
  daily digest to #team-lead-gen at 12:00 UTC.
- It fills the one layer no other system touches: **named decision-makers and their
  direct lines**.
- Notes for whatever succeeds it: `- Mainline` pseudo-contacts (and HubSpot's
  auto-stamped `{id}@fake-email.com`) must be filtered from any contact-based lists
  or lifecycle syncs; personal-cell harvesting carries a compliance posture (TCPA)
  that should be a deliberate, owned decision; a 409 email conflict currently drops
  the email silently. Pending BDR direct-dial changes (2026-07-06 discussion) are
  not in the snapshot.

### 6. BigQuery workspace — the existing HubSpot sync (RevOps)

Per Danny: a HubSpot ⇄ BigQuery sync already exists and is queryable from growth
today (`bigquery.client.ts` is real; `BIGQUERY_PROJECT_ID` is validated env).
**Cadence, object/property coverage, direction, and ownership unconfirmed** — the
convergence plan treats BQ as an optional backfill/reconciliation source, not as the
app's read store (see the sync-design section there for why, and for the CSV-export
alternative).

## Adjacent inventory (in scope for context, not decisions)

- **Permit list** (`growth/docs/permit-list-processing.md`): 84,394 STR permit rows
  from Brian, 4,569 PM companies; prototype validated; nothing ingested yet. The
  promotion path (verify → fit → not-in-HubSpot → `lead_domain`) is written.
- **wander.com inbound router** (`api/os/inbound`): the revenue path; still runs
  locally in wander.com pending gateway plan Phase 3.
- **Monolith `@wosc/hubspot`**: custom Listing object (`0-420`), separate token
  (`HUBSPOT_ACCESS_TOKEN`, SDK v12). Ports later, opportunistically.
- **Instantly**: dormant escape hatch; HubSpot AUP bans scraped-list cold email.

## The uncomfortable truths

1. **Four independent HubSpot write paths** — wander.com's inbound router, the
   growth gateway + scripts, the monolith, and Adapt — on at least two token copies,
   sharing one account-wide 5 req/s search budget that includes the inbound revenue
   path.
2. **Three lead-sourcing systems were built in parallel** with three incompatible
   fit taxonomies (`str_property_manager`/… vs `independent_operator`/… vs
   FIT/BORDERLINE/UNKNOWN). Any convergence in HubSpot needs a vocabulary mapping.
3. **Neon's projection is stale by design** until the sync in the convergence plan
   is built.
4. **The ICP threshold is unsettled** (10 vs 20 units) and every system encodes a
   different answer.
5. **Growth's operational rigor is thinnest exactly where it now carries the most
   risk** (revenue-path traffic, no tests). Known; mitigation designed; not built.
6. **Nobody owns the graded ground truth** — the single most reusable asset any of
   the four efforts produced.

## Open facts to confirm

| # | Question | Owner |
|---|---|---|
| 1 | BQ sync: cadence, objects/properties, direction (native export? Hightouch/Census?), owner | Danny |
| 2 | Which underlying token does Adapt's `HUBSPOT_ACCESS_TOKEN` map to? | Danny / Adapt |
| 3 | Total size of list 3729 (defines when Adapt "runs its course") | Danny |
| 4 | Nathan shutdown ritual: timer off, DB snapshot retained, salvage export approved? | Nathan |
| 5 | ICP tier definition: settle 10 vs 20 in writing (doc 05 recommendation: FIT ≥ 20 / BORDERLINE 10–19 / UNKNOWN never guessed) | Torger + Danny |
| 6 | HubSpot full-export mechanics for the Neon seed: CSV export vs BQ vs API sweep | Kristian + Danny |

# PerformanceAgent — Google Ads full-service application (pre-draft + RMF readiness map)

**Status: PRE-DRAFT (2026-07-16).** The product is a Linear BACKLOG concept ([Performance Agent, team AGE](https://linear.app/wander/project/performance-agent-04586ee40696) — no issues, no dates). This document exists so that when the product becomes real, the Google Ads API application and RMF review are a checklist, not a research project. Companion docs: [full-service playbook](./google-ads-standard-access-application.md), [parked internal application](./google-ads-standard-access-cto-signoff.md), [internal design doc](./google-ads-api-design-doc.md).

## 1. Product summary (from the Demand Engine framing — verify with Nick before filing)

PerformanceAgent is the paid-media arm of the WanderOS "Demand Engine" (Opportunity Score + Performance Agent + SEO Agent + Pricing Agent). A property manager sets a goal and budget; the agent runs and optimizes paid acquisition, score-gated so ads only run where the Opportunity Score justifies spend. **v1 paid scope: Google Search (intent capture) + Meta retargeting — explicitly not broad Meta prospecting — with hard cost-per-booking guardrails.** Prerequisite called out in the framing: source-of-traffic attribution (UTM/referrer/channel + unit-level funnel) must exist first.

Account model: Wander MCC → PM sub-account → campaigns. **Playbook preference: a separate developer token (and possibly separate MCC) for the PM-facing product** — keeps the internal token's declaration clean and isolates compliance blast radius.

## 2. The decision that shapes everything: the RMF exposure ladder

RMF category is determined by **who touches the tool**, and there are three distinct postures. This is the unresolved tension in the concept docs (agent-driven PM experience vs. managed service) — resolve it deliberately, because each rung buys different obligations:

| Rung | Posture | Who touches what | RMF exposure |
| --- | --- | --- | --- |
| **1. Pure managed service** | Wander staff (or Wander's internal agent) operate campaigns in PM sub-accounts; PMs interact only through WanderOS goal/budget forms and see outcomes in existing WanderOS analytics | No PM access to any Google-Ads-shaped tool surface | Arguably within the internal/agency exemption ("individual advertiser or agency use only; no third-party access to tool") — **verify with Google before relying on it**, since PM sub-accounts stretch "agency use" |
| **2. + PM reporting dashboard** | Rung 1 plus a WanderOS dashboard showing PMs their campaign performance | PMs consume reporting only | **Reporting-Only RMF**: must display all required columns per exposed report level (R.10-R.130 equivalents); no creation/management obligations |
| **3. PM-facing management / agent controls** | PMs (or their agent acting on their instruction) create, adjust, pause campaigns through Wander's product | PMs effectively manage their accounts through the tool | **Full-Service RMF**: all 27 items below, ongoing due-date compliance, material-change notices, non-compliance fees |

Strategic implication: **v1 can plausibly launch at rung 1-2 and defer full-service RMF entirely** — the agent-driven UX ("PM sets goal + budget") reads as rung 1 if the PM never manipulates campaign objects, only goals. Get Google's written read on rung 1 before assuming.

## 3. Full-Service RMF checklist (rung 3, Search campaigns)

Verified against the [RMF policy](https://developers.google.com/google-ads/api/docs/api-policy/rmf) 2026-07-16. This is the build checklist the product must demonstrably implement before a full-service application.

**Creation (C):** C.10 create campaign · C.20 geo targeting · C.30 language targeting · C.65 website/call conversion tracking · C.75 callout extensions (account level) · C.96 Target CPA bidding · C.97 Target ROAS bidding · C.98 Maximize Conversions · C.120 set budget · C.190 create ad group · C.260 add keyword · C.270 campaign negative keywords · C.300 keyword match type

**Management (M):** M.10 edit campaign settings · M.96 edit tCPA · M.97 edit tROAS · M.98 edit Max Conversions · M.110 pause/enable/remove campaign · M.130 pause/enable/remove ad · M.140 pause/enable/remove keyword

**Reporting (R):** R.10 customer-level metrics · R.20 campaign-level · R.40 ad-group-ad · R.50 keyword view · R.70 search-term view · R.100 DSA search terms (only if DSA) · R.130 bidding-strategy metrics

Notes: this is the **Search** set — adding Performance Max to the third-party product adds PMax-specific RMF items (not enumerated here; pull them when/if PMax is in scope). Launching third-party with Search only (which matches the v1 framing anyway) minimizes the RMF surface.

## 4. Ongoing obligations at rung 3 (often overlooked)

- **Due-dated features:** new RMF items come with `Due: YYYY-MM-DD`; items without a date are already past due. Compliance is continuous, not one-time.
- **Material-change notice:** screenshots/mockups of material product changes must go to Google **at least two weeks before** shipping them.
- **Non-compliance fees:** RMF violations carry financial penalties (see Google's non-compliance fees policy).
- **Extension valve:** two consecutive compliant years → eligibility for one six-month RMF extension per four years (for major rewrites).

These are a real operating cost — budget them into the rung 3 decision, not just the launch.

## 5. Application skeleton (rung 3 variant — fill when demonstrable)

Form: `support.google.com/adspolicy/contact/standard_token_application?hl=en` (13 questions + design-doc upload; mechanics documented in the [sign-off pack](./google-ads-standard-access-cto-signoff.md)).

| Topic | Answer sketch |
| --- | --- |
| Tool type | Full-service tool for participating WanderOS property managers |
| Cloud project | NEW project for the product token (do not reuse 430811523548 / internal declaration) |
| MCC | Decide: existing 152-064-2156 vs separate product MCC (playbook prefers separate) |
| Use case | Adapt the playbook's product description; campaigns managed from PM sub-accounts under Wander's MCC; PMs benefit without operating the API |
| Accessible outside org? | **Yes** (this is the whole point — answer changes from the internal application) |
| Campaign types | Search (add PMax only if actually shipped) |
| Capabilities | Campaign creation, campaign management, reporting — matching what the product demonstrably does |
| Design doc / RMF evidence | 2-4 pages or 3-5 min narrated demo covering the playbook's five pillars: account model, creation workflow, management workflow, reporting workflow, safety & access controls — real product UI, redacted |

## 6. Open items (blockers to filing, in order)

1. **Product exists** — Linear project is BACKLOG with zero issues; nothing to demonstrate yet.
2. **Operator-model decision (rung 1/2/3)** — the agent-driven-vs-managed tension; determines whether this application is even needed.
3. **Attribution prerequisite** — source-of-traffic + unit-level funnel (named prerequisite for the whole Demand Engine).
4. **Token/MCC separation decision** — separate token strongly preferred; needs its own dev-token request (Basic first, then this application).
5. **Google's read on rung 1** — ask whether staff-operated PM sub-accounts under Wander's MCC qualify for the agency/internal exemption.
6. **Verify with Nick** that the Demand Engine framing in §1 is still current before any external filing.

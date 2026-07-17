# Google Ads API Standard Access — CTO sign-off pack

**Date:** 2026-07-16 · **Requested by:** Kristian · **Approver:** Nathan (CTO)
**Decision requested:** approve submitting a Google Ads API **Standard access** application for Wander's existing developer token, using the **internal-tool framing** described below.

## TL;DR

We're asking Google to lift the 15,000 operations/day cap on our existing developer token (MCC 152-064-2156, currently Basic access). The application is honest, low-risk, and framed as what we actually run today: **internal reporting, monitoring, and account management tooling**. We are deliberately *not* applying as a customer-facing "full-service tool" yet — that stronger application (managing campaigns on behalf of WanderOS property managers) needs a live, demonstrable product and is documented separately in [google-ads-standard-access-application.md](./google-ads-standard-access-application.md) as the future playbook.

## What we run today (the evidence behind the application)

| Consumer | What it does | API shape |
| --- | --- | --- |
| Spend tracker (growth `/app/spend`, daily cron) | Cross-platform spend/conversion reporting | Daily GAQL reads per account |
| Ads sync (growth, Zernio-backed today) | Campaign inventory → Neon for the growth workspace | Reads; will move API-direct |
| Google Ads MCP (official `googleads/google-ads-mcp`) | Agent/analyst GAQL access for audits & diagnostics — e.g. the 2026-07-16 tag audit that resolved the "broken tag" escalation via API instead of screenshots | Ad-hoc GAQL reads |
| Conversion hygiene (planned, from [google-tag-cleanup.md](../../google-tag-cleanup.md)) | Archive dead conversion actions, monitor tag/conversion health | Reads + occasional mutates |

Accounts covered: Demand (325-444-9027), Supply (970-978-1352), MCC (152-064-2156). ~570 campaigns exist across platforms; per-campaign metric pulls across accounts on daily crons plus ad-hoc agent sessions is where 15k ops/day starts to pinch — and a quota incident inside a production cron is exactly the failure mode we want headroom against.

## Why Standard, why now

- **Headroom for automation.** Basic's cap is fine for a human, tight for crons + agents. We'd rather apply calmly now than during a quota incident.
- **Internal tools are exempt from the Required Minimum Functionality (RMF) review.** The heavyweight part of Standard applications only applies to tools offered to third parties. Our framing avoids it truthfully.
- **The token is shared infrastructure.** Whatever tier the token has, every consumer (crons, MCP, future ads product) inherits it.

## What we will say (draft form answers)

> Form questions change periodically; these are the answers to adapt, not paste blindly.

| Topic | Answer |
| --- | --- |
| Access level requested | Standard |
| Organization | Wander (wander.com) |
| Account | Wander MCC 152-064-2156 (existing developer token, Basic) |
| Tool type | **Internal use only** — not offered to third parties |
| Use case | Internal reporting, monitoring, and account management for Wander's own Google Ads accounts: automated daily spend/conversion reporting, campaign inventory sync into our internal growth workspace, conversion-action hygiene/auditing, and internal analyst tooling built on the official Google Ads API MCP server. All users are Wander employees; all accounts are Wander's own, under our MCC. |
| API operations | Predominantly GoogleAdsService.Search (GAQL) reads; occasional conversion-action and campaign-status mutates by authorized internal operators |
| Expected volume | Daily scheduled reporting across 3 accounts (~570 campaigns) plus ad-hoc internal queries; requesting Standard for headroom over the 15k/day Basic cap |
| Who uses it | Wander growth/engineering staff only |
| Technical contact | Kristian (kristian@wander.com) |
| Business contact | Brooke (performance ads manager) |

**Hard rule carried over from the playbook:** claim nothing that isn't running. No self-serve customer access, no bidding automation, no campaign types we don't touch.

## What we are explicitly NOT applying for (yet)

The **full-service tool** application — Wander managing Google Ads campaigns *on behalf of property managers* (the WanderOS ads product). That application triggers RMF review, which requires demonstrating live create/manage/report workflows in the actual product UI. As of today the WanderOS Google campaigns are paused with no PM-facing campaign UI, so per Google's own guidance (and our playbook doc) we wait. When that product ships, we submit the upgrade using [the existing playbook](./google-ads-standard-access-application.md) — Standard access obtained now carries over; the later review is about RMF, not re-earning the tier.

## Risks

| Risk | Assessment |
| --- | --- |
| Rejection | Costs a resubmission cycle (~days-weeks). No impact on existing Basic access, which continues working throughout. |
| Reviewer reclassifies us as full-service | Answer honestly that PM-facing management is a future roadmap item not in scope; internal use stands on its own. Do not expand claimed scope to satisfy a reviewer (playbook rule). |
| Token suspension | Only a risk for misrepresentation or ToS abuse. The internal framing is factually what runs today. |
| Nothing changes | Worst case we stay effectively as-is: Basic keeps working; we reapply later with more evidence. |

## Approval checklist (Nathan)

- [ ] Approve internal-tool framing (vs. waiting to apply as full-service)
- [ ] Confirm Kristian as technical contact, Brooke as business contact
- [ ] Confirm MCC billing profile is active/compliant (application prerequisite)
- [ ] Green-light submission via MCC → Tools → API Center

**On approval:** Kristian (or Claude, in-browser with Kristian) submits in the API Center, saves a copy of every submitted answer to this folder, and monitors the MCC email for reviewer questions.

## The actual form (verified 2026-07-16)

Location: **MCC → Admin → API center → Access level → "Apply for Standard Access"** → `support.google.com/adspolicy/contact/standard_token_application?hl=en` (use `hl=en`; it dead-ends in Norwegian). 13 questions + acknowledgments + **a required design-doc file upload (.pdf/.doc/.rtf)**. Review ≈ 10 business days. The form itself warns: only apply when approaching Basic limits — our justification (crons + agents headroom) should say so explicitly.

| # | Question | Our answer |
| --- | --- | --- |
| 1 | API contact email accurate? | Yes (kristian@wander.com — already in API Center) |
| 2 | Google Cloud project NUMBER (11-12 digits) | **430811523548** (`wander-growth-ads-mcp`, the quota project our API access runs through) |
| 3 | MCC ID | 152-064-2156 |
| 4 | Contact email | kristian@wander.com (consider creating google-ads-api@wander.com alias — form prefers a group) |
| 5 | Ongoing relationship with a Google rep? | ❓ **Kristian/Brooke to confirm** (account rep exists?) |
| 6 | Company website | https://www.wander.com |
| 7 | Business model, tool, audience | Adapt the internal-tool use-case paragraph above |
| 8 | Design documentation (file upload) | 📄 **To produce**: 2-3 page PDF — architecture (growth app + crons + official MCP), account model (MCC → own accounts), auth (user OAuth/ADC, internal operators only), workflows (reporting, sync, conversion hygiene), quota estimate. Draft from this pack. |
| 9 | Tool accessible outside the organization? | **No** |
| 10 | Token used with a tool developed by someone else? | ⚠️ Nuance: our tooling is in-house on Google's official client libraries + Google's own open-source MCP server. Intent of the question is third-party commercial tools → **No**, but note the official-MCP usage in Q7/Q8 for full transparency. |
| 11 | Campaign types supported | Search, Performance Max (what the accounts actually run — don't overclaim) |
| 12 | Capabilities provided | Account Management, Campaign Management, Reporting (NOT account/campaign creation) |
| 13 | Public homepage URL | https://www.wander.com |

**Remaining prep before submission:** (a) Nathan's sign-off, (b) the design-doc PDF (Q8), (c) answer to Q5, (d) optional email alias for Q4.

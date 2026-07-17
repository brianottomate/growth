# Google Ads API Standard Access — CTO sign-off pack

> **DECISION (2026-07-16): PARKED — no application filed.** Basic access
> (15k ops/day) covers all internal use for the foreseeable future; measured
> usage is ≈ 0 and an application now would risk a "not yet necessary"
> rejection per the form's own warning. Two tripwires re-open this:
> 1. **Internal quota pressure** — after the direct read-only connector ships,
>    the seven-day baseline projects a peak day credibly approaching 15k ops
>    → file THIS internal-framing application.
> 2. **PerformanceAgent / WanderOS ads product becomes demonstrable** — skip
>    this pack and file once, directly, with the full-service framing + RMF
>    evidence per [the playbook](./google-ads-standard-access-application.md).
>    (Quota tier is the only thing an early internal application would carry
>    over; the third-party declaration + RMF review happen at product launch
>    regardless, so applying early buys little.)
> Everything below is kept submission-ready for whichever tripwire fires
> first. The Q8 design document lives at
> [google-ads-api-design-doc.md](./google-ads-api-design-doc.md) (+ rendered PDF).

**Date:** 2026-07-16 · **Requested by:** Kristian · **Approver:** Nathan (CTO)
**Decision requested (superseded by the PARKED decision above):** approve submitting a Google Ads API **Standard access** application for Wander's existing developer token, using the **internal-tool framing** described below.

## TL;DR

We're asking Google to lift the 15,000 operations/day cap on our existing developer token (MCC 152-064-2156, currently Basic access). The application is honest, low-risk, and framed as what we actually run today: **internal reporting and monitoring tooling**. We are deliberately *not* applying as a customer-facing "full-service tool" yet — that stronger application (managing campaigns on behalf of WanderOS property managers) needs a live, demonstrable product and is documented separately in [google-ads-standard-access-application.md](./google-ads-standard-access-application.md) as the future playbook.

## What we run today (the evidence behind the application)

| Consumer | What it does | API shape |
| --- | --- | --- |
| Spend tracker (growth `/app/spend`, daily cron) | Cross-platform spend/conversion reporting | Daily GAQL reads per account |
| Ads sync (growth, Zernio-backed today) | Campaign inventory → Neon for the growth workspace | Reads; will move API-direct |
| Google Ads MCP (official `googleads/google-ads-mcp`) | Agent/analyst GAQL access for audits & diagnostics — e.g. the 2026-07-16 tag audit that resolved the "broken tag" escalation via API instead of screenshots | Ad-hoc GAQL reads |
| Conversion hygiene (planned, from [google-tag-cleanup.md](../../google-tag-cleanup.md)) | Audit dead conversion actions and monitor tag/conversion health | Read-only diagnostics; any remediation remains a separately approved manual Google Ads UI operation |

Accounts covered: Demand (325-444-9027), Supply (970-978-1352), MCC (152-064-2156). ~570 campaigns exist across platforms. The direct production connector is read-only and uses `googleAds:searchStream`; it does not make one API call per campaign.

### Quota evidence required before submission

The Standard-access form asks applicants to apply when approaching Basic limits.
Do not submit a vague "crons + agents" justification. Before filing, capture a
representative seven-day count of API operations by consumer (spend tracker,
inventory sync, MCP/audits), then project the highest expected production day
with a safety margin. Confirm how Google counts each request type against the
Basic quota. The form's expected-volume answer must use that measured/projected
number, not the campaign count. If the forecast is comfortably below 15,000
operations/day, defer the application until there is a concrete internal need.

## Why Standard, why now

- **Headroom for verified internal automation.** Subject to the quota forecast
  below, Standard avoids an avoidable production cap for scheduled reporting,
  inventory sync, and internal analysis.
- **Internal tools are exempt from the Required Minimum Functionality (RMF) review** — verified against the [RMF policy](https://developers.google.com/google-ads/api/docs/api-policy/rmf) 2026-07-16: "individual advertiser or agency use only; no third-party access to tool" does not require RMF compliance. Two nuances: (1) RMF taxonomy has three categories — Full-Service, **Reporting Only (= dashboards offered to end-advertisers, i.e. still third-party-facing)**, and Internal Use Only. We are *Internal Use Only whose functionality is reporting* — do NOT self-describe as a "Reporting Only tool" on the form, since that RMF category carries its own required-columns obligations. (2) RMF attaches to Standard-access tokens on an ongoing basis, so if scope ever drifts to third-party use, RMF obligations begin at that moment — reinforcing the signed scope boundary below.
- **The token is shared infrastructure.** Whatever tier the token has, every consumer (crons, MCP, future ads product) inherits it.

## What we will say (draft form answers)

> Form questions change periodically; these are the answers to adapt, not paste blindly.

| Topic | Answer |
| --- | --- |
| Access level requested | Standard |
| Organization | Wander (wander.com) |
| Account | Wander MCC 152-064-2156 (existing developer token, Basic) |
| Tool type | **Internal use only** — not offered to third parties |
| Use case | Internal reporting and monitoring for Wander's own Google Ads accounts: automated daily spend/conversion reporting, campaign inventory sync into our internal growth workspace, conversion-action hygiene/auditing, and internal analyst tooling built on the official Google Ads API MCP server. All users are Wander employees; all accounts are Wander's own, under our MCC. |
| API operations | Predominantly GoogleAdsService.Search / `searchStream` (GAQL) reads. No production mutation workflow is in scope for this application. |
| Expected volume | Insert the measured seven-day baseline and projected peak-day operation count from the quota evidence above. Do not use campaign count as a proxy for API operations. |
| Who uses it | Wander growth/engineering staff only |
| Technical contact | Kristian (kristian@wander.com) |
| Business contact | Brooke (performance ads manager) |

**Hard rule carried over from the playbook:** claim nothing that isn't running. No self-serve customer access, no bidding automation, no campaign types we don't touch, and no API write workflow that is not in production.

## What we are explicitly NOT applying for (yet)

The **full-service tool** application — Wander managing Google Ads campaigns *on behalf of property managers* (the WanderOS ads product). That application triggers RMF review, which requires demonstrating live create/manage/report workflows in the actual product UI. As of today the WanderOS Google campaigns are paused with no PM-facing campaign UI, so per Google's own guidance (and our playbook doc) we wait. When that product ships, Wander must update or submit an application for that changed use case and complete any applicable RMF review; this internal application removes no future product-review requirement.

### Signed scope boundary

This developer token is being requested for Wander's internal use only. It
must not be used for property-manager-facing or other third-party account
management under the present declaration. Launching that capability requires a
separately declared Google Ads API application and applicable RMF review before
production use. Prefer a separate developer token/MCC for that product; if the
same token is retained, obtain Google confirmation of the updated scope first.

## Risks

| Risk | Assessment |
| --- | --- |
| Rejection | Costs a resubmission cycle (~days-weeks). No impact on existing Basic access, which continues working throughout. |
| Reviewer reclassifies us as full-service | Answer honestly that PM-facing management is a future roadmap item not in scope; internal use stands on its own. Do not expand claimed scope to satisfy a reviewer (playbook rule). |
| Future scope drift | PM-facing management under an internal-only declaration would be inconsistent with this application. The signed scope boundary requires a new declaration/review before launch. |
| Token suspension | Only a risk for misrepresentation or ToS abuse. The internal framing is factually what runs today. |
| Nothing changes | Worst case we stay effectively as-is: Basic keeps working; we reapply later with more evidence. |

## Approval checklist (Nathan)

- [ ] Approve internal-tool framing (vs. waiting to apply as full-service)
- [ ] Approve the signed scope boundary: no third-party/property-manager use
      under this declaration; new application/RMF review before launch
- [ ] Confirm Kristian as technical contact, Brooke as business contact
- [ ] Confirm MCC billing profile is active/compliant (application prerequisite)
- [ ] Confirm the token is owned by MCC 152-064-2156 and the filing will be
      submitted from that MCC's API Center
- [ ] Review the seven-day API-operation baseline and projected peak-day count;
      do not submit without a credible near-limit quota case
- [ ] Green-light submission via MCC → Tools → API Center

**On approval:** Kristian (or Claude, in-browser with Kristian) submits in the API Center, saves a copy of every submitted answer to this folder, and monitors the MCC email for reviewer questions.

## The actual form (verified 2026-07-16)

Location: **MCC → Admin → API center → Access level → "Apply for Standard Access"** → `support.google.com/adspolicy/contact/standard_token_application?hl=en` (use `hl=en`; it dead-ends in Norwegian). 13 questions + acknowledgments + **a required design-doc file upload (.pdf/.doc/.rtf)**. Review ≈ 10 business days. The form itself warns: only apply when approaching Basic limits — which is exactly what the quota-evidence gate above enforces.

> **Reality check (2026-07-16): the quota gate currently BLOCKS submission.**
> Measured Google Ads API usage today is ≈ 0 — the direct spend-tracker
> connector is dormant (no production credentials were ever handed off), the
> ads-inventory sync consumes Zernio's quota, not ours, and MCP usage is
> ad-hoc. Honest sequence before filing: (1) ship the direct read-only
> `searchStream` connector, (2) run it ~7 days and record operations by
> consumer, (3) project peak day; submit only if the forecast credibly
> approaches 15k ops/day. Until then this pack is a prepared application, not
> a pending one.

| # | Question | Our answer |
| --- | --- | --- |
| 1 | API contact email accurate? | Yes (kristian@wander.com — already in API Center) |
| 2 | Google Cloud project NUMBER (11-12 digits) | **430811523548** (`wander-growth-ads-mcp`, the quota project our API access runs through) |
| 3 | MCC ID | 152-064-2156 |
| 4 | Contact email | kristian@wander.com (consider creating google-ads-api@wander.com alias — form prefers a group) |
| 5 | Ongoing relationship with a Google rep? | ❓ **Kristian/Brooke to confirm** (account rep exists?) |
| 6 | Company website | https://www.wander.com |
| 7 | Business model, tool, audience | Adapt the internal-tool use-case paragraph above. State that retrieved data is held only in Wander's internal growth workspace, is not shared externally, and the internal service/MCP use Google's supported client tooling in accordance with Google Ads API terms and policies. |
| 8 | Design documentation (file upload) | 📄 **To produce**: 2-3 page PDF — architecture (growth app + crons + official MCP), account model (MCC → own accounts), auth (user OAuth/ADC, internal operators only), workflows (reporting, sync, read-only conversion diagnostics), measured quota baseline and peak-day forecast, data handling, and the signed scope boundary. Draft from this pack. |
| 9 | Tool accessible outside the organization? | **No** |
| 10 | Token used with a tool developed by someone else? | ⚠️ Nuance: our tooling is in-house on Google's official client libraries + Google's own open-source MCP server. Intent of the question is third-party commercial tools → **No**, but note the official-MCP usage in Q7/Q8 for full transparency. |
| 11 | Campaign types supported | Search, Performance Max (what the accounts actually run — don't overclaim) |
| 12 | Capabilities provided | Reporting and monitoring only. Do not select account/campaign management unless a current, in-scope production mutation workflow can be documented. |
| 13 | Public homepage URL | https://www.wander.com |

**Remaining prep before submission:** (a) Nathan's sign-off including the scope boundary, (b) the design-doc PDF (Q8), (c) seven-day quota baseline and projected peak-day count, (d) answer to Q5, (e) confirm filing MCC/token ownership, (f) optional email alias for Q4.

## Appendix — Adapt review (2026-07-17)

Adapt's external review supported the **internal-tool-first** strategy: apply
for Standard access based on Wander's present, owned-account use case rather
than waiting for the future PerformanceAgent product. The present application
and the future property-manager product should remain separate declarations.

Points for the local agent to reconcile with the main document:

1. **Current writes must be exact or omitted.** Do not describe planned
   conversion hygiene as an API mutation workflow unless the product can name
   the exact mutate calls, Wander-owned account scope, authorizer, and cadence.
   The current pack treats it as read-only diagnostics.
2. **Quota needs evidence, not campaign count.** Measure a representative
   seven-day API-operation baseline by consumer and project a peak production
   day. Confirm how each request type counts toward Basic-access quota before
   relying on quota pressure as the reason for Standard access.
3. **Prevent scope drift.** The future PerformanceAgent/product path is
   third-party account management. Do not use this internal-only declaration
   for it. File an updated/separate application and complete any applicable RMF
   review before launching it; a separate token or MCC is preferred.
4. **Keep the operational boundary explicit.** Name the internal services,
   data destination, and policy posture: data stays in Wander's internal growth
   workspace and is not shared externally.
5. **Verify filing mechanics.** Confirm that developer token ownership and the
   Standard-access application both sit under MCC 152-064-2156.

### Adapt MCP connection

Adapt is configured directly in OpenClaw as a remote Streamable HTTP MCP
server:

```text
URL: https://app.adapt.com/mcp
Transport: streamable-http
Tool: ask_adapt
```

The bearer token is intentionally **not stored in this repository or this
document**. On the current operator machine it is already configured under
`mcp.servers.adapt` in `~/.openclaw/openclaw.json`; a new operator should obtain
their own token from Adapt or the shared secret manager and configure it there.
Do not paste a live token into Git, a ticket, or an agent handoff.

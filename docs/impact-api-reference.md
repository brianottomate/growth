# Impact.com Brand API — Wander Account Reference

**Status:** live-verified 2026-07-09 against the real account.
**Client:** `src/server/clients/impact.client.ts`. **Plan:** `docs/affiliate-program-takeover.md`.
**Credentials:** Doppler `wander-growth` (dev/stg/prd) as `IMPACT_ACCOUNT_SID` /
`IMPACT_AUTH_TOKEN` — created in the Impact dashboard (Settings → API Access),
scoped per the access-token scope picker. Never commit the token.

## Account facts

| Fact | Value |
|---|---|
| Account (numeric) | `3595917` |
| AccountSID (API username, appears in every path) | `IRHmBtWEKLzM3595917RPTaThMHe9dRmC1` |
| Program "Wander" (**Performance** — the AP-managed affiliate program) | CampaignId/ProgramId **31593** → `partner_program` row `prg_wander_impact` (active) |
| Program "Wander - Creator" | CampaignId/ProgramId **53661** → `prg_wander_creator` (paused — flip to active to monitor) |
| Partners joined to 31593 | 334 (of 1,350 account-wide) as of 2026-07-09 |
| Recent volume | 4 actions in the 30 days to 2026-07-09 — a zero-action day is normal today |

## The two programs, compared (live API, 2026-07-09)

| | **31593 "Wander"** | **53661 "Wander - Creator"** |
|---|---|---|
| Type | Performance (classic affiliate) | Creator (Impact's influencer product) |
| Partners joined | 334 | **0** |
| Contracts | 332 | **0** |
| Actions, trailing 44d | 7 (tracker "Booking") | **0** |
| Tracking domain | wander.sjv.io | wander.sjv.io (same) |
| Company contact | Dan Shapiro @ AP | Dan Shapiro @ AP (same — both need the 7/29 contact swap to partnerships@) |

**53661 is an empty shell** — created (presumably by AP) to explore Impact's
Creator marketplace, never launched. Same API surface works against it (Actions/
MediaPartners/Campaigns all 200 with zero rows), so the paused `prg_wander_creator`
row can be activated with no code changes if a creator program ever launches.

Observed payouts on 31593 (answers part of the commission-rate "x" in AP's doc):
Rakuten booking $4,432.94 → $177.32 (**4%**); Capital One bookings → **3%**.
Partner mix skews loyalty/card-linked (Rakuten, Capital One).

## API mechanics (learned the hard way, all verified live)

- **Base URL** `https://api.impact.com`; resources under `/Advertisers/<AccountSID>/…`.
- **Auth**: HTTP basic — AccountSID as username, AuthToken as password.
- **JSON**: `Accept: application/json` works (default is XML).
- **Dates**: ISO 8601 **without fractional seconds** — `2026-07-08T00:00:00Z`
  passes, `…T00:00:00.000Z` is a 400 (`Parameter 'ActionDateStart' has invalid value`).
- **Pagination**: root-level `@page`, `@numpages`, `@pagesize`, `@total`,
  `@nextpageuri` (empty string on the last page — follow it; it carries the full
  query). MediaPartners defaults to 100/page; Actions to 20,000/page.
- **Actions windows**: `ActionDateStart/End` (EventDate) max 45 days apart;
  `StartDate/End` filter by last-updated instead. `CampaignId` is required.

## Relevant endpoints by use case

From the token-scope catalog (full list in the dashboard scope picker); ✅ = already
used by the client, 🔜 = planned in the takeover doc.

### Monitoring (daily cron — live)
| Use | Method + path |
|---|---|
| ✅ Yesterday's conversions | `GET /Actions?CampaignId=…&ActionDateStart=…&ActionDateEnd=…` |
| ✅ Partner list + states (application queue) | `GET /MediaPartners` (`State=PENDING` for applications) |
| 🔜 Program metadata | `GET /Campaigns`, `GET /Campaigns/<CampaignID>` |
| 🔜 Balance / funding watch | `GET /Invoices`, `GET /Invoices/<ID>` (+ `/Download`) |
| 🔜 Click volume (tracking health at the top of funnel) | `GET /Programs/<ProgramID>/ClickExport` |

### Corrections & voids (Phase 2)
| Use | Method + path |
|---|---|
| Modify an action (the Text3 correction ritual, API-native) | `PUT /Actions` (async; poll the returned QueuedUri) |
| Reverse/void actions | `DELETE /Actions` |
| Audit trail of changes | `GET /ActionUpdates`, `GET /ActionUpdates/<ActionID>` |
| Track async submissions | `GET /APISubmissions`, `GET /Jobs`, `GET /Jobs/<JobID>/Download` |

### Partner relations (Phase 2–3)
| Use | Method + path |
|---|---|
| Partner disputes — the formal version of a "missing commission" email | `GET/PUT /ActionInquiries`, `GET /ActionInquiries/<ID>` |
| Partner detail / custom tracking values | `GET/PUT /MediaPartners/<ID>` |
| Partner contact book | `GET/POST/PUT /Campaigns/<CampaignID>/Contacts` |
| Partner grouping (Base/Content vs Loyalty vs Coupon rates) | `GET/POST /Campaigns/<CampaignID>/MediaPartnerGroups` |
| Program terms/contracts | `GET/POST /Programs/<ProgramID>/Contracts` (+ `/Download`) |
| Generate tracking links for a partner | `POST /Programs/<ProgramId>/TrackingLinks` |

### Reporting (Phase 1–2)
| Use | Method + path |
|---|---|
| List canned reports | `GET /Reports` |
| Run a report | `GET /Reports/<ReportName>` (+ `/MetaData`) |
| Async export | `GET /ReportExport/<ID>` → poll `GET /Jobs/<JobID>` → `/Download` |

### Deliberately unused
Ads, Catalogs, Promo Codes, Deals, Phone Numbers, Call Data, Exception Lists,
Deferred Deep Linking — creative/commerce surfaces we don't operate from growth/.
Conversions (`POST /Conversions`) is the **tracking emitter's** domain: Order
Completed fires server-side from the monolith. Never write conversions from here.

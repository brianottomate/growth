---
id: performance-case-study
title: "A Performance case study"
kind: procedure
summary: "Turn a client's results into a sales case study: pull before-and-after figures from the warehouse and ad platforms, store the ones worth showing on a report's caseStudy block, write the lead, and download the PDF."
tags: [performance, reporting, sales, procedure]
---

# A Performance case study

A case study is sales material: a performance report with a `caseStudy` block, opened by signed-in teammates at `/case-study/<brandSlug>/<reportId>` (linked from the client's Reports tab as **Open case study**). There is no share link: **Save as PDF** in the page header produces the file that goes out, and the PDF is the frozen copy. The page shows only changes (+32%), never revenue or counts. A case study can later become a blog article, alone or combined anonymously with others; the blog draws its facts from the case study, never the other way round.

Internal detail (declines, view-through attribution, data caveats) is discussed in the working session, not printed.

The page reads only the stored snapshot. Pull the data in the chat session (BigQuery, the Meta API, Google Ads), check it, and write the row. Growth does not query the warehouse for case studies.

## 1. Pick the windows

- **Launch date**: the day paid traffic started, confirmed in the site's paid-social sessions, not the date in a deck.
- **Before and after**: two equal windows that end the day before launch and start on launch day. Exclude today, since it is partial.
- **Baseline**: the before window should sit on the same platform and tracking as the after window. For a WanderOS before/after, the only pre-launch source is the client's own Google Analytics: use it only when its after-period figures agree with our warehouse (bookings and visitors within roughly 10–15%), and record both in the source note. A site that moved to WanderOS recently has no fair baseline before its go-live date (`wos_datastream.public_SaasWebsite.domainDnsSetActiveAt`). Never compare against a client's old GA4 numbers.

## 2. Pull the figures

Warehouse (`wander-9fc9c`, America/Denver dates), keyed by the WanderOS organization and website IDs:

- **Direct bookings**: `wos_datastream.public_v2Booking`, `channel = "GENERATED_WEBSITE"`, `status = "CONFIRMED"`, by `confirmedAt`.
- **Booking value**: `analytics_sites.bookings_finance.base_booking_nights_fee` for `booking_status = "confirmed"` (nightly value before fees and taxes; say so in the measure note). `v2Booking` carries no amount.
- **Visits**: `analytics_sites.traffic_sessions` sessions per window, and by `channel` (Paid Social, Paid Search, Direct …).
- **Lead time**: days between confirmation and `checkInDate`.

Ad platforms: pull paid results and creative the way the client-performance-report playbook describes, with the brand's own conversions.

Before writing a figure, check it can carry the claim:

- **PMS reservations** (`channel = "PMS_TRACK"`) are dated by when Wander imported them, which includes batch syncs. Do not use them to compare windows or to compute a direct share of bookings.
- **Unique visitors** depend on visitor identification, which changed during 2026. Prefer sessions.
- **Average value up, total value down** (or the reverse) means the booking count moved. Always show booking count next to value.
- **Seasonality**: a before window in peak season and an after window outside it (or the reverse) moves everything. Say so in the story when the windows straddle a season change.

## 3. Choose what to show

Store only the figures that belong in sales material: the ones that improved and hold up (enough bookings, not driven by one large booking, scope stated). Every figure stored is shown. Never word a site-wide change as caused by the ads, and never claim higher conversion or more bookings unless a stored figure shows it. If nothing holds up yet, wait for more data.

## 4. Write the case study

Write the report JSON as in the client-performance-report playbook, plus `caseStudy` (contract: `performanceCaseStudy` in `src/lib/performance-report.ts`):

- `headline`, `summary`: a placeholder is fine. **Write the lead** on the page replaces them and picks the featured figures from what is stored; every percentage it writes must match a stored figure. Press it again to regenerate.
- `showCreative`: whether the report's ad highlights print as a creative section. Toggle it on the page.
- `product`: `performance` for an ad-program story, `wanderos` for a website-platform story. It sets the eyebrow and how the lead is written. The client's logo comes from its brand.
- Rates (`unit: "percent"`) show their real values and a relative change (0.46% → 0.71% is +54%); other figures are indexed.
- `approval`: `null` until the client agrees. The page then shows "Internal draft · customer approval required". Record `approvedBy`, `approvedOn` and `scope` (`sales` or `public`) once they do.
- `comparison.measures`: each with a `scope` (`site`, `all_channels` or `paid`), a `unit`, and `before`/`after` values. Percent values are fractions (0.42).
- `series`: weekly points (Monday starts) covering both windows; mark an incomplete week `partial`.
- `events`: launch and setting changes, drawn on the charts.
- `sections`: the first one prints right after the hero, so make it the introduction: who the client is and what Performance by Wander does. Then what we did and what changed. Images must be stable Growth media URLs.
- `sources`: one per origin, with `via: "warehouse"` for BigQuery and the tables used in `note`. Only the labels appear on the page.

Write it as a draft with `scripts/performance-report-upsert.ts`, open the case study from the Reports tab, press **Write the lead**, check every figure against the pull, and download the PDF.

---
id: client-performance-report
title: "A client performance report"
kind: procedure
summary: "Write a Performance client's report: pull the window's Meta numbers with the brand's own conversions, pick the creatives, list channels and program work, write the narrative, and store one performance_report row the client opens at /report/<token>."
tags: [performance, reporting, procedure]
---

# A client performance report

A report is a snapshot. Every number is copied in when the report is written and the page never re-reads live data, so a sent report does not change. Derived figures (return on ad spend, click-through, cost per booking) are computed by the page from the counts; never store them.

This runs on a machine with the Growth repo and Doppler access, because the numbers come from the Meta Graph API with Growth's system-user token, and the row is written by `scripts/performance-report-upsert.ts`. The script validates the content against `src/lib/performance-report.ts` before writing.

## 1. The client and the window

1. Find the brand slug and its Performance account, and the Meta campaign(s) that ran for it: the account they run on and the campaign id. Campaigns on Wander's shared ad account (`act_885632589057558`) carry the client's name.
2. Agree the window with the operator: launch to date for a first report, otherwise the month. Write `periodLabel` as it should read in "Advertising performance and program status, <periodLabel>." Link `cycleId` only when the window is exactly one billing cycle.

## 2. Numbers from Meta

Call `GET /<ad account>/insights` at `level=campaign` and again at `level=ad`, filtered to the campaign ids, with `time_range` set to the window and `action_attribution_windows=["7d_click","1d_view"]` (what the client sees in Ads Manager). Fields: `spend,impressions,reach,inline_link_clicks,actions,action_values,ad_id,ad_name`.

**Use the brand's own conversions, never the generic pixel totals.** Wander's pixel fires on every WanderOS site, so `purchase`, `add_to_cart` and `landing_page_view` include other brands' bookings. List the account's custom conversions (`/<ad account>/customconversions`) and use the ones whose rule names the client's domain:

| Report metric | From |
| --- | --- |
| `spend`, `impressions`, `reach` | the campaign row |
| `linkClicks` | `inline_link_clicks` |
| `bookings`, `purchaseValue` | the brand's Purchase custom conversion (count and value) |
| `addToCart` | the brand's AddToCart custom conversion |
| `sitePageViews` | the brand's PageView ("Traffic") custom conversion |

Leave a metric out when the brand has no conversion for it. A missing tile is better than a borrowed number.

## 3. Channels

List every ad platform in the client's program in `channels`, live or not. A live channel's results are in `metrics`. A channel that is not live yet (`paused`, `setting_up`, `planned`) gets its own section with a one-line `summary` and a few `details` in client language: what the campaigns target, the daily budgets, what is tracked as a result. Read Google setups with the Google Ads search tool on the brand's own account. Never put internal campaign names or problems found during setup in client text; tell the operator instead.

### Bookings beyond ads

Bookings the program earned outside paid ads (guests who arrived from ChatGPT) go in `otherBookings`, one entry per source, counted from the client's own booking data and never overlapping the ad platforms' bookings. The page then leads with total bookings and blended cost per booking (ad spend across all bookings). Leave marketplace bookings out unless the operator asks to credit them, and say in `sources` how each was matched.

## 4. Creative highlights

Pick up to two ads: the ones the brand's Purchase conversion credits first, then the best link click-through with meaningful spend. Use the ad-level numbers for the same window. Each highlight needs a stable image: upload a feed preview or the creative to R2 (`r2BuildKey(brandId, "report-<slug>", file)`) and store that URL. Never store a Meta CDN URL: they expire.

## 5. Program work

One row per deliverable: email, website, social content, influencers, anything else agreed. Status is `planned`, `in_progress` or `delivered`. Take facts from Growth where they exist (lifecycle campaign metrics for email, published posts, amplification targets) and from the operator otherwise.

## 6. Narrative and next steps

Two short paragraphs each, plain language, no dashes as punctuation. `**bold**` is the only markup. Say what the numbers mean and how early they are; do not promise results.

## 7. Write it

Write the JSON (shape: `performanceReportWrite` in `src/server/services/performance-report.service.ts`) with `status: "draft"` and a `sources` entry per origin: `via`, `attribution`, the `conversion` used, which metrics it `covers`, and `fetchedAt`. Then:

```bash
bun --conditions react-server scripts/performance-report-upsert.ts report.json
```

It prints the id and the link. Open the link, check every number against the pull, then set `status: "published"`, pass the `id`, and run it again. The client saves the page as PDF or PNG from its header.

# Spend Tracker — how the numbers work

> `/app/spend` · replaces Brian Sun's Railway growth tracker (methodology
> preserved 1:1 — every constant traces to a locked decision in his
> `GROWTH_TRACKER_CONTEXT.md` §12). Built 2026-07-10.
>
> TL;DR for readers in a hurry: **DCPB is the primary number** (target $500);
> the channel table and the top-line cards deliberately don't sum to each
> other; **net take is the only metric that lags** — everything else is live.

## Where each number comes from

| Data | Source | Freshness |
|---|---|---|
| Meta spend + bookings | Meta API, campaign-level, single account `act_885632589057558`, **WanderOS/Listed campaigns excluded** (denylist), 28d-click + 1d-view | live, final at day close (minor same-day lag) |
| Google / other paid spend | BQ `analytics.marketing_adnetwork_daily_report` | daily |
| Bookings (top-line cards) | BQ `analytics.bookings` — confirmed + profit, Sites excluded, cancellations NOT netted | live |
| Bookings (channel table) | BQ `bookings_reconciled_v2` ⋈ funnel attribution, **last-touch only** | live |
| GMV | BQ `analytics.report_gmv` — full booking value at booking-creation date (not revenue-recognized), includes cancelled | live |
| Gross take | dbt `analytics.north_star_metrics` | **restates ~1 week** (see below) |
| Fixed costs | `spend-tracker.config.ts` — effective-dated, pro-rated daily, in-progress UTC day = $0 | config (git = audit log) |
| Demand sales bookings/GMV | `spend-tracker.config.ts` `DEMAND_SALES_MONTHLY` — reported by the team, replaces Serrelle's Google Sheet | monthly manual |

No database cache: every load recomputes from these sources (a daily cron
pre-warms the default windows). Stale-dashboard drift — the failure mode of
the Railway tracker — is structurally impossible.

## The formulas (locked decisions)

- **DCPB** (primary, $500 target) = total marketing spend / **direct**
  bookings. Direct excludes the 4 OTAs (Airbnb, Vrbo, Booking.com, Amex —
  `mybookingpal` is Amex, not Booking.com).
- **Marketing spend** = ad spend + fixed costs. No loyalty points, no coupons.
- **ROAS** = (GMV × 20% blended take) / **ad** spend. The 20% is a deliberate
  Operated-leaning constant, above the ~12% OTA-loaded real blended take.
- **Net take** = gross take − complete marketing spend. No 1.70× multiplier.
- **CPB** = spend / all bookings incl. OTA (reference only).

## Why the cards and the channel table don't sum

By design. Top-line cards answer *"how is the business doing"* —
finance-aligned totals from `analytics.bookings` / `report_gmv`. The channel
table answers *"which channel drove what"* — platform attribution (Meta's own
28d+1d numbers for Meta, BQ last-touch for the rest). Platform attribution
credits more bookings to paid channels than last-touch and can't see
unattributed bookings; forcing the two views to reconcile would break both.
The unattributed remainder is monitored as the "other bucket" in the health
badge (alert > 25%).

## Net take lags — everything else doesn't

Gross take is **recognition-based** and the pipeline backfills it for about a
week (measured: Jul 1–6 2026 restated **+57%** within 4 days). Spend is final
at day close. Consequences:

- Recent-window net take always reads low at first; a *cached* recent net
  take can even go falsely negative (this is what the Railway tracker showed
  in early July 2026 — Kyle's "negative take rate" question).
- The Net Take tile therefore shows two figures: the live estimate, and
  **"settled thru T-7"** — gross take *and* spend both clipped to seven days
  ago, apples-to-apples. Quote the settled number when it matters.
- Early in a month the settled window is only a few days, so settled MTD net
  take looks small until mid-month. Short window, not bad business.
- Power-user lagged view: append `?end=YYYY-MM-DD` to shift any window back
  to fully-settled territory.

**Only net/gross take behaves this way.** Spend, bookings, GMV, and funnel
counts do not restate — lagging those would only make the dashboard stale.

## Updating the manual config

Both live in `src/server/services/spend-tracker/spend-tracker.config.ts`;
edit → PR → deploy. Git is the audit log (the Railway tracker's Settings UI
edited its DB with no trail — that's how affiliate's $10K/mo went missing
from its own migration history).

- **Fixed costs**: ADD a new row with a new `effectiveMonth` — never edit
  history. Latest row ≤ target month wins and carries forward.
- **Demand sales**: one `{ month, bookings, gmv }` row per month, from the
  demand-sales team's numbers.

## Guardrails worth knowing about

- **Marketplace campaign denylist** (`/wanderos|listed/i`, fail-pessimistic):
  the Meta account is shared with WanderOS/Listed — the filter removes ~46%
  of raw account spend (Jul 2026). Excluded campaigns are logged at fetch.
- **Ad-account allowlist** (Neon `ad_account`, default-deny): aggregator
  OAuth is personal-identity-based and leaks foreign ad accounts (Homi et
  al.); nothing outside the allowlist can enter any ads read.
- **Interim Google/Pinterest connectors**
  (`spend-tracker/connectors/README.md`): Zernio-shaped, credential-gated
  no-ops today; deleted when Zernio connects those platforms.
- **Verification**: `bun test` locks the methodology (28 tests);
  `bun --conditions react-server scripts/spend-verify.ts` recomputes every
  KPI from raw sources and triangulates Meta spend three ways.

## Provenance

Full decision history: `brian/wander-growth-tracker` →
`docs/GROWTH_TRACKER_CONTEXT.md` (§12 locked decisions, §13 SQL appendix).
Port strategy + deviations: `spend-tracker-port.md` (repo root).

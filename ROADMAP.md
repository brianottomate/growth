# Growth Tracker Roadmap

## Shipped
- [x] Dashboard with KPIs, channel table, insights, trends chart
- [x] Password authentication (@wander.com only, auto-signup on first login)
- [x] Ask Claude AI assistant panel with smart suggested questions
- [x] Theme toggle (dark/light mode)
- [x] Settings page (profile, notifications, data preferences, appearance)
- [x] BigQuery live data (spend, bookings, funnel — 3 queries)
- [x] MTD + custom date range filtering
- [x] Refresh data button with sync logging
- [x] Dylan Wright methodology + validation pages
- [x] ROAS fix: takeRateRevenue / spend (not GMV)
- [x] Meta Ads API integration (28d_click + 1d_view attribution, replaces BigQuery last-touch for Meta)
- [x] Graceful Meta API fallback (degrades to BigQuery if API fails)
- [x] Railway deployment with auto-deploy from GitHub

## Now
- [ ] **Validate Meta API in production** — Confirm bookings differ from BigQuery, review numbers with Brooke
- [ ] **Daily email digest (Resend)** — Morning summary with KPIs, top movers, CPB status
- [ ] **CPB threshold alerts** — Email notification when any channel exceeds $500 target

## Next
- [ ] **Slack daily digest** — Post to #marketing-lifecycle automatically
- [ ] **Channel detail pages** — Click channel row to see daily breakdown + trends
- [ ] **CSV/PDF export** — Download reports (Dylan request)

## Later
- [ ] **Goal setting** — Custom targets per channel
- [ ] **Annotations** — Mark events on trend charts (campaigns, holidays)
- [ ] **Budget pacing alerts** — Warn when spend is ahead/behind pace
- [ ] **Predictive forecasting** — End-of-month projections based on current trends

---

*Last updated: March 4, 2026*

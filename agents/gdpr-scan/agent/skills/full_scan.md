---
description: Full consent audit of one or more sites — scan, catalog diff, infra probe, severity report.
---

# Full consent scan

Run this procedure per site. Do the sites sequentially so evidence doesn't
get mixed up.

1. **Pre-consent scan.** `scan_page` on the homepage and one deep page (a
   property/booking page if you know one — they historically carry more
   tags). Use `acceptLanguage: "de-DE,de;q=0.9"` on one call so
   language-conditional injections show up.
2. **Classify.** Apply the severity rubric from your instructions to every
   tracker hit, inline fingerprint, and unknown external host. A tracker in
   raw HTML = 🔴 (it loads before any consent check for opt-in visitors).
   A GTM container id anywhere = 🟡 minimum, because its contents are
   invisible to static analysis.
3. **Catalog diff.** `diff_catalog` with the observed vendor names and
   Set-Cookie names. Undeclared vendors = 🟠 even if consent-gated.
4. **Infra probe.** `check_consent_infra` — confirm the regime cookie
   and/or /api/geo behave, and flag a cache-unsafe geo endpoint.
5. **Report.** One markdown table per site: severity | finding | evidence
   (host or cookie, source page). Close with a verdict paragraph that
   explicitly states the static-analysis caveat: consent-gated post-grant
   loads were not exercised.

If every signal is 🟢 and the consent markers (`__wanderConsent`,
`wander_consent`) are present, the verdict is "clean under static analysis" —
never "fully compliant".

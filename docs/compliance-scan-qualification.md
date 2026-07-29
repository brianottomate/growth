# Compliance scan as lead qualification signal

## Context

Same browser-probe method as audit.wander.com's privacy-readiness dimension (see that repo's `docs/compliance-scan-plan.md`, and `tracking/docs/consent-architecture.md`). For growth, the scan is a **qualification and outreach input** on `lead_domain`, parallel to the PMS-detection assessment in the pregen pipeline (`pregen-sites-v2.md` §PMS-detection).

## Plan

1. **New enrichment fields on `lead_domain`:**
   `complianceScan = { bannerPresent, cmpDetected, preConsentTrackers[], scannedAt }` — populated by an explicit probe step, not cron.
2. **Qualification:** hosts with EU-relevant markets + failing scans are high-fit for the WanderOS EU pitch; surface as a chip beside the ranker score in the /leads UI.
3. **Outreach angle:** "your new site is EU-ready out of the box" — positive framing only. Never fear-based, never partner-disparaging, no legal claims.
4. **Sequencing:** after the pregen PR train lands (wander#20690 etc.); the scan step can ride the same enrichment queue.

## Non-goals

- No automated compliance "reports" sent to prospects unreviewed.
- No scanning at scale before a rate-limiting / politeness review.

## Related

- audit.wander.com `docs/compliance-scan-plan.md` — the user-facing audit dimension (same probe).
- `tracking/docs/consent-architecture.md` — the consent enforcement work this capability came out of.
- `pregen-sites-v2.md` — PMS detection + enrichment pipeline this rides alongside.

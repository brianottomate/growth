# Growth Project Memory

## Repo Role
`growth` is the operational hub for the Wander growth platform. All planning docs, architecture decisions, and operational references should live here — not in `tracking/`.

## Related Repos
- `../tracking/` — will become an npm package (canonical YAML event registry, generated TS types, Segment tooling). Keep it lean/machine-readable. Do NOT put planning docs there.
- `../wander-growth-api/` — Python/FastAPI reference implementation for the CIO → Outreach sync pipeline.

## Docs
- `docs/tracking/` — copied from `tracking/` repo. Single source of planning truth for analytics/tracking work.
  - `TRACKING_PLAN.md` — full event catalogue across all surfaces
  - `wander-tracking-plan.v0.yml` — canonical event schema (YAML)
  - `SEGMENT_STATUS_2026-02-23.md` — Segment sources/destinations/tracking plans snapshot
  - `EVENT_OWNERSHIP_AUDIT_2026-02-23.md` — conversion event ownership + Impact.com risks

## Active Branches
- `feat/wander-data-flow` — Wander system map visualization (SystemMap component + wander-system.ts data)

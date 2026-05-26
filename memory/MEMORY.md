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

## Build / Tooling Gotchas (post May 2026 upgrade)

- **Use `import type` not `import { type X }`.** Turbopack on Next 16.2+ doesn't reliably erase the inline `type` modifier; the import chain gets followed and leaks server modules (anything transitively using `next/headers`) into client bundles. Applies especially to type-only imports of `AppRouter` and similar.
- **ESLint is pinned to `^9.39.4`.** Don't bump to 10 until `eslint-plugin-react` (still 7.37.5) ships ESLint 10 support — 10 removed `context.getFilename()` which the plugin still calls. Revisit when the plugin updates, or consider dropping `eslint-plugin-react` entirely (most rules duplicate `@next/eslint-plugin-next`).
- **Velite imports use `#velite` alias, not `from ".velite"`.** The old form only worked because of TS's now-deprecated `baseUrl`. Path is registered in `tsconfig.json` paths.
- **Resend sender is env-driven via `RESEND_FROM_EMAIL` / `RESEND_REPLY_TO_EMAIL`.** Default is `Wander <onboarding@resend.dev>` which works on any Resend account without domain verification — override to `Wander <hello@email.wander.com>` once `email.wander.com` is verified on the Resend account in use.

## Pre-existing lint debt (May 2026)

`bun run check` reports ~18 errors in pre-existing code, none introduced by the upgrade. Hotspots:
- `src/app/flow/pregen-sites/page.tsx`, `src/app/flow/whiteboard/page.tsx`, `src/components/system-map/SystemMap.tsx` — dagre's `g.node()` returns weakly-typed `any`; fix by typing the result as `{ x: number; y: number }` or using `@types/dagre` types.
- `src/app/api/instantly/test-write/route.ts` — uncommitted WIP; imports `@/server/clients/instantly.client` which doesn't exist yet. Build will fail until that client is created or this file is removed.

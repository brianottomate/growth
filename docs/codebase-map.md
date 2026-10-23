# Current Growth codebase map

Verified against `dev` on October 23, 2026. This is a source navigation map, not a
claim that every workflow is enabled in production. Update the relevant row when
moving a workflow. Exact scripts live in `package.json`; development rules live
in [AGENTS](../AGENTS.md), and sibling ownership in [the workspace map](wander-workspace.md).

## Shared execution path

App UI → `src/server/api/routers/` → typed actions in
`src/server/ai/capabilities/` → business logic in `src/server/services/` →
`src/server/db/` and provider clients in `src/server/clients/`.

Routers are registered in `src/server/api/root.ts`. `actionProcedure` in
`src/server/api/orpc.ts` serves an existing action to the app; these small adapters
share contracts and organization scope with chat/MCP. Some procedures remain
router-owned, so inspect the actual handler rather than assuming every call
uses an action.

`src/server/ai/capabilities/domains.ts` assembles domain tools;
`src/server/ai/capabilities/index.ts` projects tools for chat and MCP.
`src/server/ai/kernel/policy.ts` owns action consequences and approval policy.
`src/lib/growth-capabilities.ts` is the client-safe action catalog.

## Workflow entry points

All paths below are relative to the Growth checkout.

| Workflow | UI / HTTP entry | Actions / router | Owning services | Schema |
| --- | --- | --- | --- | --- |
| Performance clients, prospects, readiness and tracker | `src/app/app/performance/` | `src/server/ai/capabilities/performance.ts`, `src/server/api/routers/performance.router.ts` | `src/server/services/performance.service.ts`, `src/server/services/performance-desk.service.ts`, `src/server/services/performance-readiness.service.ts`, `src/server/services/performance-tracker.service.ts` | `src/server/db/performance-schema.ts` |
| Intake application and selected properties | `src/app/app/performance/clients/[brandSlug]/IntakeActions.tsx` | Performance actions | `src/server/services/performance-intake.service.ts`, `src/server/services/performance-settings.service.ts` | Performance, brand and home schemas |
| Ad idea editing, approval and reopening | `src/app/app/brands/[brandSlug]/ads/_views/AdCard.tsx` | `src/server/ai/capabilities/ads.ts`, `src/server/api/routers/ads.router.ts` | `src/server/services/ad-set.service.ts`, `src/server/services/ad-idea-studio.service.ts`, `src/server/services/ad-approval.service.ts` | `src/server/db/ads-schema.ts` |
| Campaign drafting and provider publishing | `src/app/app/brands/[brandSlug]/ads/` | Ads actions | `src/server/services/ads-draft.service.ts`, `src/server/services/ads-write.service.ts`, `src/server/services/brand-ad-accounts.service.ts` | Ads and brand schemas |
| Home groups and booking targets | `src/app/app/brands/[brandSlug]/homes/`, `src/app/app/performance/clients/[brandSlug]/booking/` | `src/server/api/routers/homeGroups.router.ts` | `src/server/services/home-groups.service.ts` | `src/server/db/home-schema.ts` |
| Canonical assistant and saved conversations | `src/app/app/overview/`, `src/app/api/overview/chat/route.ts` | Domain tools and kernel | `src/server/services/chat-turn.service.ts` | `src/server/db/creative-work-schema.ts` |
| MCP / OAuth | `src/app/api/mcp/route.ts` | `src/server/mcp/server.ts`, `src/server/ai/capabilities/to-mcp-server.ts` | Shared action runtime; OAuth config in `src/server/better-auth/config.ts` | Auth membership tables |
| Newsletter editing and email documents | `src/app/app/newsletters/` | `src/server/ai/capabilities/email.ts`, `src/server/api/routers/newsletter.router.ts` | `src/server/services/email-document.service.ts`, `src/server/services/newsletter-template.service.ts`, `src/server/services/email-delivery.service.ts` | `src/server/db/email-document-schema.ts` |
| Content and timeline | `src/app/app/content/`, `src/app/app/feed-v5/` | `src/server/ai/capabilities/content.ts`, `src/server/api/routers/content.router.ts` | `src/server/services/content-publishing.service.ts` | `src/server/db/content-schema.ts` |
| Media and compositions | `src/app/app/media/`, `src/app/app/compositions/` | `src/server/api/routers/media.router.ts`, `src/server/api/routers/composition.router.ts` | `src/server/services/media.service.ts`, `src/server/services/composition.service.tsx` | `src/server/db/media-schema.ts` |
| Social listening | `src/app/app/listen/` | `src/server/ai/capabilities/listening.ts`, `src/server/api/routers/listening.router.ts` | `src/server/services/reddit-monitor.service.ts`, `src/server/services/twitter-monitor.service.ts` | `src/server/db/listening-schema.ts` |
| Lead / outreach sync | `src/app/app/leads/`, `src/app/api/workflows/cio-to-outreach/route.ts` | `src/server/api/routers/leads.router.ts` | `src/server/services/sync.service.ts`, `src/server/services/cio-to-outreach-workflow.service.ts`, `src/server/services/outreach/` | `src/server/db/leads-schema.ts` |
| Pregen generation and preview artifacts | `src/server/services/pregen/`, `src/app/api/pregen/preview/[token]/route.ts` | `src/server/api/routers/pregen-native.router.ts` | Pregen services; rendering is in the sibling `pregen-preview/` repo | Inspect the schema barrel for the relevant pregen tables |

All domain schemas must be re-exported through `src/server/db/schema.ts` for
Drizzle and Better Auth to discover them.

## Live, experimental and compatibility surfaces

- `/app/performance/clients`, `/app/performance/prospects` and
  `/app/performance/tracker` are normal product surfaces.
- `/app/performance/prototype` is an experimental workspace reading real data.
  Its name does not mean its mutations or queries are fictional.
- `/app/performance-mock` is a separate fictional workflow UI.
- `/app/feed-v5` is the canonical timeline. `/app/feed` is an older feed still
  referenced by actions and UI; removing it requires updating those callers.
- `/app/listen-v2` redirects to `/app/listen` and preserves Slack deep links.
- `/lab/design-system/chat` previews assistant result cards; `/lab` also holds
  workbenches. These are internal surfaces with the lab access gate.

## Tests and reference docs

Look next to the owning implementation for `*.test.ts` / `*.test.tsx`, including
`src/server/services/performance-intake.test.ts`,
`src/server/services/ads-write.service.test.ts`, and
`src/server/services/ads-write.google.test.ts`.
Cross-cutting contracts run through `src/scripts/ai-kernel-gauntlet.ts`;
MCP protocol tests are in `src/server/mcp/server.protocol.test.ts`.

Read [ad approval](ad-approval-lifecycle.md) before changing approval or reopen
behavior, [MCP capabilities](mcp-capabilities.md) before changing tool exposure,
and [testing principles](testing-principles.md) before adding tests.
[The original architecture plan](growth-product-architecture-map.md) and
[February progress snapshot](growth-platform-progress.md) are historical.

# Wander workspace repo map

The parent `Wander/` folder contains independent Git repositories; it is not a
Git repository or a single package workspace. Paths below are relative to that
parent. Start a task in the owning checkout, read its `AGENTS.md` if present,
and use its own package manager and checks.

| Checkout | Owns |
| --- | --- |
| `growth/` | Growth back-office, Performance clients/campaigns, assistant/MCP, leads and outreach. Next.js, Bun, Drizzle on Neon. |
| `wander/` | Backend monorepo, WanderOS business modules and services. Prisma; its database docs do not describe Growth's database. |
| `wander.com/` | Public Wander marketplace website. |
| `app.wander.com/` | WanderOS dashboard and site editor. |
| `wander-sites-website/` | Public property-site renderer, Astro/React on Cloudflare Workers. |
| `pregen-preview/` | Pregen preview renderer, Astro on Vercel. Growth owns generation and the artifact API it reads. |
| `tracking/` | Shared tracking packages and event implementation for web/mobile/server consumers. |
| `event_schemas/` | Shared Kafka and clickstream event schema library. |
| `page-sections/` | Shared property-site section schemas and rendering components. |
| `mobile/` | Expo/React Native mobile app. |

For Growth work, `cd growth` from the parent before Git, Bun, or source searches.
Use [the codebase map](codebase-map.md) to find workflow entry points. Growth
assistant conversations are in `src/server/db/creative-work-schema.ts`, with
turn orchestration in `src/server/services/chat-turn.service.ts`.

Scope searches to the owning repo first (`rg --files src`, `rg -n 'term' src docs`).
Expand to a sibling only when the workflow crosses a documented API/package
boundary. Search `scripts/` and `src/scripts/` as well as `src/` before declaring
an exported helper unused. Next.js route files are framework entry points even
without imports. Preserve compatibility redirects with external callers.

The workspace-level `../AGENTS.md` is a local entry point outside this Git repo.
This tracked map preserves the same ownership information for other checkouts.

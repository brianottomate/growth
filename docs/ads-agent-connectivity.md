# Ads agent connectivity — architecture + gating

**Decided 2026-07-16 (Kristian).** How the growth agent (and Claude sessions) reach the ad platforms, and how writes are contained.

## Division of labor

| Surface                                                                                             | Role                                                                                                         | Why                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Zernio** (hosted MCP `mcp.zernio.com/mcp` + `zernio.client.ts`)                                   | Posting + standardized fetching/reading across platforms — campaign/ad tree, analytics, publishing, inbox    | One normalized shape over Meta/Google/TikTok/LinkedIn/Pinterest/X; already synced (570 campaigns incl. Google) |
| **Official Meta MCP** (`mcp.facebook.com/ads`)                                                      | Digging deeper + verifying on Meta — pixel diagnostics, catalog, custom audiences, experiments               | First-party depth Zernio doesn't expose                                                                        |
| **Official Google Ads MCP** (`googleads/google-ads-mcp`)                                            | Digging deeper + verifying on Google — GAQL forensics, conversion-action audits                              | Read-only by design; the tag-audit workhorse                                                                   |
| **Hand-wrapped capabilities** (`src/server/ai/capabilities/ads.ts`, `src/server/services/ads-*.ts`) | Hot paths the agent runs constantly: ads scope, top ads, intent alignment, and governed Meta/Google/LinkedIn creation | Typed, allowlisted, server-credentialed; no per-call MCP overhead                                              |

Rule of thumb: **Zernio for breadth, official MCPs for depth, hand-wrapped for the hot paths.**

## Write containment (the important part)

All three MCPs expose destructive tools (Meta `ads_delete_*`/`ads_update_entity`, Zernio `posts_delete`/`posts_publish_now`, Google is read-only). Posture: **read everything, write narrowly, delete never-by-default.**

1. **Growth agent runtime** — when attaching these MCPs to the agent (Claude API MCP connector), set a server-level **`allowed_tools`** allowlist per MCP: reads by default, writes opted in **per agent, per use case** (e.g. the social-listening agent gets `zernio.comments_reply_to_inbox_post`; nothing gets `posts_delete`). API-enforced, not model-discretion — no proxy code required.
2. **Scoped Zernio key** — the current `ZERNIO_API_KEY` (wander-growth/prd) is full-power (publish/delete/broadcast). **Request a scoped READ-ONLY key from Zernio** for any agent-facing surface; keep the full key server-side for the sync jobs only. (Draft request below.)
3. **Claude Code / operator sessions** — destructive calls already hit the permission classifier + confirm-first rule; optionally add deny rules for `mcp__*__*delete*`, `mcp__zernio__posts_delete`, `mcp__zernio__posts_publish_now`.
4. **Full MCP-to-MCP passthrough** in `/api/mcp` is deferred — only build it if we need per-argument policy (e.g. "reply only to human-approved threads") or one unified endpoint for claude.ai connectors.

### Current campaign write boundary

`adsWrite` is available in the in-app overview assistant. Each action requires
the product's approval continuation and rechecks three identities immediately
before the provider call: organization-owned brand, active Zernio connection in
that brand's profile, and exact platform ad account in the default-deny
allowlist. The detailed MCP and `invoke_growth` projections omit this domain
because their current execution path cannot present the same approval card.

Meta standalone creation is paused by construction. There is no
validate-only pass. Meta duplication also requests a paused copy. Meta boost and
Google campaign creation can start spend after provider acceptance, which is
called out in their tool descriptions and approval payloads.

## Strategy ↔ reality alignment (shipped 2026-07-16)

The `ads-schema` intent layer (`campaign.targetChannels/budget/dates`) is the source of strategy; Zernio-synced `campaign` rows are reality. `ads-alignment.core.ts` diffs them (per-channel ok/inactive/missing, unplanned + date drift, budget pacing, suggested links); surfaced on the campaign detail page and via `campaign.alignment` / `alignmentOverview`. Next iterations: audience_target ↔ audience alignment (same pattern), and a periodic "drift digest" the agent can narrate.

---

## Draft: Zernio scoped read-only key request

> Subject: Scoped read-only API key for agent/analytics use
>
> Hi Zernio team — we currently use a single full-access API key for both our
> automated sync jobs and our internal AI-agent surfaces. We'd like a **second,
> read-only scoped key** (accounts / analytics / ads-tree / posts-list / inbox
> read; no publish, delete, broadcast, or reply) so we can safely expose Zernio
> to agents without write capability. Does your API-key management support
> per-scope keys, and if so which scopes should we select for read-only? Thanks!

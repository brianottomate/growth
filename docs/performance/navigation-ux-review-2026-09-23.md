# Performance, Brand, and assistant UX review

Reviewed September 23, 2026 against the local `growth` checkout on `dev`, HEAD `865fff8`. No application changes made.

## Implementation on the combined oRPC branch

All six work areas are implemented locally on `feat/orpc-native-runtime`:

- Performance campaign, by-home and platform detail routes reuse the existing editors under the client shell. Client links, draft creation, attachment completion and deletion returns keep that workspace.
- The assistant resolves brand, campaign, home and billing account context against the active organization. Operators can follow the page or pin a campaign/brand, with a visible warning when the pin differs. Focus belongs to each conversation. Explicit page focus cannot inherit an older ad target.
- The former Ads (old) tab is Unassigned creatives, with its own count, explanatory empty state and a campaign link. Attaching approved creatives opens their destination campaign.
- Client breadcrumbs, a shared Brand tab shell, reciprocal workspace links and scoped media/website/channel/storefront links preserve orientation. Creation and chat labels distinguish navigation, a new session and continued conversation. Billing is accessible from the Performance sidebar.
- The assistant header shows readable context. Older tool-result notices are consolidated. The dock starts at 1024px; smaller screens use a bottom panel that leaves the workspace visible and can be collapsed without losing the conversation.
- Named MCP navigation includes Performance indexes. Campaign reads and draft creation return an explicit review path/URL, entity IDs, state and the next action. Provider approval policies and MCP exclusions are unchanged.

Validation includes the full repository check, unit tests, AI contracts, and authenticated local reads of real campaign pages. The page-context endpoint rejects a campaign under another brand and returns no entity for an unknown brand; anonymous requests return 401. Browser checks cover the client shell, chat focus controls and responsive layout. Provider writes and model-driven edits are not part of this verification.

The original audit below is retained as historical evidence and rationale.

## Handoff status

At the time of the original #295 handoff this document contained proposals only. The implementation status above describes the combined branch.

The handoff branch starts from `23ca9eeb` on `dev`, newer than the original review snapshot. Preserve these intervening changes when implementing:

- PR #292 introduced a dedicated `catalog` route/tab, renamed the old Ads tab to **Ads (old)**, and added a Setup brand preview with a font/hero-home picker. Catalog no longer sits below the old Ads workspace. Treat the route map below as the original snapshot, not the current tab inventory.
- PR #289 added durable chat controls, individual tools, and background operation receipts. PR #293 corrected dispatched-message queue presentation. Revalidate chat behavior against these changes before implementing or interpreting the older MCP/domain descriptions below as the complete current interface.
- PR #291 changed Meta Performance publishing. Preserve its behavior and current approval contracts; this audit did not validate that flow.
- At handoff, the exact-brand-only context resolver in `OverviewAssistantPopup.tsx` still matches the finding below. The broader navigation and data-scope recommendations remain candidates for implementation, subject to a fresh live check.

### Resume on another machine

```bash
git fetch origin
git switch --track origin/docs/performance-navigation-handoff
```

If that local branch already exists, switch to it instead. Read `AGENTS.md`, then this document. Fetch the latest `dev` before implementation and reconcile subsequent changes rather than restoring the reviewed snapshot. Follow the repository's Bun setup and verification instructions; no environment files or credentials are included in this PR.

Start with a fresh reproduction of Performance → client → campaign and a chat-context check after switching clients. The implementation order and acceptance checks at the end define the proposed work; product decisions such as retiring **Ads (old)** or choosing final tab names remain proposals.

## Scope and evidence

Live inspection: Performance dashboard, Clients, Legacy RnR overview and Ads, normal Legacy RnR brand map, and an existing paused campaign. Inspected the shared assistant UI and existing conversation without sending prompts or performing campaign mutations. Additional subpages, navigation, context resolution, and MCP behavior were reviewed in source. MCP OAuth and model execution were not exercised; findings about them are implementation review, not end-to-end validation. Data counts below are observations at review time.

## Main conclusion

Performance is a client operations entry point layered over shared Brand and Ads records. Reusing those records and editors is sensible. The navigation does not preserve the operator's entry point, however, and the UI hides distinctions between unassigned creative, campaign ads, catalog exports, and organic previews. The assistant receives the current pathname but lacks verified entity resolution for these detail pages; explicit chat buttons supply better context than ordinary typing.

## Route map at the original review snapshot

Let P = `/app/performance`, B = `/app/brands/:brand`, and C = `P/brands/:brand`.

| Page | Links and destinations | Breadcrumb / back behavior |
|---|---|---|
| P dashboard | Clients, Performance Campaigns; campaign rows and action links open B/ads/:campaign | No section breadcrumb; global sidebar is the way out |
| P/clients | Brand name opens C; campaign rows open B/ads/:campaign; “New campaign” for existing campaigns links to B/ads | No section breadcrumb |
| P/prospects | Brand name opens C; Ads link opens normal brand ads; pitch/intake links leave Growth | No section breadcrumb |
| P/campaigns | Shared campaign rows open B/ads/:campaign | No section breadcrumb |
| C overview | Checklist, media, contacts; tabs Setup, Ads, Campaigns, Settings | No Clients parent link or breadcrumb |
| C shared header | Full brand page → B; Ads desk → B/ads; Content → B/content; Previews → B/previews | Crosses workspaces without an explicit return path |
| C/setup | Home selection and links into individual homes / Ads | Retains client tabs; no client-list parent |
| C/homes | Permanent redirect to C/setup | Alias, not a separate home index |
| C/homes/:home | Home workbench | “All homes” always returns to C/setup, even if opened from an ad wall |
| C/ads | Unassigned ad workspace plus Catalog; attach approved ads to campaigns | Retains tabs, but no indication that assigned ads leave this view |
| C/campaigns | New campaign creates a draft and follows its returned path; rows open normal campaign editor | Performance tabs disappear on opening a campaign |
| C/settings | Performance settings and shared ad connections | Retains client tabs |
| P/brands | Redirects to P/clients | Legacy alias |
| P/accounts and P/:account | Commercial account list/detail, billing cycles and delivery | Detail has Back to accounts; Accounts is absent from the current visible sidebar |
| P/prototype | Separate prototype workspace | Explicit All brands link returns to prototype index |
| B brand map | Strategy, Ads, Content, Previews, Setup; global surface links | Brands / brand; no prominent return to the Performance client |
| B/strategy and B/setup | Strategy and account connections respectively | Brands / linked brand / section |
| B/ads | Campaigns, platform campaign detail, audiences, context export | Brands is linked; brand name in breadcrumb is plain text |
| B/ads/:campaign | Creative, audience/platform work, chat | Brands / linked brand / Ads; no Performance origin |
| B/ads/:campaign/by-home | Campaign review by home | Explicit back to campaign |
| B/ads/platform/:id | Provider campaign detail | Brands / linked brand / Ads |
| B/content | Brand-locked content board, Previews | Linked brand / Content; “All brands” opens global Content |
| B/previews | Organic planned-post previews / selection | Brand label, but no brand breadcrumb or back link |
| B/performance | Separate Performance checklist form | Brands / linked brand / Performance; another meaning of “Performance” |

These breadcrumb-like rows are generally ordinary divs and links, rather than a consistent semantic breadcrumb component. The normal Brand subpages do not share the persistent tab shell used by Performance.

## Findings, in priority order

### 1. Performance campaign navigation loses its parent (high)

Reproduction: Performance → Clients → Legacy RnR → campaign. The editor shows Brands / Legacy RnR / Ads. The operator can use browser history or global Performance navigation, but cannot follow a local parent back to the client campaign list. The same happens from the Performance dashboard and Campaigns index.

Evidence: `src/app/app/performance/_components.tsx`, `brands/[brandSlug]/campaigns/page.tsx`, and `src/app/app/brands/[brandSlug]/ads/_views/CampaignView.tsx:191`.

Recommendation: give Performance campaign detail a route under its client shell, rendering the existing shared editor. Use canonical parents, with optional validated return links for filtered lists. Keep browser Back separate from “All campaigns” or “All homes.”

### 2. Assistant page scope and conversation scope can disagree (high)

`OverviewAssistantPopup.tsx:79` resolves only the exact normal brand landing route. Performance brands and nested Brand Ads pages do not resolve a brand there. The current pathname is sent on every message, which is good, but `kernel/page-context.ts` does not resolve Performance brand, home, account, or ad campaign entities as it does content/series/product entities.

Intent brand and campaign context persist in the dock; route changes do not clear them. The server prioritizes active campaign context over the ordinary brand prop. An explicit campaign chat intent is therefore more reliable than opening a page and typing “this campaign,” and a prior focus can conflict with the current page. This is a risk established from code, not a demonstrated incorrect write.

Live observation: an existing Hollyhock conversation appeared while inspecting Legacy RnR. Persistence itself is useful; the missing piece is a visible indication of which context the next message will use.

Recommendation: resolve an organization-verified route context for every relevant detail route. Show a readable context line, e.g. “Legacy RnR · September campaign · Ad: Hero carousel.” Distinguish page context from a pinned conversation focus and make conflicts explicit. Do not silently abandon a deliberate ongoing conversation.

### 3. Performance Ads is an unlabeled unassigned-ad view (high)

Legacy RnR overview reported 59 ads and eight campaigns. Its Ads tab displayed “Nothing here yet.” `ad-set.service.ts:874` filters to `campaignId IS NULL`; attaching ads writes the campaign ID, removing them from this list. That is a data-scope distinction, not evidence of lost ads, but the product does not explain it.

Recommendation: show All / Unassigned / In campaigns with counts, or explicitly label this screen “Unassigned creatives.” After attaching ads, show the destination campaign and an Open campaign link. Replace the empty state with “No unassigned ads; view your campaign ads.”

### 4. Identical labels describe different workflows (medium)

Performance Ads = unassigned creative and catalog exports. Normal Brand Ads = campaign/platform/audience launchpad. Header Previews = organic planned posts, even when reached from Performance. Performance Setup = homes preparation, while normal Brand Setup = connections. “New campaign” on Clients opens an Ads index; the same label on client Campaigns creates a draft immediately. Two global sidebar sections also use Campaigns.

Recommendation: use explicit nouns such as Creative, Paid campaigns, Organic previews, Homes, Connections, and Billing where those match the content. Make creation actions consistent; label navigation “View campaigns” rather than “New campaign.”

### 5. Back links and brand filtering are inconsistent (medium)

Performance client tabs are a good persistent sibling navigation pattern, but there is no Clients parent link. Normal Brand Ads cannot navigate to its brand via the displayed breadcrumb name. Organic Previews lacks a parent link entirely. A home always backs to Setup regardless of entry. The normal brand map opens some global surfaces without brand filters (media, channels, website, apps), while other cards retain brand scope.

Recommendation: use a shared breadcrumb contract and scope-aware destination helpers. For cross-workspace links, label the destination explicitly and provide a reciprocal client/brand switch. A “Back to results” link should restore filters; a breadcrumb should always identify the canonical parent.

### 6. Chat is useful, but its interaction cost is uneven (medium)

Campaign and individual-ad “Work in chat” actions provide explicit entity context and start a new thread. Focused “Ask the assistant” actions reuse a thread. “Start campaign in chat” starts a multi-step playbook in the current conversation. These differences are not obvious in the button labels. The persistent session header exposes a raw `ath_...` ID instead of the current client/work item. The observed older conversation repeated the same unsupported-result notice eight times.

Below the `xl` layout breakpoint, chat uses an almost-full-screen overlay, hiding the creative being discussed. On desktop it occupies a fixed 472px dock; the visual workspace competes with both dock and navigation. This deserves responsive review, particularly for placement matrices; a full device matrix was not tested here.

Recommendation: explain when an action starts a new conversation, display task context instead of a raw ID, consolidate legacy-result notices, and support inspecting the selected ad alongside its conversation. Retain the current write-completion refresh: `OverviewChat.tsx:280` invalidates queries and refreshes server content after workspace writes.

### 7. MCP shares capabilities but needs a clearer product handoff (medium)

The canonical catalog and action policy are shared. MCP exposes local ad planning/editing plus Performance account operations; provider-spend actions such as push and setDelivery are excluded from direct MCP and retained in approval-capable in-app surfaces. This is a useful boundary, not a parity defect to erase.

Navigation has no named Performance destination in `workspace-navigation.ts`, although the safe internal-path fallback can reach it. Generic `campaigns` navigation opens `/app/campaigns`, not the Performance campaign index. Performance page guidance also describes Dashboard/Clients/Campaigns/Accounts as tabs although the current visible navigation is a sidebar with Prospects and Prototype and no Accounts entry.

Recommendation: add named Performance destinations and return explicit brand/campaign IDs, state, review URL, and next allowed action from MCP work. When provider approval is needed, hand off to the exact in-app campaign. Keep current-page context an in-app feature; external MCP clients must supply explicit records. Align guidance with the live IA.

## Proposed navigation contract

Performance: `Performance → Clients → Brand → Overview | Homes | Creative | Campaigns | Settings`, with campaign detail inside the client shell. Give Billing a discoverable home if account-cycle operations remain supported.

Brand workspace: `Brands → Brand → Strategy | Content | Organic previews | Paid campaigns | Connections`, with a persistent sibling navigation shell. Expose “Open Performance workspace” for eligible clients; Performance exposes “Open brand workspace.” Both reuse shared records and editor components.

Creative workflow: choose homes → draft creative → review/freeze → attach to campaign → plan destination/audience/budget → approve paused platform push → separately enable delivery. UI and chat should name the same objects and states. Every completion should link to the durable result.

## Suggested implementation order and acceptance checks

1. Fix route context and origin-preserving campaign navigation. Verify fresh visits, client switching, deep links, and a pinned campaign conversation on another client's page.
2. Clarify the unassigned-ad boundary and attach completion. Verify an approved ad moves to a campaign with an explicit destination and stable all-ad counts.
3. Introduce shared breadcrumbs and client/brand switches. Verify every reviewed detail page has a canonical parent and all sibling tabs preserve brand scope.
4. Unify creation labels and scope labels; clarify organic versus paid previews. Verify every “New campaign” action has the same user expectation.
5. Improve chat context display, overlay review, and MCP handoff links. Verify MCP drafts are inspectable in the UI and provider actions remain behind the existing approval flow.

Do not infer provider-write correctness from this review: no ads were created, modified, approved, pushed, or activated, and no assistant prompt was submitted.

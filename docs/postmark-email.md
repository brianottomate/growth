# Postmark for brand email: where we are and what to decide

Brief for the "postmark broadcast streams" meeting on 2026-10-01 (Kristian, Josh,
Camille, Lauren). Read this before the call; the open questions are at the end.

## Today

- **One Postmark server for everything.** Server `16447531 "Wander"` sends for
  app.wander.com and every WanderOS site, with one server token shared by every
  monolith module (os-notifications, pms, organizations, auth). A second server,
  `20902065`, is staging.
- **Streams on that server:** `outbound` (transactional), `broadcast` (never
  used, no webhooks), `inbound`.
- **Domains:** 3,104 on the account (the monolith adds one per WanderOS site),
  415 with DKIM and return-path verified. Example: winterparkescapes.com is
  verified and sends trip mail from `contact@winterparkescapes.com`.
- **Last 30 days:** 31,110 sent, 1.44% bounce, 0.048% spam complaints, 747
  suppressions on `outbound`.
- **Unsubscribes live in our DB,** `SaasGuestEmailOptOut` per `websiteId`, with
  `/saas/guest/unsubscribe` as the page. The table is not in BigQuery. Brian's
  [wander#22237](https://github.com/wandercom/wander/pull/22237) adds a read
  route.
- **Marketing goes out on the transactional stream.** WanderOS Announcements
  send without a `MessageStream`, so they land on `outbound`. 13 of the 14 spam
  complaints in 45 days came from announcement blasts. One blast (2 Sep, 5,163
  sent) hit 0.23%, over Gmail's 0.1% guideline, and puts the trip-confirmation
  reputation at risk. Camille's
  [wander#22240](https://github.com/wandercom/wander/pull/22240) moves them to
  `broadcast`.

## The tenancy problem

Postmark suppressions are scoped **per message stream**. On one shared server, a
guest who unsubscribes from brand A's blast via Postmark's link is suppressed for
brands B to Z as well. A spam complaint on one brand's blast also counts
against everyone's reputation.

## Options

| Option | Pros | Cons |
| --- | --- | --- |
| **A. Shared server, `broadcast` stream, Postmark unsubscribe** (what #22240 gives us by default) | No new infra; ships now | Unsubscribe is cross-brand; one brand's complaints hurt all; Postmark's link sits next to our own opt-out link |
| **B. Shared server, `broadcast` stream, Custom unsubscribe** (`SaasGuestEmailOptOut` is the truth) | One server; per-brand opt-out we already own; keeps our branded page | Custom handling needs Postmark approval; we filter every send ourselves; reputation is still shared |
| **C. One server per brand** (created through the account API, at least for Wander Performance clients) | Per-brand suppression for free; per-brand stats, webhooks and reputation; Postmark's hosted unsubscribe is per brand, which is acceptable | N tokens to store and rotate; webhooks per server; the monolith assumes one token today; we still merge `SaasGuestEmailOptOut` at send time |
| **D. One broadcast stream per brand on the shared server** | Per-brand suppression without new servers | Streams per server are capped, so it does not scale to hundreds of sites; reputation is still shared |

Domains are account-level, so options C and D reuse the DKIM and return-path
records already verified. **No DNS changes.**

**Recommendation: C for Performance clients** (a handful of brands with real
send volume), and A or B for the long tail of WanderOS sites. Whichever we pick,
check `SaasGuestEmailOptOut` at send time, so an opt-out on either page is
respected.

## Customer.io vs Postmark for blasts

| | Customer.io | Postmark |
| --- | --- | --- |
| **Pros** | Running today: Wander newsletters, about 2 a week to about 327k, around 31% opens; segments, liquid, journeys, reporting built in; Brian's WPE workspace can bridge the next 2 to 3 weeks | Already our sender, already on every brand's DNS; cheap per email; Bulk API (`POST /email/bulk`) with Mustachio fields; Growth owns the audience, the copy and the send |
| **Cons** | One workspace per brand for unsubscribe isolation; profiles copied out of our DB; WanderOS opt-outs not wired in; another DNS setup per brand (it coexists with Postmark, on different selectors); content lives outside Growth | We own audiences, scheduling and suppression merging; no journey builder (lifecycle flows stay in WanderOS) |

**Decision taken in Growth (2026-09-30):** all brands' newsletters and blasts go
through Postmark, including Wander's. The Customer.io code stays for now, and
lifecycle flows stay in WanderOS.

## What Growth has (in prod)

- **Composition:** one brand-framed layout (`emails/marketing/ListingsDigest.tsx`)
  with a block editor and AI per block. It places the brand's own WanderOS homes
  as feature, list or grid cards, which stack on a phone, and adds header cards
  (`email-header` composition).
- **Per-brand sender and legal footer:** `brand.email_sender` and
  `brand.legal_identity` (jsonb).
- **Per-guest fields:** `{{first_name|there}}` and `{{last_home}}`. Growth fills
  them itself or compiles them to Postmark Mustachio.
- **Recipients:** past guests from BigQuery (`listBrandGuestRecipients`, 206 for
  WPE). Opt-outs still need excluding before a real send.
- **Postmark access:** a read-only client and a probe script:
  `src/server/clients/postmark.client.ts` and
  `SKIP_ENV_VALIDATION=1 bun --conditions=react-server run src/scripts/postmark-probe.ts <domain>`.
- **WPE promos:** Brian's 8 promos are recreated as `newsletter.blast` drafts
  (Oct 9 to Nov 27).
- **Not yet:** the send itself (test send, then scheduled send via
  `platform_post.scheduled_at`) is being built on a separate branch. It passes
  `{{{ pm:unsubscribe }}}` as the unsubscribe URL.

## Open questions for the call

1. **Per-brand servers:** do we create them, created by whom (monolith on site
   activation, or Growth on Performance onboarding), and where do the tokens
   live?
2. **Unsubscribe method:** Custom or Postmark-hosted? If Custom, who asks
   Postmark for approval?
3. **Complainer carry-over:** should `outbound` complainers (747 suppressions)
   be copied to the new broadcast streams?
4. **Webhooks:** which webhooks go on broadcast streams, and does the monolith
   consume them, Growth, or both?
5. **Fallback sender:** blasts from `noreply@notifications.wander.com` (the
   fallback when a brand's DNS is not active) should be blocked for marketing.

## Brand email setup (prod, 2026-10-01)

Sender, logo and footer are set for the paid Performance clients. Each sends
from the address its trip mail already uses in Postmark. Logos go through the
site's image proxy as 400px PNGs, since JPEG blacks out transparency and
Gmail drops SVG and WebP. Footer addresses come from each site's schema.org
data, so confirm them with the client.

| Brand | Sends from | Footer address | WanderOS homes | To fix |
| --- | --- | --- | --- | --- |
| Wander | not set | full | 0 (uses wander.com homes) | Pick a from-address; logo and icons are hosted on Customer.io's image CDN |
| Winter Park Escapes | `contact@winterparkescapes.com`, verified | full | 219 | none |
| 30A Beach Stays | `contact@30abeachstays.com`, verified | city only | 33 | Street address |
| Chalets Hocking Hills | `contact@chaletshh.com`, verified | no zip | 54 | Zip code |
| Hollyhock Suites | `contact@hollyhocksuites.com` | full | 64 | DKIM failing in Postmark |
| Legacy RnR | not set | city only | 22 | No verified domain of its own; street address |

## Toward the custom build (Brian, 2026-09-30)

Brian's asks, and how we plan to meet them.

**The endgame.** A customer connects their accounts and fills out intake.
Everything is built and launches automatically, and reports go out on their
own.

| Ask | Plan |
| --- | --- |
| Operable by Claude, no UI needed | Expose every email step as a Growth capability (see below). The same catalog serves the in-app chat and MCP at `https://growth-red.vercel.app/api/mcp` ([setup](claude-mcp-setup.md)). Sends and report sends stay approval-gated actions. |
| Automated DNS onboarding in the intake form | WanderOS already adds every site's domain to Postmark. Intake reads the domain's DKIM and return-path status, shows the missing records, and re-checks until both pass. Writing the client's DNS for them needs a DNS-connect vendor (e.g. Entri); out of scope for v1. |
| Flows can be turned on or off, drafted for everyone by default, triggered by intake | Flows run off booking events, which live in WanderOS. WanderOS already has templates for stay-again, abandoned cart, past-guest offer and welcome. Keep one set of flows there, read per-brand config, and let Growth (and MCP) switch them on per brand and draft the copy. Do not build a second journey engine in Growth. Needs alignment with Nathan. |
| Same for broadcasts | Growth's job. One shared theme becomes a draft per brand automatically, with that brand's homes, sender and footer. The WPE promo import (`scripts/import-performance-promos.ts`) is the manual version. Drafts are automatic; a person approves each send. |
| One dynamic set for everyone | The brand row is the config: `email_sender`, `legal_identity`, `performance_settings`, homes. One template plus each brand's config gives every client their own version. |
| Client data isolation | Growth rows are scoped by brand. For email, one Postmark server per Performance client (option C above): separate unsubscribes, stats and reputation per brand. This is the Postmark version of brand-specific ids in Customer.io. |
| Weekly and monthly reports | Brian designs the deliverable. Growth supplies the data on a cron (Postmark stats per brand, bookings from BigQuery, ad results), placed on an existing cron mark. |
| Everything is config | Agreed; see "one dynamic set". |

The guest list and opt-outs are the client's data. Retention should come from
the value we deliver, not from withholding data on exit. Wander also has to keep
honoring opt-outs after a client leaves.

### Drive it from the Claude desktop app

Better than pure Claude Code or MCP with no UI: open Growth inside the Claude
desktop app and drive it from there. Claude works through the MCP tools while
the Growth page sits beside the chat in the app's browser pane, so you watch
the draft, phone preview and blocks change as Claude edits them. You can click
into any block to correct it by hand, then hand it back to Claude.

### Capabilities to add

`emailRead.get` and `emailWrite` (`createSlot`, `generateDraft`, `updateDraft`,
`deleteDraft`, ...) exist already. Missing, in rough order:

1. **Brand email setup:** read and update `email_sender` and `legal_identity`,
   and check the brand's domain status in Postmark.
2. **Composer:** list a brand's homes, add a home group (layout, prices, notes),
   rewrite a block, render an email header card, render the preview (phone,
   desktop, sample guest), and list the preview's warnings.
3. **Fan-out:** draft one theme for many brands.
4. **Send:** send a test, then schedule (`platform_post.scheduled_at`), with
   approval. Waiting on the send-side branch.
5. **Reports:** per-brand email stats for the weekly and monthly report.

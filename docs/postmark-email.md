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

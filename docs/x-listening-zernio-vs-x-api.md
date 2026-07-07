# X listening: Zernio vs the official X API

_Last verified 2026-07-07 against `zernio.client.ts`, `twitter-monitor.service.ts`,
live Zernio inbox data, and X's pay-per-use pricing docs._

## TL;DR

They are **complements, not substitutes**. Zernio can only see surfaces where a
**Wander account is connected** (our DMs, comments on our posts); it has **no
public keyword search** — we confirmed with Zernio in May 2026 that no
brand-mention/listening endpoint exists. The official X API is the only way to
hear **strangers** tweeting "tired of OTA fees". For everything Zernio *can*
do, it is dramatically easier: one API key, no OAuth code, no per-request
billing. Use Zernio for owned-inbound (including X DMs — already live in
`/app/inbox`), and the X API for public keyword listening (already live in
`/app/listen` → X).

| | Zernio | Official X API |
|---|---|---|
| Public keyword/competitor search | ❌ not offered | ✅ `search/recent` (our cron) |
| Read X DMs | ✅ live in prod today | ⚠️ possible, needs user-context OAuth build |
| Comments on our posts/ads | ✅ live (IG/FB/LinkedIn; X untested) | ⚠️ possible via mentions timeline |
| Reply natively from code | ✅ inbox reply endpoints | ⚠️ `POST /2/tweets` — $0.015–0.20/post |
| Auth complexity | one static API key | dev account + app + bearer (+ OAuth2 flow for DMs) |
| Cost model | flat subscription (already paying) | pay-per-use credits, $0.005/post read |
| Failure mode | recency caps, X DMs lag weeks | credits depleted → 402, cron dies silently |

---

## Zernio

### What it is for us

Social publishing/analytics platform with the Wander accounts (Instagram,
Facebook, X/Twitter, LinkedIn, …) connected by the account owners inside
Zernio's own UI. Our client: [`src/server/clients/zernio.client.ts`](../src/server/clients/zernio.client.ts)
(~1,100 lines, verified live against their API).

### Key perspective

- **One env var: `ZERNIO_API_KEY`** (Doppler → Vercel). That's the entire
  credential story. `isZernioConfigured` gates every feature.
- Account-level OAuth (connecting @wander's X account to Zernio) happens once,
  in Zernio's UI, by whoever owns the account — **no OAuth code in our repo,
  no token refresh, no scopes to manage**.
- Billing is Zernio's subscription — API calls don't meter against us.

### Code perspective (what exists today)

- **DM inbox** — `listAllDmConversations()` fans out over
  `DM_PLATFORMS = ["instagram", "facebook", "twitter"]`, merges newest-first.
  **Yes, this reads X DMs in production today** — it powers `/app/inbox` → DMs.
  Caveat from the code: Zernio's unfiltered conversation list is recency-capped
  and X DM volume lags IG "by weeks", hence the per-platform fan-out.
- **Thread messages** — `getZernioConversationMessages(conversationId)` (needs
  `accountId`, 400 without).
- **Comments on owned posts** — `listZernioCommentedPosts()` / 
  `getZernioPostComments()` (powers `/app/inbox` → Comments), plus the Meta ads
  comment tree (`listAllZernioAdsWithComments`, → Ad comments).
- **Analytics/posts** — `getZernioAnalytics({source: "external"})` is the real
  list-published-posts endpoint (we don't compose in Zernio, so `/posts` is
  empty).
- Platform strings are normalized via `mapZernioPlatform` (`twitter → x`).

### Hard limits

- **No public search.** No keyword listening, no competitor monitoring, no
  strangers' tweets. Confirmed no such endpoint exists (May 2026). If we only
  had Zernio, the entire `/app/listen` X room would be impossible.
- We only see conversations/comments for **connected accounts** — and only
  the platforms Zernio's sync supports for that account.

---

## Official X API

### What it is for us

Public-firehose access. Our usage: `GET /2/tweets/search/recent` over the
watchlist terms ([`src/lib/x-watchlist.ts`](../src/lib/x-watchlist.ts)),
every 6h via `/api/cron/x`, 13h window, scored + persisted to `mention`,
engage-worthy hits → #radio-social-listening.
Code: [`src/server/services/twitter-monitor.service.ts`](../src/server/services/twitter-monitor.service.ts).

### Key perspective (the expensive part)

- Requires an **X developer account → project → app → bearer token**
  (`X_BEARER_TOKEN` in Doppler/Vercel).
- Our current token is **app-only** (the `AAAA…` kind): good for public reads
  (search, timelines), **cannot** touch DMs or post. There is no "whoami" for
  an app-only token — it identifies an app, not a user.
- ⚠️ **Ownership gotcha (live issue):** our token belongs to the CMO's dev
  account, not one we can see. When its credits run out (again, Jul 7), the
  cron 402s and we can't even inspect usage. Fix: put a listening-only app on
  a dev account the growth team can access, or add us to the CMO's team.
- **Billing:** pay-per-use credits. Reads = **$0.005 per post returned** (a
  48-tweet scan = $0.24; our cadence ≈ $1/day worst case). Writes with URLs =
  $0.20/post. Credits at console.x.com → Billing.

### Code perspective

- **Public search (built):** plain `fetch` with the bearer — ~50 lines. No SDK
  needed.
- **DMs (not built, and shouldn't be):** would require OAuth 2.0
  **user-context** — an authorization-code+PKCE flow for the @wander account
  with `dm.read` + `offline.access` scopes, encrypted refresh-token storage,
  rotation handling, and per-event read billing. That's a real subsystem
  (roughly: OAuth routes, token table, refresh job) to duplicate something
  **Zernio already gives us for free**.
- **Posting replies (not built):** same user-context OAuth prerequisite, plus
  $0.015–0.20 per post. Today's model — human posts the AI draft from the
  @wander account — costs nothing and keeps a human in the loop.

---

## Recommendation

1. **Keep both, each in its lane.** Zernio = owned inbound (`/app/inbox`,
   including X DMs). X API = public keyword listening (`/app/listen` → X).
   This is exactly the current architecture; no migration is warranted.
2. **Never build X DM reading on the official API** while Zernio covers it —
   the OAuth subsystem it demands buys us nothing we don't already have.
3. **Do fix X API token ownership** (own dev account or team access +
   auto-recharge with a cap). It's the only operationally fragile piece.
4. If Zernio's X DM lag ("weeks") ever becomes a real problem for sales-y DMs,
   that's the one scenario where official-API DM access would earn its keep —
   revisit this doc then.

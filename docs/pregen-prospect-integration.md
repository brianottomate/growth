# Pregen prospect integration — the growth side

**Audience:** whoever is working on `wandercom/wander` PR #20939 (`feature/wos-4563-prospect-pipeline-properties-claim`) and the WanderOS prospect pipeline.

**Status:** the growth side is **built and merged to `main`, dormant**. Revised after the backend response of 2026-07-31 — status vocabulary, expiry and `evalOverall` corrected, and the reconciliation section rewritten now that both sides have settled on best-effort delivery. Nothing calls WanderOS until `WANDER_API_URL` / `WANDER_API_KEY` are set, and the webhook returns 503 until `PREGEN_WEBHOOK_SECRET` is set. We are not blocked on you and you are not blocked on us — but there are three asks at the bottom, one of which is load-bearing.

Everything below was read off the PR branch, not assumed. Where we guessed wrong we have already corrected our side; those corrections are listed so you can sanity-check that we read your intent right.

---

## 1. What growth is

`growth` (Vercel `wanderdev/growth`) is the prospecting system-of-record. `leads.domain` in Neon holds ~218K deduped domains from BuiltWith + HubSpot + Instantly. Of those, ~900 are in the active pre-gen target cohorts, and **561 are currently workable** (the rest are suppressed — a rep is already in conversation, there's a live deal, or they said no).

The motion is: pick a prospect → build them a pre-generated WanderOS site → write a four-touch email sequence that points at it → a BDR sends it from HubSpot → they click through and **claim** the site.

WanderOS owns the middle step. Growth owns everything either side of it.

---

## 2. How growth calls you

One client: `src/server/clients/wander.client.ts`. Three calls, all `POST`.

### Create

```
POST {WANDER_API_URL}/internal/prospects
x-api-key: {WANDER_API_KEY}

{ businessName, sourceUrl, tone: "existing", email? }
→ WebsiteProspect { id, websiteId, status, previewUrl?, previewToken?, ... }
```

Called from a **Build preview** button on a prospect card in `/app/leads`, one domain at a time. `sourceUrl` is `https://{lead_domain.domain}` and `businessName` is `companyName ?? domain`.

We treat the response `status` as **accepted, not built**. We never block a user on it.

We refuse to call this at all for a domain flagged `exclude_from_outreach` — no point spending a build on a company nobody may contact.

### List (the refresh path — see §4)

```
POST /internal/prospects/list
{ skip: 0, take: 100, status? }
→ { prospects: WebsiteProspect[], total }
```

### Retry

```
POST /internal/prospects/retry
{ prospectId }
```

Not wired to a button yet. We will call it for `FAILED` builds once we've seen what failures actually look like.

### 3a. Status vocabulary

```
GENERATING → READY → CLAIMED
           ↘ FAILED
```

Growth's live set is **`GENERATING` `READY` `CLAIMED` `FAILED`**. Settled for our purposes: `READY`, `CLAIMED`, `FAILED`.

Two enum values are deliberately unhandled:

- **`PENDING`** — the schema default, but `create.ts` writes `GENERATING` directly, so no prospect is ever observably `PENDING`.
- **`EXPIRED`** — never written. Preview expiry was removed from the PR entirely, on the reasoning that a link dying mid-conversation costs more than a stale one. Dead enum value.

We store the status string verbatim rather than remapping, so adding a state is safe — we simply won't treat it as terminal. **If you add a state that *is* terminal, tell us**, because the failure mode is a build sitting in our UI as permanently in-flight.

Consequences of expiry being gone, on our side:
- `expiresInDays` is not sent, `expiresAt` is not stored, and `lead_domain.pregen_preview_expires_at` has been removed (it was added for expiry and never populated).
- Our copy policy forbids claiming the preview will come down. That rule was previously "until expiry is real"; it is now **permanent**, which is simpler. The generator was caught inventing *"before it comes down"* — that stays a violation forever.
- `evalOverall` removed from our client, webhook schema and build table.

### Corrections we made after reading the branch

We had guessed a REST-ish shape and were wrong on all three. Flagging in case it tells you something about how the routes read from outside:

| | we assumed | actually |
| --- | --- | --- |
| list | `GET /internal/prospects` → `{ items }` | `POST …/list`, body `{skip,take,status?}` → `{ prospects, total }` |
| retry | `POST …/{id}/retry` | `POST …/retry`, body `{ prospectId }` |
| status | lowercase, guessed values | see §3a — six enum values, four observable |

`take` defaults to **20**, not "everything", so we always pass it explicitly.

No complaint about the design — POST-with-body is fine and consistent. Just noting that nothing about `/internal/prospects` hints that `list` and `retry` are sub-paths rather than REST verbs, so an OpenAPI dump or a one-paragraph README in that folder would have saved us the round trip.

---

## 3. How you call growth

```
POST {PROSPECT_WEBHOOK_URL}          # https://growth-red.vercel.app/api/webhooks/pregen
x-pregen-secret: {PROSPECT_WEBHOOK_SECRET}

{ event: "prospect.updated", prospectId, websiteId, businessName,
  sourceUrl, status, previewUrl?, errorMessage?, occurredAt }
```

This is exactly your `ProspectWebhookPayload` — we parse it with a zod schema mirroring it field for field, so if you add a field we ignore it and if you rename one we 400 loudly rather than silently dropping events.

**Responses you'll get:**

| code | meaning | what you should do |
| --- | --- | --- |
| `200 {matched:true}` | applied | nothing |
| `200 {matched:false}` | valid event, prospect not in our lead universe | nothing — deliberately not a 404, it's not an error |
| `200 {stale:true}` | out-of-order event, ignored | nothing |
| `400` | payload didn't parse | **contract drift — this is a bug on one of our sides** |
| `401` | bad or missing `x-pregen-secret` | check the shared secret |
| `503` | growth hasn't been configured yet | expected until we set the env |

**How we apply it:**

- Correlate on `prospectId` first. Falls back to `sourceUrl` → bare host → `lead_domain.domain` for the first event on a prospect we didn't create ourselves. (`https://www.foo.com/x` → `foo.com`; a real subdomain like `sunkasa.holidayfuture.com` stays distinct, because it's a separate lead.)
- Compare `occurredAt` against the last event we applied, so a late `GENERATING` can't overwrite a newer `READY`.
- Write a `leads.pregen_build` row (one per build — retries and rebuilds are separate rows, keyed unique on `prospectId`).
- Promote `previewUrl` onto `lead_domain.pregen_site_url`, which is the field everything downstream already reads: the copy generator grounds on it, the reachability probe checks it, the review card links it, publishing requires it. **That single field is the whole integration surface for the rest of growth** — nothing else needs to know your API exists.

---

## 4. Reconciliation — killed on both sides

Settled, and we agree on the reasoning: a reconcile loop is a second source of truth that quietly compensates for webhook bugs instead of surfacing them. The silent `CLAIMED` gap is the proof — a sweep would have papered over it, and it would have rotted for months while looking healthy.

So: **no polling reconcile in growth, no retry-with-backoff on your sender.** Delivery is best-effort by agreement, not by oversight.

What we hold up on our end:

- **Idempotent on `prospectId` + `occurredAt`.** Duplicates are free, and a late duplicate carrying older state is ignored rather than applied. Retry freely if you ever change your mind.
- **`/leads` is re-fetchable.** `leads.refreshPregenSite` re-reads one prospect from `POST /internal/prospects/list` and reconciles it, so a stale row is one click from correct. Human-triggered, not scheduled.
- **We answer 200 on anything we understood** — including events for prospects outside our lead universe — so a slow write never costs the single delivery attempt.

**The one thing we'd ask you to watch:** if dropped events turn out to be common rather than theoretical, that is a signal about the transport, and we'd both rather hear it than absorb it. A 5s timeout against a Vercel lambda that may be cold, in front of a Neon instance that scale-to-zeroes, is the plausible source. We are not asking for retries; we are asking that a rising `[ProspectWebhook] Non-OK` / delivery-failed rate is treated as a bug rather than noise.

## 5. `CLAIMED` is the number this programme gets judged on

Something we nearly missed: `CLAIMED` is in your status enum alongside `READY`/`FAILED`/`EXPIRED`, and it's easy to read as just another terminal state. It isn't. **A prospect claiming their pre-generated site is the conversion this entire motion exists to produce.** Everything before it — ranking, enrichment, copy generation, review, the BDR's send — is cost.

Growth now stores `claimed_at` separately from `settled_at` for exactly this reason, so "how many pregen sites got claimed" is a query and not an archaeology project.

Two requests:

**Confirmed and fixed:** claiming was silent — `claim.ts` had zero calls to `sendProspectWebhook`, so the conversion never reached growth at all. Now wired and pushed. Verified on the branch: `claim.ts` fires with `status: 'CLAIMED'`.

Still open: if you can add **`convertedOrgId`** to that event we'll take it. It lets us join a claimed prospect to the resulting org and close the loop from cold domain to paying customer, which is the only version of this funnel anyone will actually ask about.

---

## 6. Open questions

1. **API key scope.** The route is `authenticate: 'api-key-or-wander-os'` and then separately `canUser({ organizationId: wanderOrganizationId, resource: 'all', action: 'manage' })`. So a key that authenticates fine will still 403 without org-manage. Who issues that key, and is a service key with `manage` on the Wander org actually available to us?
2. **Preview hosting.** `previewUrl` is documented as *"Absent when no public preview host is configured."* This is the thing that has blocked the whole motion for weeks — we currently have 33 preview URLs spread across six ad-hoc hosts and almost none resolve. **Is a public preview host configured in staging and production, and what's the URL shape?** If `previewUrl` comes back absent, none of this integration does anything useful.
3. ~~**Expiry.**~~ Resolved — removed entirely, see §3a.
4. **Status vocabulary stability.** See §3a. Adding a state is safe; adding a *terminal* state is not, so tell us.
5. **Rate/volume.** Is there a sane ceiling on builds? Our workable cohort is 561 domains and we'd likely ramp in batches of ~20, but we'd rather know your limit than discover it.

---

## 7. Where the code is

| what | path |
| --- | --- |
| API client | `src/server/clients/wander.client.ts` |
| Webhook receiver | `src/app/api/webhooks/pregen/route.ts` |
| Build lifecycle table | `pregenBuildTable` in `src/server/db/leads-schema.ts` |
| Request / refresh actions | `leads.requestPregenSite`, `leads.refreshPregenSite` in `src/server/api/routers/leads.router.ts` |
| Operator surface | `/app/leads` — review-card density, "Build preview" button |

Env: `WANDER_API_URL`, `WANDER_API_KEY`, `PREGEN_WEBHOOK_SECRET` (all optional in `src/env.ts`).

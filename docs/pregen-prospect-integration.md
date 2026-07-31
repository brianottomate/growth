# Pregen prospect integration — the growth side

**Audience:** whoever is working on `wandercom/wander` PR #20939 (`feature/wos-4563-prospect-pipeline-properties-claim`) and the WanderOS prospect pipeline.

**Status:** the growth side is **built and merged to `main`, dormant**. Nothing calls WanderOS until `WANDER_API_URL` / `WANDER_API_KEY` are set, and the webhook returns 503 until `PREGEN_WEBHOOK_SECRET` is set. We are not blocked on you and you are not blocked on us — but there are three asks at the bottom, one of which is load-bearing.

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

{ businessName, sourceUrl, tone: "existing", email?, expiresInDays? }
→ WebsiteProspect { id, websiteId, status, previewUrl?, expiresAt?, ... }
```

Called from a **Build preview** button on a prospect card in `/app/leads`, one domain at a time. `sourceUrl` is `https://{lead_domain.domain}` and `businessName` is `companyName ?? domain`.

We treat the response `status` as **accepted, not built**. We never block a user on it.

We refuse to call this at all for a domain flagged `exclude_from_outreach` — no point spending a build on a company nobody may contact.

### List (used only by the manual refresh, below)

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

### Corrections we made after reading the branch

We had guessed a REST-ish shape and were wrong on all three. Flagging in case it tells you something about how the routes read from outside:

| | we assumed | actually |
| --- | --- | --- |
| list | `GET /internal/prospects` → `{ items }` | `POST …/list`, body `{skip,take,status?}` → `{ prospects, total }` |
| retry | `POST …/{id}/retry` | `POST …/retry`, body `{ prospectId }` |
| status | lowercase, guessed values | `PENDING` `READY` `CLAIMED` `FAILED` `EXPIRED` |

No complaint about the design — POST-with-body is fine and consistent. Just noting that nothing about `/internal/prospects` hints that `list` and `retry` are sub-paths rather than REST verbs, so an OpenAPI dump or a one-paragraph README in that folder would have saved us the round trip.

---

## 3. How you call growth

```
POST {PROSPECT_WEBHOOK_URL}          # https://growth-red.vercel.app/api/webhooks/pregen
x-pregen-secret: {PROSPECT_WEBHOOK_SECRET}

{ event: "prospect.updated", prospectId, websiteId, businessName,
  sourceUrl, status, previewUrl?, evalOverall?, errorMessage?, occurredAt }
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
- Compare `occurredAt` against the last event we applied, so a late `PENDING` can't overwrite a newer `READY`.
- Write a `leads.pregen_build` row (one per build — retries and rebuilds are separate rows, keyed unique on `prospectId`).
- Promote `previewUrl` onto `lead_domain.pregen_site_url`, which is the field everything downstream already reads: the copy generator grounds on it, the reachability probe checks it, the review card links it, publishing requires it. **That single field is the whole integration surface for the rest of growth** — nothing else needs to know your API exists.

---

## 4. Reconciliation — we're not doing it, and that's a decision

Your `notify-prospect-webhook.ts` says:

> *reconcile-on-read remains the delivery backstop for missed events*

**Growth is not implementing that backstop.** No polling cron, no sweep, no periodic diff. This was an explicit call, not an oversight, and it's worth being blunt about why:

- Growth is on Neon's free tier — 100 CPU-hrs/month — and cost is driven by *distinct cron wake windows*, not job count. A reconcile sweep taking prod down on 2026-07-27 is not hypothetical; that's exactly what happened when two crons collapsed the union to every 10 minutes.
- More importantly: a reconcile loop is a second source of truth that hides webhook bugs. If delivery is broken we would rather it be visibly broken than quietly papered over by a sweep, because the papered-over version is the one that rots for six months.

**What that means for you.** Right now delivery is fire-and-forget: 5s timeout, non-OK logged at `warn` and dropped, no retry. That's a sensible default *when the receiver reconciles*. Since we don't, a single dropped POST means a prospect builds successfully and growth never learns the preview URL — the lead sits with no preview forever and nobody notices.

So the ask is: **make the webhook at-least-once.** In rough order of preference:

1. **Retry with backoff on non-2xx and on timeout.** Three or four attempts over a few minutes covers essentially every transient case (cold Vercel lambda, Neon waking from scale-to-zero — that last one is real and can exceed 5s).
2. **A small outbox** — persist the event, mark delivered on 2xx, drain on a schedule. More work, fully robust.
3. **Raise the timeout to ~10s.** Cheapest single change and probably removes most of the failures on its own.

We are idempotent on `prospectId` + `occurredAt`, so **retry as aggressively as you like** — duplicates are free, and a redelivered older event is explicitly ignored rather than applied.

Our only recovery path is a manual **Refresh from WanderOS** button on the prospect (`leads.refreshPregenSite`), which calls `/internal/prospects/list` and reconciles that one prospect. A human pressing a button when they notice something stuck. That is deliberately not a loop, and it does not scale past "someone noticed" — which is exactly why point 1 above matters.

---

## 5. `CLAIMED` is the number this programme gets judged on

Something we nearly missed: `CLAIMED` is in your status enum alongside `READY`/`FAILED`/`EXPIRED`, and it's easy to read as just another terminal state. It isn't. **A prospect claiming their pre-generated site is the conversion this entire motion exists to produce.** Everything before it — ranking, enrichment, copy generation, review, the BDR's send — is cost.

Growth now stores `claimed_at` separately from `settled_at` for exactly this reason, so "how many pregen sites got claimed" is a query and not an archaeology project.

Two requests:

- **Please make sure a `CLAIMED` transition fires the webhook**, not just build-lifecycle transitions. If claiming happens through `management/website/claim-prospect.ts` on a different path, it may not be wired to `sendProspectWebhook`. This is the single most valuable event you can send us.
- If you have or can add `convertedOrgId` on that event, we'll take it — it lets us join a claimed prospect to the resulting org and close the loop from cold domain to customer.

---

## 6. Open questions

1. **API key scope.** The route is `authenticate: 'api-key-or-wander-os'` and then separately `canUser({ organizationId: wanderOrganizationId, resource: 'all', action: 'manage' })`. So a key that authenticates fine will still 403 without org-manage. Who issues that key, and is a service key with `manage` on the Wander org actually available to us?
2. **Preview hosting.** `previewUrl` is documented as *"Absent when no public preview host is configured."* This is the thing that has blocked the whole motion for weeks — we currently have 33 preview URLs spread across six ad-hoc hosts and almost none resolve. **Is a public preview host configured in staging and production, and what's the URL shape?** If `previewUrl` comes back absent, none of this integration does anything useful.
3. **Expiry.** We store `expiresAt` and pass `expiresInDays` (currently omitted → no expiry). Is there a house default we should match? Our copy is currently forbidden from claiming the preview will expire, because until now that was invented; once expiry is real we'd like to relax that deliberately.
4. **Status vocabulary stability.** We store your status string verbatim rather than remapping it, so adding a state is safe for us — we just won't treat it as terminal. If you add one that *is* terminal, tell us.
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

# Outbound channel strategy — Instantly fleet vs. real low-volume mailboxes

> **Status: DISCUSSION / open decision (2026-06-16). Nothing changed in code or config as a result of this note** — it captures reasoning so a future agent (or human) picking up the outbound work has the context. The current live setup is still Instantly with burner inboxes.

## The question on the table

For Wander Sites cold outbound (pitching pre-gen direct-booking sites to vacation-rental / property-management operators), is **Instantly carrying its weight**, or would we be better off connecting **real employee mailboxes** (e.g. `kristian@wander.com`, `kyle@wander.com`) and sending **20–40/day — "a very motivated employee" volume**?

Kristian's instinct (and the conclusion of this discussion): for the current stage, real low-volume mailboxes probably win, and Instantly is solving a scale problem we don't yet have.

## Current setup (as of this note)

- Instantly with ~30 warmed burner inboxes (the "Emily Collins" persona across lookalike domains: `listonwander.com`, `trywanderos.com`, `getwanderos.com`, etc.), warmup score 100.
- One live test campaign + one real draft campaign ("Tier 1 Enterprise"), `stop_on_reply: true`. Replies land in the burner Google Workspace mailbox + Instantly Unibox — **not** routed to a real person or into the growth app (no reply webhook wired; only `test`/`test-write` Instantly routes exist).
- First real send is the **Pregen Top 20** list (~20 companies / 33 contacts). Qualified universe is ~1,774 pregen domains out of 58,889 total.
- See [[leads-backoffice]] and the lifecycle outbound spec (program `lp_fNGKtAvHTYvjaKx7`).

## What Instantly actually buys

1. **A fleet of warmed burner inboxes** — only matters at volume.
2. **Domain isolation** — burner domains absorb spam risk so the real domain is never touched.
3. **Sequencing + Unibox** — multi-step, stop-on-reply, consolidated replies.
4. **Scale headroom** — architecture for hundreds–thousands/day.

#1, #2, #4 are **volume-play machinery**. We're not running volume: small qualified universe, first send of 20, selling a bespoke website + relationship to an owner-operator. That's founder/BDR-led, high-touch sales — not spray.

## Why real mailboxes likely win *this* motion

- **Deliverability flips positive.** Burner domains start at zero reputation and read as sales personas even when "warmed." A real, aged, reputable mailbox sending 20–40/day with genuine human history is the best inbox-placement profile that exists.
- **Trust + reply quality.** "Kristian at Wander" beats `emily@trylistonwander.com`. Prospect can look you up; replies hit a real human who can have the actual conversation — no persona bait-and-switch.
- **Cost + ops collapse.** No subscription, no burner domains/inboxes to buy and warm, no Unibox to babysit.
- **Matches fulfillment.** The offer is "reply and I'll mock up a site" — inherently human and low-volume. Sending model should match fulfillment model.

## The one real landmine

**Do not cold-send from the literal root `wander.com`** — it shares reputation with booking confirmations and real business email; spam complaints there are expensive. Hedge: send from a **credible sibling domain or subdomain** with real-named human inboxes — e.g. `wandersites.com`, `getwander.com`, or `team.wander.com`. Keeps the credibility of a real person, isolates the mothership, drops the burner-fleet machinery. At 20–40/day to a semi-qualified list, complaint rates should be near zero, so this is a cheap hedge more than a hard requirement.

## Two reframes that matter

- **We may already own the better tool: Outreach.io** is integrated in this repo (`outreach.client.ts`, `outreach.router`, `api/outreach/webhooks`). Outreach is built for rep-mailbox sequencing + reply handling + CRM sync — i.e. exactly the low-volume real-identity motion. "Real mailboxes" may mean Outreach, not a new tool.
- **Identity-first, tool-second.** Instantly can also drive *real* mailboxes, so "keep Instantly" doesn't force the burner persona. The real decision is the sending **identity** (burner Emily vs. real Kristian/Kyle); the tool is downstream.

## Sunk cost is low

The lifecycle outbound spec is **provider-agnostic** — it's the intent layer (copy, sequence, Export-to-Claude). Whether "reality" is Instantly, Outreach, or a Gmail sequencer doesn't change the spec. Switching execution wastes ~an hour of Instantly plumbing + 33 test pushes, nothing more.

## Recommendation

For the first send and likely the whole pregen push: **real identity, credible (non-root) domain, 20–40/day, probably via Outreach since we already have it.** Keep Instantly warm in the background only if a high-volume future is genuinely expected. Revisit the burner fleet the day the motion becomes "this converts, now do 5,000/week" — that's when #1/#2/#4 earn their keep.

## The deciding question

**Is this outbound motion ever going to be high-volume, or is it permanently high-touch?**
- Permanently high-touch → drop Instantly, run from real inboxes.
- Genuinely expect to blast the full ~58k someday → keep Instantly warm, but still run the qualified tier from real inboxes.

## Update 2026-06-17 — sequences rewritten into an A/B/C test, driving to /os

Decisions taken (Kristian) and reflected in `scripts/seed-outbound-sequences.ts`:

- **Identity:** drop the "Emily" persona. Send as a **real person** — Kristian for now (pretend supply rep), switching to **James Caswell** (`james.caswell@wander.com`, Sr. AE) later. The seed has one `SENDER` const; change it and re-run. The old Emily program `lp_fNGKtAvHTYvjaKx7` is soft-deleted (retired).
- **Goal:** the sequences now drive to **`wander.com/os`** (form submit → HubSpot `portfolio_size` + deal + Slack + Make), not just replies. Objective is **7,500 lead units this month** (units = form submits × property count).
- **Three parallel variants** (separate `lifecycle_program`s, kind `outbound`), each Day 0/2/5:
  - **A — Reply-first (text only)** `lp_nDPeAKL4Y7RX2NCr` — no links, deliverability control.
  - **B — Self-serve (text + /os link)** `lp_jn4RejQL89PCUgBf` — one plain UTM'd /os link.
  - **C — Visual (text + link + image)** `lp_yu7FkCKMyjJNMdBx` — requested by leadership; running it to *measure* the cost of an image in a cold step. Image is the Hollyhock flagship screenshot, downscaled to 1000px JPEG (~160KB), hosted on the growth R2 bucket (`uploads/outbound/hollyhock-flagship/`).
- **Links:** our own UTMs on the full `wander.com/os` URL, Instantly **link-tracking OFF**. dub.co rejected for cold email (redirect through a non-Wander domain = deliverability tax; Amplitude + HubSpot already capture the UTM on landing).
- **Personalization:** Instantly's `{{firstName|fallback}}` pipe syntax is correct but unreliable on empty-string values, so we (a) clean lead data (firstName is sparse), (b) keep the fallback as a backstop, (c) never put a merge var in the step-1 subject (var-light subjects). This is why the old email #1 rendered "Hey ,".
- **Replies / Unibox:** `GET /api/v2/emails` (`email_type=received`, `preview_only=false`) returns full reply bodies — the path to route replies to a real person without touching Resend. `instantly.client.ts` doesn't wrap `/emails` yet; the reply webhook receives `reply_text` but discards it. "Burner Gmail" is unverified — check connected mailboxes via `GET /api/v2/accounts` (`listAccounts()`).

Test recipients (gmail +aliases, staged in `leads.*` as `outbound-test.wander`): `kristian.e.boe+seq{a,b,c}@gmail.com`.

### Update 2026-06-17b — campaigns built in Instantly (DRAFT), Unibox wired

- **Accounts check** (`scripts/instantly-accounts.ts`): **30 connected mailboxes, all the Emily persona** (Google Workspace across 10 burner domains), warming. **No real-person inbox is connected** — so switching to a real Kristian/James sender needs a *connected* mailbox (ops), not just code. The "burner Gmail" was real.
- **Campaigns created as DRAFT** (NOT launched) by `scripts/create-outbound-campaigns.ts` (idempotent; `--force` deletes + recreates):
  - A `73972024-b351-408d-adfc-0a6458006b9c` (text_only, no link)
  - B `81d9eab3-831a-4e40-ba7f-9396cac07587` (HTML, link, no image)
  - C `b818ad14-9c58-4db4-94a6-568d502b26dc` (HTML, link + image)
  - Sender `emily@listonwander.com` (self-test only); test aliases pushed as leads. **Launch in the Instantly UI to receive them.** B-vs-C now isolates exactly the image effect.
- **New `instantly.client` methods:** `createCampaign`, `deleteCampaign`, `listEmails`, `getEmail`, `getUnreadCount`, `replyToEmail`, `getCampaignReplies`. `scripts/instantly-replies.ts` reads the Unibox (full reply bodies) — the path to routing replies to a real person.
- **Instantly API gotchas (verified live):** timezone must be `America/Detroit` (not `America/New_York`); HTML bodies must be `<div>`-per-line or Instantly strips the text nodes; a `text_only` body containing a raw `https://…?query` URL gets emptied (use HTML for any linked variant); step `delay` = days to wait *after* that step (Day 0/2/5 ⇒ `[2,3,0]`); only `sequences[0]` is used; DELETE must send no `Content-Type` header.

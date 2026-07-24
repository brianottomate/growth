# HubSpot sales-email corpus

This is the private writing-reference pipeline for learning from one-to-one
emails that Wander reps have already sent through HubSpot. It has two distinct
views:

- the broad outbound corpus shows how the team writes across prospects;
- the company-aware corpus supplies the real correspondence for one company
  when generating that company's draft.

## Access

The HubSpot private app needs:

- `sales-email-read`
- `crm.objects.contacts.read`

The first scope is intentionally sensitive: it exposes one-to-one email
engagement content. Do not copy the access token, email bodies, or generated
corpus into source control, tickets, chat, or model prompts outside the approved
Growth environment.

## Build

```bash
bun --conditions=react-server scripts/build-hubspot-sales-email-corpus.ts
```

Useful bounded variant:

```bash
bun --conditions=react-server scripts/build-hubspot-sales-email-corpus.ts \
  --limit 2000 \
  --scan-limit 10000 \
  --days 365
```

The script reads recent `SENT` / `EMAIL` engagements, retains mail sent from
`@wander.com` to at least one outside recipient, and writes only to
`reports/private/hubspot-sales-email-corpus/`. That directory is covered by the
repo's existing `reports/` ignore rule.

## Privacy treatment

The retained JSONL omits raw HTML and raw headers. It also:

- removes quoted reply history and common legal footers;
- truncates deterministic rep signature blocks;
- replaces email addresses, phone numbers, and URLs with semantic tokens;
- hashes rep and recipient/thread identifiers.

Names, company references, prospect observations, and personalized subject/body
copy are deliberately preserved. The earlier role-token replacement removed
useful context and is no longer part of this pipeline. Direct contact details
remain unnecessary for drafting and are still omitted. Treat the result as
confidential local working data.

## Company-aware history

Build the correspondence view for one company:

```bash
bun --conditions=react-server scripts/build-hubspot-company-email-corpus.ts \
  --domain cascadiagetaways.com
```

This resolves the HubSpot company, reads its associated email activities, and
writes a private JSON file under
`reports/private/hubspot-company-email-corpus/`. It preserves:

- sender and prospect names written in the message;
- the company name and company-specific facts;
- subject, date, message direction, and body copy;
- the prospect's actual questions and replies.

It omits raw headers, direct email addresses, phone numbers, and URLs. The
unmodified activity remains in HubSpot.

Operator self-test traffic remains visible in the private company corpus but is
flagged and excluded from model generation. This prevents the pilot emails and
Kristian's planted test contact from being mistaken for real prospect history.

## Intended use

Use the corpus to measure and distill how Wander reps actually write:

- typical subject and body length;
- paragraphing and question frequency;
- common CTA shapes;
- how reps introduce Wander and WanderOS;
- how much personalization feels normal;
- words, claims, or constructions the team consistently avoids.

Do not retrieve a prospect's history and send generated copy in one automatic
step. Company history grounds a draft; a rep still reviews the actual facts,
claim support, formatting, and final enrollment.

## First snapshot: July 24, 2026

The current bounded build retained 1,000 outbound emails from 14 Wander senders
after scanning 1,006 recent engagements. This is descriptive evidence of how
the team currently writes, not a performance ranking and not a mandate to copy
every habit.

Observed shape:

- median subject length: 30 characters;
- median body length: 194 words across 11 text blocks;
- 83.9% ended with at least one question;
- 80.1% contained a link.

Useful recurring moves:

- simple subjects such as `[First name] + WanderOS`;
- identify WanderOS as direct-booking infrastructure for property managers;
- connect WanderOS credibility to what the team learned building Wander.com;
- show one concrete example, then ask for a quick look or conversation.

Patterns not to inherit:

- calling the product "essentially free";
- unsupported or stale AI-search percentages and conversion multipliers;
- stacking several links, proof points, benefits, and pricing details in one
  first-touch email;
- claiming a guaranteed conversion or search outcome;
- treating the corpus's roughly 200-word median as a target for cold outreach.

For the personalized pregen motion, the tighter target is 60 to 110 words,
three to five short paragraphs, one company-specific observation, one supported
WanderOS proof point, one preview link, and one low-friction question.

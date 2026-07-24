# HubSpot sales-email corpus

This is the private writing-reference pipeline for learning from one-to-one
emails that Wander reps have already sent through HubSpot.

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
- replaces known sender and recipient names with role tokens;
- hashes rep and recipient/thread identifiers.

This is deterministic redaction, not a claim of full anonymization. Company
names or other facts that a rep typed into the body can remain. Treat the
result as confidential local working data.

## Intended use

Use the corpus to measure and distill how Wander reps actually write:

- typical subject and body length;
- paragraphing and question frequency;
- common CTA shapes;
- how reps introduce Wander and WanderOS;
- how much personalization feels normal;
- words, claims, or constructions the team consistently avoids.

Do not retrieve a prospect's history and send generated copy in one automatic
step. Corpus-derived guidance informs a draft; a rep still reviews the actual
company facts, claim support, formatting, and final enrollment.

## First snapshot: July 24, 2026

The initial bounded build retained 1,000 outbound emails from 14 Wander senders
after scanning 1,005 recent engagements. This is descriptive evidence of how
the team currently writes, not a performance ranking and not a mandate to copy
every habit.

Observed shape:

- median subject length: 29 characters;
- median body length: 195 words across 11 text blocks;
- 84.8% ended with at least one question;
- 81.0% contained a link.

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

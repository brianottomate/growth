# HubSpot sequence blueprint: pregen personalized outreach

## Seat access

Kristian's Sales Hub Enterprise seat was activated and sequence creation access
was verified in HubSpot on July 24, 2026. HubSpot's public API can read and
enroll sequences but cannot create or edit them, so initial sequence setup still
happens in HubSpot's UI.

## Current four-touch drafts

Both sequences are private, owned by Kristian Boe, and had zero enrollments at
creation on July 24, 2026.

| Motion         | HubSpot sequence                                                                | Business-day cadence | Target                                                                    |
| -------------- | ------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| Re-engagement  | [308080466](https://app.hubspot.com/sequences/22480390/sequence/308080466/edit) | 1, 5, 9, 15          | Recycled lists `3808` / `3809`                                            |
| Fresh outreach | [308081169](https://app.hubspot.com/sequences/22480390/sequence/308081169/edit) | 1, 4, 8, 13          | Untouched lists `3811` / `3812`, then net-new Mexico and Europe prospects |

Keep both dormant until a reviewed contact has the required contract properties
populated. Do not make enrollment part of copy approval.

### Shared template rules

- The model owns the substantive email. HubSpot owns only the greeting,
  paragraph boundaries, preview-link slot, and default signature.
- Be direct without being abrupt. Establish why this person is receiving this
  message before offering an analysis or pitching the preview.
- Touch 1 uses a model-written opening, the reviewed preview URL on its own
  paragraph, and a model-written closing. Touch 2 uses a model-written opening
  and closing.
- Use HubSpot's built-in first-name token with `there` as its fallback.
- Identify WanderOS with a supported number, not with lineage. "From the team
  behind Wander.com" is meaningless to a property manager who has never heard
  of Wander.com, so touch 1 must carry one of: $75M+ in bookings, 70,000+
  nights, 10,000+ properties, 1,000+ property managers, 11+ PMS integrations.
  Touch 3 spends a different one. The policy gate enforces this.
- Use the sender's HubSpot default signature; do not hard-code a signature in
  the template.
- Keep every custom fallback visibly unsendable:
  `[... NOT REVIEWED — DO NOT SEND]`.
- Register: one competent person writing to another they have not met. Short
  sentences, contractions, plain words. The policy gate blocks "I wanted to",
  "I'm reaching out", "happy to", "feel free to", "don't hesitate", "circle
  back", "touch base", "let me know if", "would you be open to", "would it be
  worth", and any named meeting length in touch 1. If a sentence could appear
  unchanged in a deck, it is wrong for this email.
- Touches 2 through 4 reply in-thread. This keeps the preview and the short
  WanderOS explanation visible as context and avoids manufacturing four
  separate inbox threads.

The live touch 1 token layout is:

```text
Hi {{ contact.firstname }},

{{ contact.growth_pregen_touch_1_body }}

{{ contact.growth_pregen_preview_url }}

{{ contact.growth_pregen_touch_1_observation }}
```

Touch 2 uses `growth_pregen_touch_2_body` and
`growth_pregen_touch_2_fit` in the same two-paragraph pattern. This split is
only a rendering contract; it does not reduce the model to filling a generic
sentence fragment.

### Personalization evidence

Generation combines the current lead record, current public website, and the
company's associated HubSpot email activities. The company-history input keeps
the names, company facts, subjects, direction, and message copy that make a
reply specific. Raw headers and direct contact details are omitted.

Generation is company-level and happens before the operator selects the
enrolled contact. The prose may say that a named person asked a question, but it
must not address that person or assume the eventual recipient wrote the
message. The HubSpot greeting owns recipient-level naming.

For re-engagement, an inbound reply takes priority over unanswered outbound
messages. Prior outbound copy is conversation context, not proof that a product
claim is true. Generation and enrollment remain separate actions.

A PMS in the lead record is product-fit context, not proof of how the preview
was populated. Do not say the preview pulls live from a named PMS unless
authoritative operator context explicitly confirms that connection.

### The tension the copy runs on

Every prospect on these lists already operates a direct-booking site. That is
the whole opening. They have already decided they would rather not hand every
reservation, fee, and guest relationship to Airbnb and Vrbo, which means the
email is not arguing with a skeptic; it is talking to someone who already
agrees and is living with how hard direct booking is to win.

Use that by **labeling the decision they already made** and letting the cost of
OTAs sit underneath the sentence, unstated. "Looks like you'd rather guests
book with you than through a listing on someone else's site" is the move.
"Are you tired of paying OTA commissions?" is a cold-call script and is
blocked. Never quote a commission percentage, and never tell a prospect their
current site is underperforming — that is a diagnosis we cannot support.

The close is a question the recipient can safely answer "no" to. A question
that pressures toward "yes" gets ignored; one that leaves them in control gets
replies. Shapes vary per company by design.

### Four-touch generation brief

- **Fresh touch 1:** four beats in roughly four sentences, never announced as
  structure — (1) a specific observation only someone who actually looked would
  write, (2) the direct-booking decision labeled back to them, (3) WanderOS
  identified with one supported number, (4) why that led the team to build this
  preview.
- **Re-engagement touch 1:** begin with the actual prior relationship, question,
  reply, or discussion when one exists. Briefly re-introduce WanderOS so the
  recipient does not need to remember the previous thread. If the history has
  no meaningful exchange, use a current observation while acknowledging the
  prior contact without saying only "following up."
- **Touch 2:** explain the WanderOS fit for the prospect's current PMS, inventory,
  brand, or direct-booking setup without inventing a weakness in the current
  website.
- **Touch 3:** use one supported proof point that touch 1 did not already
  spend, instead of cramming every number into touch 1.
- **Touch 4:** close the loop with a low-friction routing question.

Fresh outreach must introduce WanderOS because there is no prior relationship
to rely on. Re-engagement should feel like the logical next message in the
actual correspondence, not a generic recycled-lead template — compress the
introduction hard, but keep the number.
Neither motion should open with a compressed consultant-style verdict such as
"you already have unusually concrete reasons." The opening should sound like a
person explaining why they wrote.

Touches 3 and 4 are still static in the pilot sequences. The generator already
produces reviewed drafts for all four touches; moving the final two templates to
model-owned properties is the next contract extension after the first two
touches are proven.

The older [personalized two-touch pilot](https://app.hubspot.com/sequences/22480390/sequence/308080004/edit)
remains intact for the original test enrollment. It is not the default for
either cohort.

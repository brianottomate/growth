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
- Touch 1 uses a model-written opening, the reviewed preview URL on its own
  paragraph, and a model-written closing. Touch 2 uses a model-written opening
  and closing.
- Use HubSpot's built-in first-name token with `there` as its fallback.
- Include WanderOS as the direct-booking platform for property managers from
  the team behind Wander.com.
- Use the sender's HubSpot default signature; do not hard-code a signature in
  the template.
- Keep every custom fallback visibly unsendable:
  `[... NOT REVIEWED — DO NOT SEND]`.
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

For re-engagement, an inbound reply takes priority over unanswered outbound
messages. Prior outbound copy is conversation context, not proof that a product
claim is true. Generation and enrollment remain separate actions.

### Four-touch generation brief

- **Touch 1:** introduce the private working preview using one concrete,
  company-specific reason for the message. In re-engagement, use a real prior
  question when one exists. Never say the sender built the site personally.
- **Touch 2:** explain the WanderOS fit for the prospect's current PMS, inventory,
  brand, or direct-booking setup without inventing a weakness in the current
  website.
- **Touch 3:** use one supported Wander or WanderOS proof point instead of
  cramming every number into touch 1.
- **Touch 4:** close the loop with a low-friction routing question.

Fresh outreach must introduce WanderOS and Wander.com because there is no prior
relationship to rely on. Re-engagement should feel like the logical next
message in the actual correspondence, not a generic recycled-lead template.

Touches 3 and 4 are still static in the pilot sequences. The generator already
produces reviewed drafts for all four touches; moving the final two templates to
model-owned properties is the next contract extension after the first two
touches are proven.

The older [personalized two-touch pilot](https://app.hubspot.com/sequences/22480390/sequence/308080004/edit)
remains intact for the original test enrollment. It is not the default for
either cohort.

# Pre-Gen Sites outreach handoff

**Status:** working internal pilot, not ready for broad prospect enrollment  
**Last verified:** July 24, 2026  
**Owners:** Growth Engineering + Sales

## Executive summary

The pre-generated-sites motion now has a working path from HubSpot target lists
to personalized four-touch sequences:

1. HubSpot defines the recycled and untouched target cohorts.
2. Growth mirrors those four list memberships into the database and `/app/leads`.
3. A reviewed pregen preview URL and email personalization are written to the
   HubSpot contact.
4. An operator explicitly enrolls the contact in the correct HubSpot sequence.

The two cohort sequences are live as private HubSpot drafts. A self-test
successfully delivered from Kristian's connected Wander inbox to his personal
test contact with the HubSpot signature, personalization, and four-touch
cadence.

Do not bulk-enroll prospects yet. The current previews are served from the local
development environment, and the claim CTA still routes to `localhost:7775`.

## HubSpot target cohorts

| Motion         | Company list                                                               | Contact list                                                               | Eligibility                                                 | Sequence       |
| -------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------- |
| Re-engagement  | [3808](https://app.hubspot.com/contacts/22480390/objectLists/3808/filters) | [3809](https://app.hubspot.com/contacts/22480390/objectLists/3809/filters) | No activity in 90+ days, 17+ units, qualified PMS, US/CA/MX | Re-engagement  |
| Fresh outreach | [3811](https://app.hubspot.com/contacts/22480390/objectLists/3811/filters) | [3812](https://app.hubspot.com/contacts/22480390/objectLists/3812/filters) | No activity ever, 10–12 units, qualified PMS, US/CA/MX      | Fresh outreach |

The contact lists contain contacts with valid email addresses associated with
the companies in the corresponding company list.

Future net-new Mexico and Europe prospects should use the fresh-outreach
sequence unless HubSpot history proves that Wander has contacted them before.

## HubSpot sequences

Both sequences are private, owned by Kristian Boe, and require explicit
enrollment.

| Motion         | Sequence                                                                        | Cadence                   |
| -------------- | ------------------------------------------------------------------------------- | ------------------------- |
| Re-engagement  | [308080466](https://app.hubspot.com/sequences/22480390/sequence/308080466/edit) | Business days 1, 5, 9, 15 |
| Fresh outreach | [308081169](https://app.hubspot.com/sequences/22480390/sequence/308081169/edit) | Business days 1, 4, 8, 13 |

The original [two-touch pilot](https://app.hubspot.com/sequences/22480390/sequence/308080004/edit)
is preserved for historical reference and should not be used for new cohort
enrollments.

### Sequence posture

- **Re-engagement:** use the company's actual HubSpot correspondence when it
  provides a legitimate reason to return. Never invent a prior conversation.
- **Fresh outreach:** introduce WanderOS as the direct-booking platform for
  property managers from the team behind Wander.com.
- Touches 2 through 4 remain in the original email thread.
- The model owns the substantive copy. The HubSpot template owns the greeting,
  blank paragraphs, preview-link slot, and default signature.
- The sender's HubSpot default signature is included automatically.
- No template says "I built"; the approved framing is "our team put together."

## Personalization contract

HubSpot contact properties:

- `growth_pregen_preview_url`
- `growth_pregen_touch_1_subject`
- `growth_pregen_touch_1_body`
- `growth_pregen_touch_2_subject`
- `growth_pregen_touch_2_body`
- `growth_pregen_touch_1_observation`
- `growth_pregen_touch_2_fit`
- `growth_pregen_touch_3_subject`

The first two live template steps actively use:

- touch 1 reviewed subject, opening, preview URL, and closing;
- touch 2 reviewed subject, opening, and closing;
- HubSpot's built-in first name token, with `there` as fallback.

Every custom token must have a visibly unsendable fallback:

```text
[... NOT REVIEWED — DO NOT SEND]
```

The prose is split into a small number of large model-owned properties only
because HubSpot did not preserve reliable paragraph formatting when one
multiline property contained the full email.

## Company-aware correspondence

The generation path reads email activities associated with the HubSpot company.
It preserves names, company facts, subject lines, direction, and message copy so
an actual prior question can shape the re-engagement draft. It strips raw
headers and direct contact details, not the personalization.

The broad sales corpus remains useful for tone and structure, while the
company-aware history is the source for prospect-specific context.

## Current email formatting

Touch 1 now renders the model-written opening, signed preview URL, and
model-written closing as three separate paragraphs:

```text
<reviewed company-specific opening>

<reviewed preview URL>

<reviewed company-specific closing and CTA>
```

This materially improves mobile readability. A short branded redirect would be
better than exposing the full signed URL, but it is not implemented yet.

## Preview source and verified example

The local preview index is:

[pregen-sites.localcan.dev](https://pregen-sites.localcan.dev/)

For each prospect, prefer **Native+**: the generated site plus the real property
grid, live photos and prices, and video hero.

The latest Cascadia self-test uses the Native+ preview with website ID
`690953458160762936`. The signed URL is stored in the HubSpot contact property,
not in this document.

Verified on July 24:

- private-preview banner loads;
- Cascadia branding and original-site link load;
- hero and search controls load;
- real property cards, photos, prices, bedrooms, and baths load;
- the preview itself no longer returns the stale 400/500 response.

## Verified self-test

- Sender: Kristian's connected `kristian@wander.com` inbox.
- Recipient: Kristian's personal HubSpot test contact.
- Sequence: Re-engagement 4-Touch.
- Subject: `A concrete answer to Ryan's WanderOS question`.
- The first two touches are grounded in Cascadia's actual HubSpot correspondence,
  current website, Guesty lead record, and working Native+ preview.
- HubSpot default signature rendered correctly.
- The original test automatically finished when the recipient replied.
- The stale Fresh Outreach test enrollment was explicitly ended before creating
  the Re-engagement test enrollment.
- Re-engagement enrollment `3749631088` was accepted by HubSpot on July 24, 2026. HubSpot initially displayed it as scheduled.

## Growth implementation

Relevant commands:

```bash
# Ensure HubSpot contact properties exist
bun --conditions=react-server scripts/ensure-hubspot-pregen-properties.ts

# Apply and refresh the mirrored HubSpot list memberships
bun --conditions=react-server scripts/apply-hubspot-pregen-list-schema.ts
bun --conditions=react-server scripts/import-hubspot-pregen-lists.ts --dry
bun --conditions=react-server scripts/import-hubspot-pregen-lists.ts

# Generate a private company-aware review draft (no HubSpot write or enrollment)
bun --conditions=react-server scripts/generate-hubspot-pregen-personalization.ts \
  --domain example.com \
  --contact-email test@example.com \
  --motion reengagement \
  --preview-url 'https://...'

# Apply an explicitly reviewed private JSON draft (still no enrollment)
bun --conditions=react-server scripts/apply-reviewed-hubspot-pregen-draft.ts \
  --file reports/private/reviewed-draft.json \
  --apply
```

The import is idempotent and only reconciles the four explicit list IDs above.
It does not edit the HubSpot list definitions or enroll contacts.

Supporting documentation:

- [Target cohort and webhook operations](./pregen-hubspot-target-cohorts.md)
- [Sequence copy and token blueprint](./pregen-hubspot-sequence-blueprint.md)

## Operator runbook

For each prospect:

1. Confirm the contact belongs to the intended HubSpot cohort.
2. Confirm the prospect's current website and company identity.
3. Select a currently available preview from the pregen index, preferring
   Native+.
4. Open the signed preview and verify the homepage and at least one property
   route.
5. Populate the reviewed HubSpot properties.
6. Review the rendered email on desktop and mobile.
7. Confirm the sender has a connected personal inbox and current signature.
8. Enroll the contact explicitly in the matching sequence.
9. Confirm HubSpot shows the enrollment as scheduled or in progress.

Do not enroll from the list-import, preview-generation, or copy-review jobs.

## Production blockers

Resolve these before sending to real prospects:

1. **Externally reachable preview hosting.** The current `localcan.dev` surfaces
   are local development infrastructure and are not an acceptable prospect
   destination.
2. **Production claim URL.** The current preview's `Claim this site` CTA points
   to `http://localhost:7775/auth`. It must use the production claim flow.
3. **Stable preview selection.** The latest pregen index must be the source of
   truth; old signed preview URLs can return 400/500 after regeneration.
4. **Short branded links.** Replace raw signed URLs in email with a stable,
   human-readable redirect while preserving per-preview authorization.
5. **Send Review integration.** Generate and review the subject, preview URL,
   and fit paragraph before enrollment. Enrollment must remain a separate
   action.
6. **Rep rollout.** Start with a small reviewed subset. Recycled leads are
   rep-owned and should not be bulk-enrolled without owner approval.

## Recommended next milestone

Make one preview externally shareable end-to-end:

1. publish the Cascadia Native+ preview on the real preview host;
2. point its claim CTA at the production claim flow;
3. create a short branded preview URL;
4. run the personal inbox test again from HubSpot;
5. have Danny and one sales rep approve the rendered four-touch sequence;
6. enroll a small reviewed batch, not the entire recycled universe.

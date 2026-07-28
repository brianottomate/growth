# Pre-Gen Sites HubSpot target cohorts

HubSpot owns the dynamic list definitions. Growth mirrors their current
memberships so the same target universe is available to jobs, SQL, and the
`/app/leads` operator UI.

| Cohort    | Companies | Contacts | Mirrored companies | Mirrored contacts | Enrollable companies |
| --------- | --------- | -------- | ------------------ | ----------------- | -------------------- |
| Recycled  | `3808`    | `3809`   | 404                | 1,436             | 390 (96.5%)          |
| Untouched | `3811`    | `3812`   | 499                | 452               | 367 (73.5%)          |

Membership counts measured July 28, 2026 against the live lists and the
production database. HubSpot's own list sizes were 410/1,400 (recycled) and
506/454 (untouched); the small deltas are companies whose HubSpot record carries
no resolvable domain. "Enrollable" means the company has at least one
associated, non-deleted contact with both an email and a `hubspot_contact_id`.

⚠️ **Mirrored contacts are a snapshot, not a sync.** No contact webhook exists —
all 142,176 stored HubSpot events are company (`0-2`) or association events.
Re-run the import before any send batch. Full detail and the fix in
[pregen-sites-outreach-handoff.md](./pregen-sites-outreach-handoff.md) →
*Measured state, July 28, 2026*.

The contact lists contain valid-email contacts associated with companies in the
corresponding company list. Growth preserves company and contact memberships
separately and links both to `leads.domain` where a HubSpot company ID is known.

## Refresh

```bash
bun --conditions=react-server scripts/apply-hubspot-pregen-list-schema.ts
bun --conditions=react-server scripts/import-hubspot-pregen-lists.ts --dry
bun --conditions=react-server scripts/import-hubspot-pregen-lists.ts
```

The import is idempotent. It only reconciles the four explicit list IDs above;
it does not modify the HubSpot list definitions or any other Growth cohort.

## Sequence routing

Keep cohort selection explicit. List membership does not enroll anybody.

| Growth cohort                                  | HubSpot sequence                                                 | Posture                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Recycled companies/contacts (`3808` / `3809`)  | `PILOT - Pre-Gen Sites - Re-engagement 4-Touch - DO NOT ENROLL`  | Acknowledge prior Wander outreach and give the rep a concrete preview to re-open the conversation. |
| Untouched companies/contacts (`3811` / `3812`) | `PILOT - Pre-Gen Sites - Fresh Outreach 4-Touch - DO NOT ENROLL` | Introduce WanderOS and its relationship to Wander.com from scratch.                                |
| Future net-new Mexico and Europe prospects     | Fresh-outreach sequence                                          | Treat as fresh unless HubSpot history proves otherwise.                                            |

Both four-touch sequences are private, dormant drafts. The older personalized
two-touch pilot remains intact for the original test enrollment and must not be
used as the default cohort sequence.

## Personalization contract

The current HubSpot contact-property surface is:

- `growth_pregen_preview_url`
- `growth_pregen_touch_1_subject`
- `growth_pregen_touch_1_body`
- `growth_pregen_touch_2_subject`
- `growth_pregen_touch_2_body`
- `growth_pregen_touch_1_observation`
- `growth_pregen_touch_2_fit`
- `growth_pregen_touch_3_subject`

The four-touch drafts actively use the reviewed touch 1 subject, preview URL,
and touch 2 fit paragraph. Touches 2 through 4 reply in the original thread, so
HubSpot carries forward the touch 1 subject. The touch 3 subject is reserved if
testing later shows that a new-thread reset performs better. The two full-body
properties remain for the legacy two-touch pilot; new templates own their
static copy and blank-paragraph spacing instead of injecting an entire email
through one multiline token.

Create or verify them idempotently with:

```bash
bun --conditions=react-server scripts/ensure-hubspot-pregen-properties.ts
```

No import, property setup, or Send Review action enrolls a contact. Enrollment
must remain a separate, explicit provider action after human copy review.

## HubSpot webhook backlog

The safe backlog processor materializes post-export company creations, projects
the latest subscribed company properties, reconciles deal additions and
removals against current HubSpot state, and preserves unmodeled associations as
classified raw events:

```bash
bun --conditions=react-server scripts/process-hubspot-webhook-backlog.ts
bun --conditions=react-server scripts/process-hubspot-webhook-backlog.ts --apply
```

It never deletes webhook rows. `processed_at` means either projected or
explicitly classified with a `process_note`; the raw payload remains available
for later contact-mirror or hierarchy work.

Production also runs `/api/cron/hubspot` every ten minutes. The receiver normally
projects events immediately after acknowledging them; the cron replays any
remaining raw payloads through the same signed receiver so a transient
projection failure heals automatically.

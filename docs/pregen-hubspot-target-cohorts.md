# Pre-Gen Sites HubSpot target cohorts

HubSpot owns the dynamic list definitions. Growth mirrors their current
memberships so the same target universe is available to jobs, SQL, and the
`/app/leads` operator UI.

| Cohort    | Companies | Contacts |
| --------- | --------- | -------- |
| Recycled  | `3808`    | `3809`   |
| Untouched | `3811`    | `3812`   |

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

## Two-touch personalization contract

The dormant HubSpot pilot sequence uses five contact properties:

- `growth_pregen_preview_url`
- `growth_pregen_touch_1_subject`
- `growth_pregen_touch_1_body`
- `growth_pregen_touch_2_subject`
- `growth_pregen_touch_2_body`

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

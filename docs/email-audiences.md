# Live email audiences

Growth keeps reusable, brand-scoped email audiences separate from sales leads
and advertising personas. Scheduled Performance broadcasts reference the saved
audience directly and resolve its current membership when delivery starts. The
current model has no compile action, recipient snapshot table, snapshot expiry
or persisted dispatch cursor.

## Audience sources

An audience uses one of two source families:

- **Database list:** contacts live in Growth's `email.list` and
  `email.list_member` tables. CSV import normalizes and deduplicates addresses,
  rejects invalid values and clears bot-like first names. Operators can append
  consent-confirmed contacts later with `emailWrite.addAudienceMembers`; those
  rows become part of subsequent reads of the same audience.
- **Warehouse rules:** typed rules select Customer.io candidates or one linked
  WanderOS website's bookers/signups. Growth builds the SQL and brand scope;
  assistants cannot supply arbitrary SQL. Known machine and prefetched clicks
  do not qualify as human engagement.

Every definition records the operator's marketing-permission assertion.
Bookings or list possession do not infer consent. A selected `sampleSize`
limits current membership deterministically; counts are informational and can
change after review.

## Operator and MCP workflow

1. Choose a brand and audience rules, then preview current count, blockers,
   source freshness and SQL. The authenticated UI can show a ten-row sample;
   MCP preview deliberately omits recipient PII from retained tool results.
2. Save the audience with `emailWrite.saveAudience`. For a database list, add
   reviewed contacts with `emailWrite.addAudienceMembers` as needed.
3. Approve an existing email's creative and call
   `emailWrite.prepareBroadcast` with its `platformPostId` and `audienceId`.
   Preparation freezes creative, sender, links and the live audience reference;
   it does not freeze recipient membership.
4. `emailRead.previewBroadcasts` shows the exact prepared emails, sender,
   current counts and local send times. Current count is excluded from the
   reviewed hash because membership is intentionally live.
5. After the controlled seed and cutover checks, scheduling requires the exact
   reviewed hash and literal `customerIoStopped: true`.

The current catalog exposes `emailRead.audiences`,
`emailRead.previewAudience`, `emailWrite.saveAudience`,
`emailWrite.addAudienceMembers` and `emailWrite.prepareBroadcast`. There is no
`emailWrite.compileAudience` or `emailRead.audienceSnapshot` action.

## Delivery semantics

At dispatch, Growth rereads the saved audience and verifies that it still
belongs to the email's brand and still has confirmed marketing permission.
Database-list rows are read in internal database pages; warehouse membership is
queried from its saved rules. Those reads build one eligible recipient set.
They are not provider send waves.

Growth then applies the source and stream protections that are available:

- warehouse audiences reread the linked WanderOS website's current email
  opt-outs;
- Growth-managed Postmark streams query brand opt-outs and create signed
  one-click unsubscribe links;
- Postmark-managed broadcast streams own unsubscribe substitution and provider
  suppressions, including hard bounces and spam complaints.

Recipient ledger rows support webhook identity, booking attribution and send
receipts. They do not implement cross-wave `already_sent` exclusion or a
partial-send resume cursor. Preparing another send can include the same address
again if that address belongs to its live audience.

After all recipients and the complete request are materialized, the dispatcher
makes one authoritative database claim immediately before one Postmark Bulk
request for the entire broadcast. Internal list pagination never becomes
multiple provider submissions. The serialized request must remain below
Postmark's 50 MB limit; Growth fails before the HTTP request rather than
splitting it automatically.

If pause wins before the final claim, no provider request is submitted. Once
the claim changes the send to `sending`, pause cannot report success. Postmark
owns pacing and processing after acceptance. Failed or uncertain provider
handoffs require operator investigation and explicit reapproval; recovery never
replays them automatically.

## Storage and access

- `email.audience` stores the brand-scoped definition and consent assertion.
- `email.list` and `email.list_member` store imported database-list membership.
- `message_send.snapshot.audience.audienceId` stores the prepared live
  reference; it does not contain recipient rows.
- `message_send_recipient` stores per-send attribution and provider outcomes.
- The email platform post metadata stores the accepted single-Bulk handoff
  receipt.

Migration `0044_remove_email_audience_snapshots` rewrites old Postmark
references to the owning audience and drops `email_audience_snapshot`.
Migration `0046_simplify_email_delivery` removes the unused send cursor and
converts receipts to the single-request shape. Current list counts are derived
from member rows.

All audience reads enforce workspace ownership through the selected brand.
Saving or previewing an audience never approves creative, schedules delivery or
sends email. See [Live database audiences for scheduled email](email-live-audiences.md)
and [Scheduled brand broadcasts](scheduled-broadcasts.md) for the execution and
release contracts.

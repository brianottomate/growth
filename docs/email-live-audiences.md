# Live database audiences for scheduled email

The value is planning existing email platform posts, approving their creative,
and scheduling delivery against a growing database audience through the normal
Growth UI and MCP. Series remain editorial grouping. Postmark Bulk handles
provider processing and managed unsubscribes.

## Audience behavior

A prepared send references `email_audience.id` directly. Database audiences read
current `email.list_member` rows; existing warehouse audiences query their saved
rules when read. There is no compile step, saved-selection table, readiness state,
or audience expiry. Saving an audience makes it available in the send picker.
The CSV download also reads the audience directly.

Counts come from current database rows and are informational; warehouse counts
are available through Preview audience. Membership changes do not invalidate a
schedule. Existing explicitly selected sample limits remain respected. Reads
are live, not an atomic frozen membership guarantee across concurrent edits.

The existing Add contacts UI and `emailWrite.addAudienceMembers` append to the
same list identity. This is one way to maintain the table, not a required upload
step before each send. It does not sync external signup systems.

## Delivery and receipts

Each broadcast reads its audience and submits one Postmark Bulk request. Database
reads and attribution writes still use pages, but these are not separate sends.
The serialized UTF-8 request must be at most 50,000,000 bytes; a larger payload
raises an error before the HTTP request. There is no automatic splitting.
Postmark owns pacing and processing after acceptance.

The existing send record is claimed atomically from approved to sending.
Broadcast queue retries, stale-send reclaiming and persisted send cursors are
removed, including the unused cursor column.
A failed or uncertain attempt requires operator inspection before an explicit
reapproval; it is never automatically resubmitted. This accepts manual recovery
rather than building partial-send resume machinery.

The existing `message_send` belongs to the email `platform_post`, not its parent
content post. The platform post's existing JSONB metadata has a typed
`emailDelivery` handoff receipt: provider, send reference, audience reference,
and the accepted bulk request ID, submission time and count. It preserves
unrelated metadata and adds no lifecycle status or recipient snapshot. The
receipt uses one `bulkRequest` object. The send record
owns approval/execution; recipient records remain because webhooks and booking
attribution use their identity and send time. They no longer select a subset
for retry. Postmark status APIs report processing counts; they do not return the
original full recipient list.

Postmark-managed streams own suppressions. Custom streams retain Growth's own
unsubscribe links/filtering; warehouse sends retain their website preferences.
No provider configuration is changed. Link checking is an optional editor preview
action; website failures do not block dispatch. Scheduling requires the operator
to acknowledge `customerIoStopped: true`; the acknowledgement is saved on the
schedule and rechecked by the exact queued job before provider handoff.

## Schema and verification

Migration `0044_remove_email_audience_snapshots` rewrites old Postmark send and
handoff receipt references to the owning audience, then drops
`email_audience_snapshot`. It leaves approved creative, schedule fields and
Customer.io history intact. The earlier discarded two-column migration never
ran in production. Migration `0046_simplify_email_delivery` removes the unused
send cursor, audience revision and stored list count, converts single-request
receipts. New schedules persist the required cutover acknowledgement inside the
typed schedule JSON without adding a database column.
List counts are derived from membership rows, including in the seed-list picker.

Verified on a production-derived Neon experiment with synthetic old send/receipt
references: migration, table removal, creative/schedule preservation, direct list
reads and cross-workspace denial. Repository checks, offline tests and AI contracts
cover the application change. No production writes or provider sends were made.

# Scheduled brand broadcasts

Email posts and their optional editorial series remain the content model.
Calendar broadcasts use existing `message_send` prepared creative/audience
snapshots and recipient ledgers. `snapshot.schedule` owns delivery timing,
IANA timezone, active/paused state and runtime identity; platform-post dates
remain the calendar projection. No new series, sequence or approval entity is
created. Existing snapshots without a schedule retain on-demand behavior.

The queue transport and signature verification are shared with Sequences.
Unlike recipient journeys, broadcasts use absolute dates and prepared audience
snapshots. Database-list audiences page directly through persisted SQL rows;
warehouse-backed snapshots remain compatible but are not required. Jobs re-read saved authorization; old dates, pauses, another runtime
and revoked membership cannot authorize a send. The ordinary on-demand path
refuses a schedule-controlled send. A started/failed/uncertain send is never
automatically retried by broadcast recovery. Existing Postmark delivery keeps
booking tags, fresh opt-outs, suppression handling and recipient deduplication.

## Native app and MCP workflow

1. Use existing content review to approve the chosen email posts.
2. Select a consent-confirmed database-list audience and prepare its snapshot. `emailWrite.compileAudience` accepts
   `retentionDays` up to 90 for an eight-week schedule; default remains 30.
   This sets the real warehouse table expiration too, not merely metadata.
3. `emailWrite.prepareBroadcast` freezes each existing email and audience.
4. `emailRead.previewBroadcasts` takes one brand, timezone and prepared-send IDs
   with explicit UTC/offset instants. Inspect all creative, sender, recipient
   counts, dates/local times and the returned reviewedHash.
5. After stopping conflicting Customer.io broadcasts, explicitly approve
   `emailWrite.scheduleBroadcasts` with that hash and `customerIoStopped: true`.
   A false queued result means authorization was saved but queue recovery is needed.
6. `emailRead.broadcastStatus`, `emailWrite.pauseBroadcast` and
   `emailWrite.recoverBroadcast` inspect, pause and recover unstarted work.
   Recovery of an overdue approved send can dispatch immediately and is gated
   by normal user approval. Failed/provider-uncertain work requires investigation.

Performance Email opens on the content calendar. Existing email posts carry
calendar dates independently of review and delivery state: drafts show as
tentative, creative can be approved without queuing delivery, and Scheduled is
reserved for an accepted queue operation. Click a date to plan an existing email
or create a slot; click an email to change its tentative date or review its
creative. Dragging uses the same content-post update action as the Content tab
and preserves the local time and review status. Sent and queued emails are not
draggable. Queued time changes go through a separate delivery reschedule review.
The Schedule delivery action lives in the normal workspace toolbar and is
available for approved emails, with audience selection and exact-send review in
a focused dialog. The individual email send card shows delivery timing and pause/recovery.
Schedule approval and recovery run over MCP without a confirmation round trip,
as every MCP action does. No alternate credential route.

## Winter Park Escapes read-only verification

The connected Growth MCP returned the brand, 219 homes, its existing Grand County
Dispatch series and newsletter drafts. The Ski Season edition is planned for
October 23 at 10 a.m. Mountain time and is still draft, with no prepared sends.
The saved audience uses the existing database-list model. Scheduling imposes no
100-recipient sample limit and does not require BigQuery or a new CSV dataset;
the selected audience definition determines membership.
No production content, approval, queue or provider state was changed.

## Runtime and launch checks

Uses the existing sequence queue/runtime configuration, including its enable
flag, signing keys, base URL and runtime ID. Local env currently lacks the
lifecycle enable/base/runtime configuration; local sends remain unavailable.
Before activation verify the deployed queue endpoint, intended runtime,
Customer.io cutover, approved cohort and consent, final creative and seed-inbox
results. These checks were not performed by the local implementation. The cutover
confirmation is an operator assertion, not automatic Customer.io reconciliation.
Listing-claim/source validation remains the existing content review responsibility.

## Merge verification (2026-10-19)

Reconciled with the rich email previews, series reader, client review links and
PDF export on dev. Calendar-first planning and the existing preview actions
coexist. `bun run check`, 222 offline tests, and AI contracts (350 catalog tools,
343 MCP tools) passed. Authenticated Winter Park verification confirmed the
calendar and independent tentative date, creative review and delivery states;
no draft, approval, audience or queue was changed during verification.
The scheduling code can ship without activating any guest send. Runtime setup
and controlled inbox verification remain prerequisites for actual activation.

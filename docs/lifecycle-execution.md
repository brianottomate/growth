# Performance email sequences

Performance → Email now has **Blasts**, **Sequences**, **Audiences**, and **Settings**
at `/app/performance/clients/<brandSlug>/newsletters`.
The existing `/app/lifecycle` pages and their planning APIs remain unchanged.

## Content and sequence ownership

An email remains a Growth content post, newsletter platform post, and creative
email document. Blasts keep their existing audience, review, and send flow.
A new `email_sequence` owns an ordered set of `email_sequence_step` records;
each step references an existing email document through its platform post.
Sequence delivery never marks that reusable content asset published.

The sequence editor provides a start event, email cards, waits in minutes/hours/days,
reordering, an optional exit rule, and cumulative timeline offsets. Draft steps can
remain empty while planning. Create an email from a step or select an existing
brand email, then open the existing email editor in another tab. The same templates,
structured property digests, personalization fallbacks, branding and rendering are
used for blasts and sequences. Product-update templates are currently blocked at
sequence review because their separate renderer lacks the marketing footer.

Sequence drafts can be saved with no QStash or Postmark keys. Saving uses an
expected version to reject stale concurrent edits. Email references are checked
against the sequence brand and current workspace; strategy programs are not
execution owners. Active recipients retain their immutable reviewed version.

## Operator workflow

1. Open **Sequences → New sequence**. Name it, set an exact entry event such as
   `account.created`, and add email steps and waits. Optionally set a recipient
   attribute exit rule. Save the draft.
2. Write each email through **Create email / Edit email**. Save in the existing
   email editor. Return to the sequence and open **Review & delivery**.
3. **Review execution version** shows rendered previews, timing, sender, brand
   Postmark destination, footer and blockers. **Save reviewed version** freezes
   the rendered templates, copy and timing. Delivery remains paused. Review does
   not require provider keys, but does require complete emails and a valid sender.
4. Once configured, **Activate reviewed version** explicitly permits enrollment
   and sending. The activation dialog identifies the prepared version. Editing a
   draft or email never changes an active version; pause, review, and save a new
   version to use changes for future enrollments.
5. Enroll a consenting recipient manually or connect product events using the
   sequence-specific integration token. Inspect the latest 50 enrollments and
   delivery receipts. Shared audiences remain available for blasts; there is no
   bulk audience-to-sequence enrollment in this first version.
6. Pause to hold future sends, cancel individual enrollments, or archive the
   sequence to cancel all unfinished runs. A provider request already in flight
   may finish. Recovery republishes queued work in batches of 50.

## Timing and delivery

- The timeline displays cumulative planned offsets from entry. The first wait is
  measured from entry; each later wait is measured from the previous confirmed
  Postmark acceptance. A delayed email therefore shifts subsequent sends instead
  of collapsing the wait. Pausing retains due times: the next overdue email may
  send immediately on resume, followed by its normal waits.
- Sequences are linear. There is no branching, SMS, wait-until-condition, or bulk
  audience enrollment. The sequence-wide exit rule compares the latest recipient
  profile before each email. Missing values do not match comparisons; `exists`
  explicitly accepts true or false.
- Email personalization follows the existing editor: `{{first_name|there}}` and
  `{{last_home}}`. Recipient attributes use these snake_case names. Unsupported
  template syntax blocks review; arbitrary Liquid or JavaScript never executes.
- Each reviewed version freezes the exact rendered email templates, sender,
  destination and footer. Recipient fields are filled just before sending.
  Activation and delivery check the brand's current Postmark target and sender.
- A recipient can have only one unfinished enrollment per sequence. A new event
  can re-enroll them after completion or cancellation. Consent withdrawals, hard
  bounces and complaints are monotonic. Brands linked to a WanderOS website also
  check the same website opt-outs as blasts before each new provider attempt;
  lookup failures leave work queued and do not send.
- Postmark acceptance is `sent`; delivery/bounce/complaint receipts are separate.
  An uncertain provider outcome goes to `needs_review` and is never automatically
  resent. Cancellation is available; there is no operator reset of uncertain sends.

## Configuration

All new configuration is optional; `LIFECYCLE_ENABLED` defaults to `false`.
The editor exposes missing settings without exposing their values.

| Variable | Purpose |
| --- | --- |
| `LIFECYCLE_ENABLED=true` | Explicit environment-level delivery switch |
| `LIFECYCLE_BASE_URL` | Stable public HTTPS origin for signed jobs |
| `LIFECYCLE_RUNTIME_ID` | Unique identifier for this delivery environment |
| `QSTASH_TOKEN` | Publish scheduled jobs |
| `QSTASH_URL` | Optional QStash regional API URL |
| `QSTASH_CURRENT_SIGNING_KEY` | Verify QStash callbacks |
| `QSTASH_NEXT_SIGNING_KEY` | Verify callbacks during key rotation |
| `POSTMARK_ACCOUNT_TOKEN` | Resolve the configured brand’s Postmark server token |
| `POSTMARK_WEBHOOK_SECRET` | Existing shared Postmark webhook authentication |

Use the existing `/api/webhooks/postmark` endpoint for Delivery, Bounce,
SpamComplaint and SubscriptionChange events. Configure `x-growth-postmark-secret`
with `POSTMARK_WEBHOOK_SECRET` and `x-growth-postmark-server` with that server’s ID,
following Growth’s existing webhook convention. Lifecycle metadata is
`lifecycle_delivery_id`. The handler checks the server, stream, email and delivery
identity before associating a receipt. The existing event ledger remains intact.

The brand’s email delivery settings supply its Postmark server and broadcast
message stream; no global fallback stream or other brand’s server is used.
Configure the brand’s from-address and postal address before activation.
Versions can be saved without provider credentials, but a version prepared before
brand configuration must be prepared again to freeze its destination and footer.

Configure `LIFECYCLE_ENABLED` only on the intended delivery deployment. Growth's
preview and production deployments currently share a database; previews must
not inherit the enabled production runtime. Each environment needs a different
runtime ID. Jobs and enrollments carry it, and a sequence binds to it on activation.
QStash callbacks must reach the configured URL without an interactive login or
Vercel deployment-protection challenge. Changing the public origin requires draining or rescheduling outstanding jobs.

The additive `0006_email_sequences.sql` migration creates sequences, ordered email references, execution settings,
immutable revisions, recipients, enrollments, and deliveries. Commit its SQL,
snapshot, and journal together. Apply via the normal migration/release process.
**Growth's build applies migrations to the shared database.** Local source checks
and migration generation do not. The feature requires this migration before use.

## Product integration

Create an integration token in the sequence’s delivery controls. Only its SHA-256
hash is stored. The raw token is returned once to the authenticated operator;
replacing it immediately revokes the old token. Tokens authorize just one
sequence, with profile updates scoped to that sequence’s brand.

`POST /api/email-sequences/<sequenceId>`

```http
Authorization: Bearer <sequence integration token>
Content-Type: application/json
```

Enrollment:

```json
{
  "action": "enroll",
  "data": {
    "eventId": "account-created:example-user:1",
    "eventName": "account.created",
    "email": "recipient@example.com",
    "attributes": { "first_name": "Sam", "hasBooking": false },
    "consent": {
      "granted": true,
      "source": "Signup lifecycle opt-in",
      "recordedAt": "2026-10-06T12:00:00Z"
    }
  }
}
```

Use a stable unique source event ID and retry with exactly the same input. Reusing
an ID with different input returns 409. The event name must match the reviewed
version. A durable enrollment with an unsuccessful initial QStash publish returns
503, `Retry-After: 60`, and `queued: false`; retry the identical event.
Operators can also use **Recover queued work**. A 503 does not mean the enrollment
was rolled back: keep the same event ID and input when retrying.
Duplicate requests never overwrite newer recipient state. Existing recipients
keep their live profile; use the profile action to update it.

Profile update (full attribute replacement):

```json
{
  "action": "profile",
  "data": {
    "email": "recipient@example.com",
    "attributes": { "first_name": "Sam", "hasBooking": true },
    "observedAt": "2026-10-06T13:00:00Z",
    "unsubscribe": false
  }
}
```

Only existing native lifecycle recipients are updated. Older/equal observations
cannot overwrite newer profiles. `unsubscribe: true` is monotonic and applies even
if its observation arrives late. Profile updates work while a journey is paused.
No existing Customer.io/Outreach events are automatically redirected here: the
product must explicitly integrate the new endpoint.

## Reliability and operations

QStash receives delivery IDs and runtime IDs, never email addresses or message
bodies. The worker verifies signatures including the configured destination URL,
loads authoritative state, and claims a two-minute lease in a short transaction.
Provider requests happen after that transaction commits. Duplicate jobs check the
ledger and cannot deliberately restart a completed delivery.

QStash retries failed delivery requests five times. Each accepted step schedules
its successor; an early wakeup schedules the remainder of a long wait. There is
no lifecycle cron or recurring scan. Long waits use hops of seven days minus one
minute, within QStash's free-tier delay limit. A months-long sequence does not
hold a Vercel function open; only each callback uses compute.

The signed `/api/jobs/lifecycle/failure` callback records exhausted retries in the
Growth delivery ledger. It verifies the callback destination, source URL, message
identity and runtime, and never starts a send. Failed initial publishes remain
visible in the ledger and return a retryable response to the event source. A
process crash before publishing cannot recover itself: the event source must retry
the same event, or an operator must recover it. QStash failures also remain in its
dead-letter queue, including when the failure callback cannot reach Growth.

**Recover queued work** is the explicit fallback for interrupted scheduling and
paused enrollments, in batches of 50. Use it after activation to resume paused work;
continue through every batch. It never resets uncertain Postmark attempts. Preview
and production use separate runtime IDs and credentials. Monitor the QStash DLQ
and Growth receipts rather than relying on a periodic database scan.

A send claim is committed before the Postmark request. If the response is lost,
the request fails, or the process dies after claiming, the enrollment stops for
review. Inspect Postmark using the recorded MessageID or `lifecycle_delivery_id`
metadata before manual action. Cancellation is available; this version deliberately
provides no automatic reset of uncertain attempts. This chooses possible missed
mail over duplicate mail when provider acceptance cannot be established.

Email footers use Postmark’s `{{{ pm:unsubscribe }}}` marker so unsubscribe links
and stream suppression follow the brand’s existing marketing email behavior.
SubscriptionChange withdrawals, inactive/hard bounces, and spam complaints also
suppress native lifecycle records. Soft bounces update receipts without permanently
suppressing the recipient. Profile withdrawal and the token-based local preference
endpoint remain native-lifecycle-only controls; they do not update other providers.

The canonical `emailRead` and `emailWrite` actions support sequence planning,
content linking, previews, frozen revisions, status, pausing, cancellation and
archiving in chat and MCP. Activation, single-recipient enrollment and queue
recovery can send real emails: they require the in-app approval card and are
excluded from MCP/invoke-growth until those transports have an approval handshake.
Ingest-token rotation remains form-only so secrets never enter chat receipts.
Recent enrollment status omits recipient email addresses; it is not a lifetime
aggregate. Shape opens a brand-scoped discussion and never itself authorizes sending.
The editor reconciles saved agent changes while preserving unsaved local drafts.
Existing lifecycle strategy pages are unchanged.

## Provider boundaries

QStash scheduling is isolated in `providers.ts`; Postmark sending uses Growth’s
existing `postmarkServerToken` and `sendPostmarkBatch` client functions. The durable
journey and delivery records remain owned by Growth. An alternative scheduler can
replace QStash without changing the planning editor. A different mail provider
requires an explicit retry/receipt contract rather than assuming equivalent
idempotency behavior.

References: [QStash publishing](https://upstash.com/docs/qstash/api-reference/messages/publish-a-message),
[QStash failure callbacks](https://upstash.com/docs/qstash/features/callbacks),
[QStash plan limits](https://upstash.com/pricing/qstash),
[Postmark sending](https://postmarkapp.com/developer/api/email-api),
[Postmark delivery events](https://postmarkapp.com/developer/webhooks/delivery-webhook).

## Test sends and Flex

**Send test to me** sends one saved email to the signed-in operator, from the email editor or its sequence step. It uses the existing brand Postmark server and stream.

**Flex test sequence** creates (or opens) a brand's editable three-email preset: the first email immediately, then one-minute waits. Creation sends nothing.

Under **Review & delivery → Test sequence**, review the destination and timeline, then confirm the test. Choose one-minute waits or the saved sequence's waits. Enter one or several comma-separated email addresses. Leaving the field blank uses the signed-in user's email. The review lists the recipients before sending. Each test freezes the current saved content in a separate revision, without activating live execution or changing its reviewed version. A retry uses the same request ID; scheduling failures can be recovered through the existing queue controls.

Test runs use the same QStash scheduler, worker and delivery ledger. Their immutable revision marks the run as a test and binds it to each chosen recipient. These operator-requested direct tests skip WanderOS's guest marketing opt-out lookup; recipient suppression and Postmark stream suppression still apply. Live enrollments require the WanderOS lookup. Subjects use `[Test]`, Postmark uses `growth-test` and `test=true` metadata, and recent enrollments show **Test**. Tests create no blast send or published content record. Cancel remaining emails from the test run's receipt list. Postmark unsubscribe links retain their real brand-stream suppression behavior.

Tests require the configured delivery runtime, even while the live sequence is paused. They do not exercise the Amplitude entry integration.

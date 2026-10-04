# Warehouse email audiences

Growth selects email recipients in BigQuery rather than importing Customer.io's
million-profile population into Neon or mixing guests with sales leads.
The authenticated builder is `/app/newsletters/audiences`, linked from Newsletters.
The same builder is embedded in each Performance brand’s Email tab, fixed to
that brand. Its header link jumps to the audience section, and “All email
audiences” returns to the cross-brand page.

## Operator workflow

1. Choose a brand and rules. Wander can select recent email clickers or all
   Customer.io subscriber candidates. Property managers can select bookers,
   website signups, or both from their linked WanderOS website.
2. Preview a count, ten recipients with selection reasons, the SQL, and source
   freshness. Preview does not save or send. Known machine/prefetched clicks are
   excluded; opens do not establish human engagement. An unknown machine flag
   does not prove that a click was human.
3. Save a named audience. Edits require the current revision, preventing a stale
   tab or assistant from overwriting another operator's changes. Confirming
   marketing permission is an explicit operator assertion, not a consent inference
   from a booking. Candidates can be inspected without that confirmation.
4. Compile the saved revision. BigQuery runs asynchronously into a private named
   table. The UI polls its status and can resume the latest snapshot after reload.
   Changing rules does not change an existing snapshot.
5. Download a streamed candidate CSV or let an internal worker read bounded pages
   from the same table. CSV downloads use 10,000 rows per page; worker reads default
   to 500. Neither path loads the whole population into application memory.

“Discuss in chat” hands over the brand and form rules. The canonical assistant/MCP
catalog exposes `emailRead.audiences`, `emailRead.previewAudience`,
`emailRead.audienceSnapshot`, `emailWrite.saveAudience`, and
`emailWrite.compileAudience`. SQL and brand scope are owned by code; chat adjusts
validated parameters rather than running arbitrary SQL. Customer.io API read tools
are not added.

## Selection and sending are separate

Customer.io people/attributes are historical exports. The query chooses each
profile's latest version, normalizes and deduplicates email addresses, and excludes
exported deleted, suppressed, and unsubscribed profiles. Any blocked profile for
the same email excludes that email. Wander's warehouse workspace is `142511` and
is available only to the Wander brand.

WanderOS bookings and signups are scoped to the linked website. Bookings must
match both the website ID and organization, be confirmed, not cancelled, and use
the generated-website channel. This avoids mixing brands that share an organization.
`SaasGuestEmailOptOut` is not available in the audited datastream, so these lists
are explicitly candidates with a live-opt-out blocker.

A compiled snapshot **is not permission to send**. The future dispatcher must:

- Verify the brand's readiness, marketing permission and active flow/campaign.
- Recheck current source opt-outs and the correct brand/stream's Postmark
  suppressions before every send batch, plus frequency caps and idempotency.
- Call `filterEmailAudienceBatch` with a current eligibility checker. Only explicit
  `true` passes; missing decisions or checker failures cannot allow delivery.
- Track per-recipient outcomes and resume its cursor/ledger without double sends.

That helper is a required integration boundary, not a live suppression connector.
This PR does not implement sending, opt-out syncing, campaign scheduling or a
provider dispatcher. It does not upload contact lists to Postmark. CSV exports
are labeled candidates and are not meant to be uploaded as an approved send list.

## Storage, cost and access

Neon stores only audience definitions/revisions and compilation receipts in
`email_audience` and `email_audience_snapshot`. Recipient rows stay in
`wander-9fc9c.growth_email_audiences`, in `us-central1`, alongside the source datasets.
The dataset is created on first compilation and tables expire after 30 days;
Neon retains receipt metadata. Source exports can lag current consent state.
The preview watermark is the oldest of the participating CIO tables' maximum
`_load_date` values, not proof that every upstream change has arrived. WanderOS
has no reliable watermark exposed here.

Each query has a 100 GB billing ceiling. External CIO tables report a zero
`LOWER_BOUND` on dry runs, so the UI displays an unavailable estimate rather than
pretending the query is free. The live 90-day-click preview consumed a query that
needed more than the initial 50 GB ceiling; keep an eye on warehouse scan cost as
rules expand. Counts and ten-row sampling run in the warehouse.

The warehouse service account needs query/read access to the source datasets and
dataset/table creation and read/write access for the private snapshot dataset.
No public image bucket is used for recipient files. Recipient samples are returned
only by the authenticated UI preview endpoint, bypassing durable action receipts.
Assistant/MCP previews return an empty sample so chat history and tool receipts
do not retain guest addresses. HTTP CSV export requires a
signed-in user, resolves current workspace membership, checks brand ownership,
and rejects unready or expired snapshots. Cancellation stops fetching more pages.
CSV fields are escaped and spreadsheet formulas are neutralized; delivery workers
use original table rows, not spreadsheet-safe strings. A long CSV download is
still bounded by the HTTP route's 300-second timeout. Workers should persist the
page token and retry against the durable table; snapshots are the canonical
artifact, not a successfully completed HTTP download.

## Schema rollout and local development

The two new tables are exported in `src/server/db/schema.ts` for the normal
production schema push. The additive SQL is in
`scripts/migrations/email-audiences.sql` for explicit application to a target DB.
Existing lead/profile tables are unchanged.

For isolated local integration testing, `EMAIL_AUDIENCE_DEV_SCHEMA` may name a
schema matching `email_audience_dev_[a-z0-9_]+`. Create that schema and run the SQL
with its `search_path` first. Only the two audience tables use it; existing brand
membership remains in public. The override is ignored outside development, so
preview/production use the normal public tables. The validated local namespace
for this worktree is `email_audience_dev_oct02`. No public audience migration was
applied during development.

## Validation recorded

- Real CIO preview: 16,798 candidates with non-machine/non-prefetched clicks in
  the last 90 days, with export watermark 2026-10-02. This is not a sendable count.
- Compiled that revision into a private 30-day snapshot. Read two 500-row pages;
  no duplicate addresses between those pages.
- Stale revision writes and cross-workspace snapshot access were rejected.
- Property-manager query and opt-out blocker exercised against Winter Park Escapes.
- Unit tests cover source/brand scope, invalid rules, fail-closed current eligibility,
  deduplication, batch limits and CSV escaping.

No guest was emailed by this workflow.

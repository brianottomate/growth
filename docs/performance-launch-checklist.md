# Recorded launch checklist

The Overview checklist is an explicit record of operator and workflow decisions.
Page reads do not derive checked values from assets, intake answers, campaign
status, or provider mirrors. Existing clients start with an empty record; there
is no backfill of earlier inferred ticks.

The UI starts collapsed. Each controlled checkbox sends its intended boolean to
`performance.setLaunchChecklist`, waits for persistence, then refreshes the
router. It does not store optimistic checked values locally. Checking Live here
records a milestone; it does not activate a campaign.

## Writes and provenance

`recordLaunchChecklist` is the shared organization-scoped write function.
A request patches one or several items atomically. Manual and assistant writes
require the revision they read; stale or racing writes fail and require a fresh
read. Each item retains its last explicit checked/unchecked decision, source,
authenticated actor (when available), timestamp, and optional evidence. The last
100 item events are retained for inspection. Workflow receipts deduplicate the
same completion so its retry cannot overwrite a later manual reopening.
A genuinely new successful workflow may check the item again. Removing assets
does not reopen items implicitly.

The record is stored in the existing brand `performanceChecklist.launch` JSONB
field. Tracker `values` and `meta` stay independent and are preserved by both
write paths. No schema migration is needed.

## Workflow completion points

All items can be checked or reopened manually or through MCP. These successful
service writes also emit completion events:

| Item | Explicit completion event |
| --- | --- |
| Intake filed (`intake`) | Intake submission saved |
| Media budget set (`budget`) | Confirmed positive budget submitted; agreed spend saved; cycle media budget saved |
| Ad account access verified (`access`) | Intake access verification succeeds and page binding finishes |
| Homes on record (`homes`) | Home import finishes without reported failures; manual homes or an individual feed home saved |
| Report and invoice contacts (`contacts`) | Both supplied together in intake or settings update |
| Brand mark on file (`mark`) | Brand mark saved |
| Creative folder shared (`folder`) | Valid creative folder URL submitted or saved |
| Cards kept as previews (`previews`) | Preview asset saved |
| Ads drafted (`ads`) | Draft ad, starter ads, or mini-studio idea saved |
| Campaign drafted (`campaign`) | Campaign creation and platform planning finish |
| Audience in the ad account (`audience`) | Audience creation returns a provider ID |
| Built on Meta, paused (`pushed`) | Real Meta build completes; validation-only runs do not count |
| Live (`live`) | Successful explicit campaign activation checks it; explicit pause reopens it |

Unrelated syncs, provider polling, reads, and failed workflows do not emit
completions. If contacts are edited separately, the operator/MCP explicitly
records the contacts milestone; the writer does not inspect existing fields to
infer that both are present. Workflow milestone writes run after successful
business writes, with conflict retries. They are not a transactional outbox:
a recording failure is surfaced and can be corrected through the checklist.

## MCP bulk updates

Read `performanceRead__launchChecklist` with `brandId`, then call
`performanceWrite__recordLaunchChecklist` with `brandId`, `expectedRevision`, and
`patch` (1–13 distinct items). For example:

```json
{
  "brandId": "brand_example",
  "expectedRevision": 4,
  "patch": [
    { "item": "intake", "checked": true },
    { "item": "budget", "checked": true },
    { "item": "live", "checked": false }
  ],
  "evidence": "Client onboarding review"
}
```

Source and actor are stamped by the server, not accepted from MCP input. A bulk
request applies to one client; clients can be updated with separate requests.
These are reversible workspace records, available through the canonical
assistant/MCP registry without provider-spend permissions.

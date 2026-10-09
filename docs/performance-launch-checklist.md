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
A request patches one or several items atomically using last-write-wins.
Each item retains its last explicit checked/unchecked decision, source,
authenticated actor (when available), timestamp, and optional evidence. The last
100 item events are retained for inspection. Workflow receipts record provenance;
reusing one does not suppress a later write. Removing assets does not reopen items
implicitly.

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
business writes. Checklist saves use last-write-wins. They are not a transactional outbox:
a recording failure is surfaced and can be corrected through the checklist.

## MCP bulk updates

Read `performanceRead__launchChecklist` with `brandId`, then call
`performanceWrite__recordLaunchChecklist` with `brandId` and
`patch` (1–13 distinct items). For example:

```json
{
  "brandId": "brand_example",
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

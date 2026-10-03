# Performance cards: recorded state and first audit

## Product contract

Cards support one optional plain-text `performanceSettings.note` (up to 2000
characters), visible at the bottom in every mode and focus view only when present.
The note starts at three lines with Show more/less when needed. The canonical
settings writer stamps `noteEditedAt` and `noteEditedBy` (user ID, display name,
avatar snapshot) only when the note changes. Other settings edits preserve those
stamps. Empty or null clears the note. It uses the staged editor and existing
`brandWrite.setPerformanceSettings` chat/MCP action, not content-post comments.
Recording platform Live remains a status edit, not a provider launch.

The Performance Overview pipeline and each client Overview share the same card.
The client journey is selected manually. All, Commercial, Creative, and Delivery
filter details on that journey; they are not separate databases or stage tracks.
Compact, Overview, and Detailed are independent per-card display modes.

The shared journey is Prospects → Signed → Onboarding → Launch prep → First month → Ongoing,
with On hold separate. First month is explicitly selected, never inferred from
dates or platform delivery. Legacy `review` records display in Onboarding;
review readiness belongs to creative work. This compatibility mapping does not
rewrite saved records. The audit table below records the earlier stage names.

The UI labels the stored `In production` creative state as **Creating** to avoid
confusion with shipped software. Creating, Drafting, and Building use blue;
approved/live/paid facts use green, and review/paused/pending facts use yellow.

`brand.performanceSettings.cardState` stores explicit current commercial, intake,
creative, platform, site, DNS, and payment states in the existing JSONB column.
`pipelineStage` is the separate manual journey. Management uses `monthlyFee`;
Spend uses `agreedAdSpend`. Dollar amounts retain cents. These cards do not read
billing cycles for either amounts or payment status. There is no schema push or
physical-column migration for this change.

Missing means **Not recorded**, never unpaid, unstarted, or disconnected.
Recording Paid does not charge a card. Recording Live does not launch an ad.
A catalog's recorded statuses are Not started, In production, Approved, Export ready,
and Live. Catalog Live is manually recorded and does not imply Meta or Google delivery.
A catalog can return to In production while Meta remains Live. Paused and Live
are reversible. Not-created platforms are hidden from read-only cards.

Updates use the existing organization-scoped `setPerformanceSettings` service
and `brandWrite.setPerformanceSettings` chat action. Partial nested patches
preserve the other recorded facts; null clears one. Saves check that the original
settings have not changed concurrently. The staged menu editor uses the same
writer and Cancel discards its draft. No workflows, provider syncs, exports,
intakes, or monthly timers automatically update these new statuses.

Older business/delivery enums and billing-cycle pages still exist for their
legacy uses. The new client header shows the manual journey so those older
tracks do not contradict the new cards visually. The operational readiness
checklist on client Overview remains a separate source observation.

## Tracker details on the cards

Summary and Milestones show the existing configured contract effective date, terms,
and end date when present. Compact stays focused on amounts and work statuses.
The three-dot menu opens the intake form; creative document links stay off the cards.
Newsletter, influencer, and other unstructured commitments belong in the current note.

`cardState.zernioAccess` is a manual, chat-editable independent check: Not connected
or Connected, with missing values shown as Not recorded. Compact shows a neutral
label; Summary shows the check and Milestones adds its meaning. Do not map tracker
FB/Leadsie claimed or verified access to this field: that does not prove Zernio access.
It does not change Meta/Google delivery or the client journey.

## Evidence reviewed on October 2, 2026

1. User-supplied `table.tsv` (Downloads) and Wanda's Slack synthesis through Oct 2.
   This is supplied evidence, not a fresh independent Slack search. It reports
   13 signed customers and $410K ARR; these are not calculated dashboard totals.
2. Existing brand settings, explicit legacy stage records, submitted intake
   receipts, included catalog-home rows, ad approvals, local platform campaigns,
   and owned newsletter drafts. Billing cycles were deliberately excluded.
3. Current Catalog UI approval validation: 30A has 31/31 included cards approved;
   Hollyhock 64/64; Chalets 20/21 even though all 21 rows carry old approvals.
   This difference is why an old approval or export cannot prove current readiness.

This is a **one-time manual initialization**, not a runtime inference rule.
The read-only audit script produces source observations. The separate apply
script accepts only an explicit reviewed patch file, defaults to dry-run,
checks organization and brand identity, backs up current settings locally,
and verifies saved values. Future runs require a fresh evidence review.

## Reviewed decisions

| Client | Journey decision | Recorded work and delivery | Management/payment decision |
| --- | --- | --- | --- |
| 30A Beach Stays | Keep Signed | Catalog Approved; Ads In production; Meta Draft; 31 included homes | $2,666.67/month; Management Paid confirmed Sept 29, recorded against September; Spend unknown |
| AR Vacations | Onboarding | Submitted intake; Catalog/Ads In production; Newsletter Drafting; Meta Draft; 30 homes | Management Open reflects the bank payment pending Sept 30; settlement is not confirmed; amount unknown |
| Arkansas Vacation Rental | Preserve current entry stage | A second record for the same Slack customer; do not merge or copy AR work into it | Unknown |
| CarefreeNB Hosting | Paused for delayed start | Commercial relationship remains Signed | $3,000/month; Not invoiced reflects the explicit hold until December |
| Chalets Hocking Hills | Ready for review | Current catalog In production (20/21 approvals); Ads In review; Meta/Google Paused in saved external rows; Site Live; Newsletter Drafting; 21 homes | $2,500/month from supplied evidence; payment unknown |
| GetAway | Keep Signed | No verified current creative readiness | $3,000/month; permission to charge was unresolved, so payment remains unknown |
| Hollyhock Suites | Onboarding | Catalog Approved; Ads In review; Meta Paused; Site Live; submitted intake; 64 homes | Keep configured $1,500/month because supplied fee is unstated; Management Paid Sept 29, recorded against September; Spend unknown |
| Legacy RnR | Preserve explicit Onboarding | Catalog In production; Ads In review; Meta Paused; Site Building (approval still outstanding); 19 homes | Keep configured $2,500 Management/$1,000 Spend; payments unknown |
| PMI Southwest Florida | Keep Signed | Ads In production; Meta Draft | $2,500/month; invoice planned does not prove sent or paid |
| Porchlit Properties | Keep Signed | No verified creative readiness | $2,500/month; payment unknown |
| Seasons 4 | Keep Signed | No verified creative readiness | $2,500/month; payment unknown |
| Winter Park Escapes | Ongoing | Meta Live from the supplied Sept 25 report; Catalog/Ads In production; Site Live; Email DNS pending from Oct 1; Newsletter Drafting; 219 homes | $2,500/month; payment unknown |
| Zion Stays Vacation Rentals | Preserve current entry stage | Existing app says Signed; 149 homes and a linked WanderOS site | No signed confirmation in the supplied rollup; do not invent a fee or payment |
| Luana Kai Resort | Prospects | Agreement sent Sept 23; Commercial Pitch sent | No signature confirmation; don't treat the existing client classification as proof |

WanderOS connected is recorded only for brands with an enabled, saved website
link. Site Live comes from explicit saved Yes values or supplied evidence;
a website ID alone does not establish site launch. Email DNS Not connected
for the audited working clients means no marketing-domain setup exists in this
app; it is not a failed live DNS lookup. Winter Park's DNS pending is an explicit
team report, and supersedes that absence. No domain is marked Verified from
an unperformed provider check.

Catalog counts are the included inventory observed during this audit, not a
contract entitlement. Some clients have approved ads alongside unfinished ads:
the card records ongoing/review work, not approval of every draft. External
Paused rows take precedence in the reviewed delivery assessment over local
new drafts. Winter Park is the explicit exception: the newer team report says
Live while this database only contains local drafts. Keep that discrepancy
visible here until a subsequent operator review; no permanent priority rule
has been implemented.

Payment Paid refers to the September confirmation for the two named clients.
It does **not** confirm an October payment. No Spend payment has been inferred
from a Management confirmation. Unknown payments remain unset, including
GetAway, PMI, Seasons 4, Porchlit, Winter Park, Chalets, and Legacy.

## Prospects and unresolved records

- MVP Vacation Homes: Pitch sent; owner approval pending. The proposed $2,500
  package and $1,500 ad spend (including a $500 Wander contribution) are not
  recorded as agreed client amounts.
- Coastal Stay, Optima, Aha Moments, and Vistay: Pitch sent; no close confirmation.
- Calibrate Estates: Prospect; interest resumed but still unsigned.
- Forever Destin: Prospect; agency contract is a blocker, not a signed deal.
- Mountain Vibe: team considers it dead/stale; no definitive closure update was
  made from that description alone.
- Beaux Maison passed for now, but no matching pipeline record was found.
- Away & Stay and Oasis Escapes Vacations are in the signed Slack table but have
  no matching current client/prospect desk record. They were not created or
  matched to a similarly named brand. Oasis's billed-but-unconfirmed payment
  and Away & Stay's $500 pilot remain source facts awaiting a resolved identity.
- 30A also has a prospect duplicate, and Arkansas has two client records. Neither
  was deleted, merged, or silently promoted using a name match.
- Luana's manual card is now a prospect, but its legacy brand relationship still
  says client. The card override intentionally does not rewrite legacy accounts.

These identity issues explain why database counts cannot yet be presented as
Slack's 13 distinct signed customers. Do not manufacture reconciliation by
changing totals or deriving ARR from incomplete configured fees.

### Duplicate cleanup — October 3, 2026

At the operator's explicit request, archived the sparse Arkansas Vacation Rental
brand (`brand_3N5VPPdy4XwbRd6z`) and its empty Performance account
(`perf_CwgqLB5U4cVmAU7r`) using `deletedAt`. Preflight confirmed no properties,
cycles, reports, campaigns, ads, channels, personas, content or media to move.
Retained AR Vacations (`brand_79z63BY5j3RUFPwC`) in Onboarding and its account
(`perf_N3Rwq37cJn77FsGm`), including six properties, its existing cycle,
onboarding notes, catalog and brand enrichment. No hard purge or provider changes.

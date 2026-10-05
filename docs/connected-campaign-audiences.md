# Connected campaign audiences

Brand personas describe motivations. Geography is optional; `demandGeography`
is where people live/travel from and `destinationGeography` is where they want
to go. Neither description is automatically a platform targeting instruction.
Setup edits both and uses the existing US/world geography map when populated.

Campaign audience suggestions read personas, brand story, markets, booking
window evidence, brand-owned homes and reusable platform assets. The operator
reviews proposals before saving. Each audience retains its persona, explanation
and optional relevant home IDs. These links can also be edited in the campaign.
Creative generation uses the selected personas and brand pillars; featured-home
suggestions retain their aggregate booking/review ranking and use motivations,
destinations, home facts, open-night context and photos to assess fit. Persona
fit is a planning hypothesis, never an assertion about individual customers.

## Platform assets

`platform_audience` remains the reusable provider record. The new
`campaign_audience_asset` join selects one asset per campaign audience/platform;
one asset can serve many campaigns. An explicit local unlink does not delete a
provider asset. Meta is the initial upload/lookalike surface; the join is
platform-neutral. Actual provider IDs remain in the mirror, not authored plans.

The additive migration preserves direct selections first, then materializes
legacy persona-based selections. The cutover runs only when the join table is
first created, so future releases cannot resurrect an unlinked selection.
Run `bun scripts/apply-campaign-audiences.ts` against an identified target.
Production runs the migration before its schema diff. No customer-data table
is added.

## Seeds

Inside a campaign audience, choose an existing Meta asset or create a customer
list. Sources are custom CSV and the predefined past-bookers selection for the
brand's linked WanderOS website. The warehouse selection uses the existing
email-audience snapshot mechanism, with bookers only and no click filter.
Prepare the selection, wait for compilation, inspect its count, then explicitly
confirm advertising permission and upload. This assertion is separate from
email-sending eligibility. Unsupported brands must connect a WanderOS website
or use CSV. Lists are limited to 50,000 recipients; CSV input is limited to 8 MB.

CSV parsing takes place in the browser. The authenticated, same-origin upload
endpoint passes identifiers to Zernio in 10,000-row batches; Zernio hashes them
for Meta. Warehouse uploads read the private BigQuery snapshot in bounded
pages. Growth stores source/count/status and snapshot/provider references only.
It does not save CSV blobs, recipient rows, or identifiers in action receipts.
Raw recipient upload actions are removed from the assistant catalog.

Seed upload and creation of a 1% lookalike in a chosen country are separate
operator actions. They do not launch ads. New assets become reusable and are
selected for that campaign audience. There is no automatic retry or resume UI.
A failed attempt tries to delete only its own newly created provider asset.
A cleanup failure leaves a visibly failed local record when possible and names
the leftover audience for manual removal. Creation failures without a returned
provider ID require inspection before retrying. Rejected member identifiers fail
the upload rather than treating a partial list as ready.

Provider deletion is documented at
https://docs.zernio.com/ad-audiences/delete-ad-audience.

## Validation

An isolated PGlite migration test exercises preservation, shared assets,
foreign keys, deletion behavior and replay after an unlink. Run the normal
`bun run check`, `bun test`, and `bun run ai:contracts` gates. Local smoke checks
must not create or upload real Meta audiences unless separately requested.

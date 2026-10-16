# Shared campaign intent and platform delivery

Personas are general brand-level customer reasoning: motivation, needs, objections,
decision criteria and evidence. Industry details (including trip purpose) belong
in that prose. Loose age ranges and geography descriptions are optional context,
never executable targeting. Personas have no home IDs, travel object, demand
geography or destination geography fields.

A campaign is one initiative with text and creative ideas, shared audiences and
separate platform plans. Each `audience` stores name, explanation, optional
`persona_id` and intended `geography` JSONB (countries, states, regions, cities).
Geography is general campaign intent: no home IDs, feeder-city structure, age
limits or search terms. Editing it does not change an existing platform plan;
operators confirm executable locations inside each plan.

`platform_campaign` owns the provider enum, budget, schedule, account settings and
provider ID. `platform_delivery_group` replaces `platform_ad_set`. Its optional
`audience_id` records lineage. Its `configuration` JSONB is a TypeScript and Zod
discriminated union whose `platform` must match the parent:

- Meta: group targeting (geography and optional ages).
- Google: group keywords and negatives. Delivery geography and campaign negatives
  live in `platform_campaign.settings.google` and apply to every Google group.
- LinkedIn: group targeting supported by its adapter.
- Other platforms: explicitly add executable schemas when their adapter is built.

Groups can be planned before ads exist. Adding a platform materializes groups for
current shared audiences; adding an audience materializes groups in unpublished
plans. A broad placeholder is reused when the first audience arrives. The shared
cross product is a starting point; editable group configurations are independent.
UI labels remain native: Meta “Ad set”, Google “Ad group”.

External IDs, native `targeting_spec` snapshots, metrics and mirrored ad links are
preserved for sync and reverse engineering. Native imports may have null editable
configuration until translated/reviewed. Publishing reads group configurations,
validates parent-platform and brand ownership, and resolves geography before any
provider write. Google requires an explicit campaign location selection. Publishing
fills the existing planned group row instead of creating a second mirror container.

The app, assistant and MCP share oRPC-backed canonical actions:
`adsWrite.setDeliveryGroup`, `adsWrite.setPlatformDraft`, `personaRead.suggest` and
`adsRead.suggestCampaignAudiences`. Suggestions are proposals; saving is separate.

## Explicit industry research

General persona and audience suggestions read the brand story, description,
existing personas and campaign intent. They never fetch inventory or BigQuery
automatically. Optional `context` carries explicitly supplied research into the
same general schemas.

Campaign audience suggestions still propose an age range and where the people
live: whole US states by default, inferred from the story when nothing more is
supplied (for example drive-to states around a destination), with the inference
named in the explanation. A city is stored qualified ("Seattle, WA") and never
needs its state listed too. Views read the parent state from the city (the
coverage map shades it as selected locations only), while `states` stays
whole-state intent. Each platform plan compiles cities and states its own way.

The WanderOS page exposes `personaRead.wanderOsContext`: prepare owned inventory
context, optionally include aggregate booking evidence, edit/review that input, then
request persona suggestions. Saving a proposal is a separate click. No travel-specific
fields feed back into personas or campaign audiences, and no delivery targeting is
inferred automatically. Booking evidence remains bounded, aggregate, and subject to
its existing warehouse scan limits; the context contains no individual guest records.

## Migration and preview

Migration 0021 renames the native group table and ad foreign key, materializes local
delivery groups, moves existing targeting and search terms into platform plans,
cleans persona profiles, and drops the retired columns. Consistent Google geography
moves to campaign settings; conflicting previous geographies require an operator
selection before publishing. There are no compatibility aliases.

Migration 0022 adds general intended geography to shared audiences. Where
unpublished platform plans agree on geography, it initializes the intent from
that location choice. Conflicting plans leave intent unspecified. Delivery
settings are unchanged.

Test migrations on disposable Neon branches. Production applies committed migrations
through the release build. Local schema previews must use the experiment database.

## Platform assets

`platform_audience` remains the reusable provider record. The
`campaign_audience_asset` join selects one asset per campaign audience/platform;
one asset can serve many campaigns. An explicit local unlink does not delete a
provider asset. Meta is the initial upload/lookalike surface; the join is
platform-neutral. Actual provider IDs remain in the mirror, not authored plans.

## Seeds

Seed lists and their lookalikes are built and delivered as described in
[seed-audiences.md](seed-audiences.md). A delivered lookalike attaches to a
campaign audience through `campaign_audience_asset`, and the Meta plan sends it
as that audience's ad sets' custom audience.

## Validation

An isolated PGlite migration test exercises preservation, shared assets,
foreign keys, deletion behavior and replay after an unlink. Run the normal
`bun run check`, `bun test`, and `bun run ai:contracts` gates. Local smoke checks
must not create or upload real Meta audiences unless separately requested.

# Audiences model

Implemented baseline, 2026-07-11.

Audiences serve two jobs in Growth:

1. durable brand context — who the brand serves, available to AI, content,
   research, and campaign planning;
2. paid activation — how a strategic audience is translated into the controls
   a particular ad platform supports.

Those jobs share intent but not semantics. In particular, descriptive
demographics are not automatically valid or permitted ad-targeting controls.

## Layers

```text
audience_target       authored profile / ICP / segment
  ↓
audience_activation   planned targeting for one platform
  ↓
audience              mirrored platform audience object
  ↓
audience_placement    where that object is attached and running
```

`audience_evidence` records why a profile is believed: research, customer
evidence, analytics, operator knowledge, or an explicit inference.

## Audience profile (`audience_target`)

The existing table name is retained for compatibility. Product surfaces should
describe the row as an audience profile, ICP, or segment depending on
`profileScope`:

- `core` — a durable ICP or market side;
- `segment` — an actionable slice of a core audience;
- `experimental` — a hypothesis that should not silently become canonical.

Important fields:

- `slug` — stable idempotency key within a brand;
- `marketSide` — consumer, professional, business, or partner;
- `researchMaturity` — hypothesis, researched, or validated;
- `geography` — the audience's real market context;
- `demographics` — descriptive research and messaging context;
- `context` — jobs, pains, outcomes, triggers, objections, qualification
  signals, exclusions, messaging angles, and tags.

The older `type`, `intendedChannels`, and `sizeGoalLabel` fields remain during
the compatibility period. New platform mechanics belong on activations.

## Geography

Geography has three intentionally different states:

- `null` — not established yet;
- `{ mode: "global" }` — genuinely global;
- `{ mode: "specific", include: [...] }` — defined markets.

Both global and specific scopes can contain exclusions. Locations preserve a
human name and may add country/region codes, platform keys, coordinates, or a
radius when known. A broad profile can therefore say “United States,” while a
campaign activation narrows to New York and Chicago without rewriting the ICP.

Activation geography uses an explicit mode:

- `inherit` — use the profile market unchanged;
- `narrow` — select a subset within the profile market;
- `replace` — deliberately target a different market.

`inherit` with null activation geography is not missing data; it is an explicit
inheritance instruction.

## Demographics

Profile demographics describe who research suggests the audience tends to be.
They may include age range, genders, languages, life stages, occupations,
education, household context, income range, and notes. Unknown attributes stay
unknown; the system must not invent them to make a profile look complete.

Activation demographics are separate and use an explicit mode:

- `none` — no demographic targeting planned (the safe default);
- `inherit_descriptive` — deliberately translate eligible descriptive fields;
- `override` — use a campaign-specific demographic definition.

Before `inherit_descriptive` or `override` is used, the operator/agent must
check the platform, jurisdiction, objective, and special-ad-category rules.
Housing, employment, credit, and political campaigns can restrict available
targeting dimensions. `specialAdCategory` and `complianceNotes` live on the
activation for this reason.

## Activation (`audience_activation`)

There is at most one planned activation per profile and platform. It contains:

- platform, structural targeting type, and lifecycle status;
- geography mode plus optional geography;
- demographics mode plus optional demographics;
- structured targeting spec or natural-language prompt;
- exclusions, reach estimate, special category, and compliance notes.

Adding an intended channel creates an activation with:

```text
geographyMode = inherit
demographicsMode = none
```

This is conservative by design. Profile context remains useful to AI and
creative work without silently becoming an ad-platform instruction.

## Platform object (`audience`)

An `audience` row mirrors something that exists in one ad account: a Meta saved,
custom, or lookalike audience; a Google segment; an OpenAI prompt audience; and
so on. It remains linked to the strategic profile through `targetId`.

The platform object's `definition` is source reality, not the profile source of
truth. Future sync work can add seed lineage and formalized provider-specific
definition shapes without changing the upper layers.

## Placement (`audience_placement`)

Placement connects a mirrored audience to a campaign/ad set and stores run
status plus optional stats. This is required for honest coverage: an audience
object merely existing does not mean it is active in a campaign.

The current UI still computes compatibility coverage from linked platform
objects. Once placement sync is populated, coverage should require an active
placement on the intended platform.

## Agent writes

- Explicit create/update requests execute directly; ordinary audience writes do
  not ask for a redundant second confirmation.
- Bulk saves use one transaction through the repo's transaction-capable Neon
  client.
- `(brandId, slug)` makes creates idempotent and safe to retry.
- Delete/merge operations remain appropriate candidates for approval or undo.
- Research evidence and activation plans are returned by `listAudienceTargets`
  so later AI tasks can distinguish fact, operator input, and inference.

# Audiences model

Design note (2026-06-05). Proposal — **not yet applied**. Companion to the
"Audiences & the ad-set gap" section in `paid-ads-surfacing.md`.

## Framing — audiences are a *platform-layer ad concept*, planned from the top

Correcting the earlier "audiences mirror lifecycle programs" framing. Audiences are
**primarily an advertising concept**, living at roughly the **same grain as a
campaign / ad set**. They are not a standalone strategic artifact — they're how a
campaign is pointed at people. The strategy lives one layer up.

```
STRATEGIC / authored  (intent — the planning surface)
  initiative           goal-driven push ("drive WanderOS lead volume")
  audience_target      canonical "who" ("STR operators, 10+ properties")

PLATFORM / synced  (reality — what's in Meta / Google / OpenAI)
  campaign → ad set → ad_spot          the delivery
  audience                             the saved/custom/lookalike/prompt object
    └─ audience_placement              ← NEW: where an audience is actually attached
```

So:
- **`audience_target`** (+ optional link up to `initiative`/goal) is the strategic
  "who we want to reach". Hand-authored. This is the planning surface.
- **`audience`** is the real platform object (a Meta saved/custom/lookalike audience,
  a Google segment, an OpenAI prompt audience). Synced, not authored.
- **`audience_placement`** is the missing connective tissue: which campaign(s)/ad
  set(s) an audience is attached to, and whether it's live. This is the analogue of
  `lifecycle_program_step.campaignId` + `status` — it's what lets *coverage reflect
  what's actually running*, not just what exists.

## The gaps this closes (recap)

1. **No run-state** on `audience` → `/audiences` coverage counts a paused audience as
   "covered" (false positive). The Slack-thread event ("now live") is a state change
   we can't represent.
2. **No `audience ↔ campaign` link** → can't answer "which campaigns is the Minerva
   lookalike running in?" (deployment grain is the ad set, flattened to strings on
   `ad_spot`).
3. **No lookalike seed lineage** → `Minerva*`/`Hubspot*` lookalikes are seeded from
   our lead/CRM lists, but nothing links `audience` back to `leads.*`.
4. **Definition is Meta-shaped only** → OpenAI/ChatGPT audiences are described in
   *natural language* + demographics, not structured selects. No home for that.

## Proposal

### A. Enrich `audience` (the platform object)

```ts
// additions to audienceTable (ads-schema.ts)
status: audienceRunStateEnum().default("active").notNull(), // active | paused | archived | draft
                                                            //   ← mirrors ad-set status from the tree

// --- how the audience is DEFINED (varies by platform) ---
definitionStyle: t.text(), // "structured" (Meta/Google selects) | "prompt" (OpenAI NL) | "hybrid"
prompt: t.text(),          // the natural-language brief — for OpenAI/ChatGPT audiences.
                           //   This IS the targeting spec there, not just a label.
// definition jsonb already exists — formalize its shape:
//   { demographics?: {ageMin,ageMax,genders,countries,...},   // ALWAYS relevant, every platform
//     interests?: string[], behaviors?: string[], geo?: {...}, // Meta detailed targeting
//     keywords?: string[], inMarket?: string[] }               // Google
//   Demographics live here for prompt audiences too.

// --- lookalike / custom seed lineage ---
seedKind: t.text(),            // "list" | "audience" | "pixel_event" | "engagement"
seedAudienceId: t.text().references(() => audienceTable.id), // self-FK: LAL of another audience
seedSource: t.text(),          // "leads" | "hubspot" | "minerva" | "csv" | "crm"
seedRef: t.text(),             // id into the source system (e.g. a leads.lead_import id)
lookalikeSpec: t.jsonb(),      // { ratio: 0.01, country: "US" } — null for non-LAL
```

`audienceTypeEnum` already has `segment | keyword | intent | lookalike | custom` —
keep it for the *structural* kind. `definitionStyle` is orthogonal (a `segment` can
be authored structurally on Meta or by prompt on OpenAI).

### B. New table: `audience_placement` (the connective layer)

The join between an audience and where it runs. Many-to-many: one audience → N ad
sets; one ad set → N stacked audiences. Synced from the ad tree (and the place a
human could pre-author an *intended* placement before it exists, status `planned`).

```ts
export const audiencePlacementTable = pgTable("audience_placement", (t) => ({
  id: t.text().primaryKey().$defaultFn(() => createId("aplc")),
  audienceId: t.text().references(() => audienceTable.id, { onDelete: "cascade" }).notNull(),
  campaignId: t.text().references(() => campaignTable.id, { onDelete: "cascade" }).notNull(),
  // Ad set denormalized (same decision as ad_spot — we don't model ad_set as a table).
  adSetId: t.text(),
  adSetName: t.text(),
  status: t.text(),         // active | paused — from the ad set
  // optional snapshot so a placement can show its own pull without ad_spot
  stats: t.jsonb().$type<AdStats>(),
  externalId: t.text(),
  createdAt: ..., updatedAt: ...,
}));
```

Coverage then becomes honest: a target is **covered** on a channel only if it has a
linked audience with an **active placement** there — not merely a linked row.

### C. (Optional) tie targets up to the strategic push

`audience_target.initiativeId` (nullable FK) — so an initiative ("WanderOS lead
volume") can declare the audiences it wants, exactly like it declares
`targetChannels` for campaigns. Defer until initiatives are authored.

## Concrete examples

All real, pulled from the live `act_885632589057558` tree (2026-06-05).

**Target (authored):** `audience_target` — *"STR operators, 10+ properties"*,
`type=lookalike`, `intendedChannels=[meta, google, openai]`, `priority=must_have`.

| audience (platform object) | type | definitionStyle | seed | placement → campaign | status |
|---|---|---|---|---|---|
| `LeadForm_MinervaLookalike` | lookalike | structured | `seedSource=minerva`, `seedKind=list`, `lookalikeSpec={ratio:0.01,country:US}` | `WanderOS_MetaLeadForm_Conversions` | active |
| `LeadForm_HubspotLookalike` | lookalike | structured | `seedSource=hubspot`, `seedKind=list` | `WanderOS_MetaLeadForm_Conversions` | active |
| `Listed PM interests US 30-60` | segment | structured | `definition={demographics:{ageMin:30,ageMax:60,countries:[US]}, interests:["vacation rental management","Airbnb hosting"]}` | `Prospecting_Listed_Wander_A_B_Test_Leads` | active |
| `OpenAI – frustrated Airbnb operators` | segment | **prompt** | `prompt="US property managers / STR operators running 5+ listings, frustrated with Airbnb & VRBO fees, looking to take direct bookings"`, `definition={demographics:{ageMin:30,ageMax:60,countries:[US]}}` | (OpenAI campaign) | planned |
| `Google in-market: vacation rental software` | intent | structured | `definition={inMarket:["Vacation Rental Software"], keywords:["airbnb alternative","direct booking platform"]}` | (Google campaign) | planned |

Two takeaways the examples make obvious:
- The first two are the **A/B test in the Slack thread** — *two audiences, same
  campaign*. Only `audience_placement` can express that; `targetId` alone can't.
- The OpenAI row carries **no interest selects** — its targeting is the `prompt`
  string + demographics. That's why a label isn't enough: the prompt *is* the spec.

## On "maybe it's just a label" (the ChatGPT free-text)

My take: make it a real `prompt` column, not just lean on the audience name.
- For Meta/Google the structured `definition` is the source of truth; the name is a
  handle.
- For OpenAI the natural-language brief **is** the targeting — if it only lives in
  the name, you lose it the moment someone renames the audience, and you can't diff
  "what we asked for" against "what's running". One nullable text column is cheap.
- **Demographics stay structured for everyone** (`definition.demographics`) — the
  user is right that they remain first-class even on ChatGPT; only the
  interest/behavior selects collapse into prose there.

## Open questions

1. Promote ad set to a real table, or keep denormalizing it onto `audience_placement`
   + `ad_spot`? (Leaning: keep denormalized for now — consistent, less to sync.)
2. Does `audience_placement` get synced from the tree, hand-authored, or both? (Both:
   synced rows are reality; `status=planned` rows are intent before they exist.)
3. Lookalike seed → does `seedRef` point at a `leads.lead_import`, a HubSpot list id,
   or a generic external ref? (Generic `seedSource`+`seedRef` now; tighten later.)

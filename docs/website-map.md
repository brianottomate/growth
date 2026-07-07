# Website map — wander.com page wall

The Website wall (`/app/website`) mirrors the public marketing site the same
way the Blog and Newsletter walls mirror those channels: one `web_page` row
per public page, synced from the live sitemap. Sibling docs:
`docs/blog-integration.md`.

## Why grouping is the core problem

wander.com's sitemap is ~7,000 URLs, but almost all of them are *dynamic*
pages stamped from a handful of templates:

| Group | Pattern | ~Count |
|---|---|---|
| Brand pages | `/about`, `/careers`, `/os`, `/list`, … | ~13 |
| SEO landing | root slugs (`/luxury-vacation-rentals-*`, occasions) | ~60 |
| Location hubs | `/{state\|country}` | ~44 |
| City pages | `/{state}/{city}` | ~280 |
| Location category | `/{state}[/{city}]/{category}` (8 category slugs: families, hot-tubs, large-groups, private-pool, pet-friendly, beachfront, lakefront, oceanfront) | ~1,180 |
| Properties | `/property/{id}` | ~4,350 |
| Articles | `/article/{slug}` | ~1,040 |
| Legal / help / other | fixed sets | ~15 |

A flat wall is useless at that scale, so the page type is the primary axis:
the wall shows brand + SEO pages as covers, locations as a hub → city →
category tree, and properties/articles as aggregate cards (articles link to
the existing Blog wall, which stays the detail surface for `/article/*`).

**The DB stores structure, not a copy of the site.** The map's job is to
separate hand-built static pages from template output, so any page type with
more than `--rollup-over` pages (default **20**) is stored as ONE rollup row
(path `/{type}/*`, metadata `{rollup, count, samplePaths, byLocation}`)
instead of per-page rows. For wander.com that means ~15 static rows + 6
template rollups. Location rollups carry per-hub counts in `byLocation`, so
the wall still shows the state-by-state breakdown. Raise the threshold when
per-page fidelity is actually wanted (e.g. `--rollup-over=5000` keeps every
property row for churn analysis); the next default run prunes back down.

**Scale safeguards** (an Airbnb-sized sitemap is ~8M URLs): parsing stops at
`--max-urls` (default 25k, loudly logged — this bounds *counting*, while
`--rollup-over` bounds *storage*); sitemap indexes are followed within the
same budget; OG enrichment is static-pages-only, hard-capped at 200 fetches.

**Foreign sites (`--sitemap=… --brand=… --ai-spec`).** wander.com uses the
deterministic rules below; for a site we don't own, `--ai-spec` makes one
`generateText` + `Output.object` call that turns a structural sample of the
sitemap into a classification spec (groups + prefixes + template-or-static),
then classifies against it. AI-spec groups store `pageType="other"` with the
group key in metadata; a proper multi-brand UI is a follow-up.

## Architecture

- **`src/server/db/website-schema.ts`** — `web_page` table
  (`wpg_` ids, unique on `(brand_id, path)`). Synced pages are upserted;
  pages that drop out of the sitemap flip `is_active=false` (never deleted),
  so `first_seen_at`/`last_seen_at` make page churn observable.
- **`src/lib/website-pages.ts`** — pure classification rules. Location hubs
  are *derived from the sitemap itself* (a root slug with location children),
  so new states/countries group correctly with no code change.
  `MANUAL_OVERRIDES` is the human escape hatch for slugs the heuristics get
  wrong (e.g. `/ca` → Canada) — add an entry, re-run the importer.
- **`scripts/import-website.ts`** — the sync. `--enrich` additionally
  fetches `og:title` / `og:image` / meta description for root-level pages
  only (~120 fetches), which gives the wall its covers.
- **`src/app/app/website/page.tsx`** — the wall (server component, direct DB
  query, same pattern as `/app/blog`).

## Runbook

```bash
bun run db:push                                     # first time: create web_page
bun run scripts/import-website.ts --enrich          # sync + OG covers for static pages
bun run scripts/import-website.ts                   # fast re-sync
bun run scripts/import-website.ts --rollup-over=5000  # keep big groups per-page
bun run scripts/import-website.ts \
  --sitemap=https://competitor.com/sitemap.xml --brand=competitor --ai-spec
```

## Known sitemap quirks (upstream, wander.com repo)

- A couple of double-slash entries (`//luxury-vacation-rentals-silverthorne`)
  — the importer normalizes these.
- One `/{state}/unknown` city page (bad city slug in the GLP data).
- Sitemap sources (see `wander.com/src/features/sitemap/generateSitemap.ts`):
  footer links + Guest API properties + DatoCMS blog articles + DatoCMS SEO
  pages + DatoCMS generated location pages.

## Follow-ups

- Weekly cron (`/api/cron/growth?job=website_sitemap_sync`) instead of the
  manual script.
- Property titles from the Guest API search endpoint (names instead of ids).
- Page-level Amplitude traffic per group on the wall.

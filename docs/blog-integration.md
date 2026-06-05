# wander.com Blog → Growth DB (strategic-layer mirror)

Mirrors wander.com blog articles (DatoCMS) into the growth DB, same pattern as the
Customer.io newsletter mirror. Read-only against Dato.

## Source

- **API:** DatoCMS **Content Delivery API** (GraphQL), `https://graphql.datocms.com/`.
- **Auth:** `DATOCMS_API_TOKEN` (read-only CDA token). Pass inline to the script;
  not committed. Header `X-Exclude-Invalid: true` (matches how wander.com queries).
- **Model:** `allBlogArticles` (`BlogArticleRecord`), ~1,202 total. Fields used:
  `id, title, url (slug), description, _publishedAt, tags { name },
  image { responsiveImage { src }, url }`. (`body` is structured text — not imported.)
- **Tags are topic-like** out of the box: Destinations, Travel Guides, Travel
  Inspiration, Property Management, Announcements — used directly as the topic facet.

## Script

`DATOCMS_API_TOKEN=… bun run scripts/import-blog.ts` — idempotent (wipes prior blog
rows for the brand). **Scope: most recent 300 published.**

| Dato field | → `platform_post` |
|---|---|
| — | `platform=blog`, `externalKind=blog_article`, `provider=native`, `source=owned`, `status=published` |
| `title` | `text` |
| OG/hero `image` | `media[0]` (cover image) |
| `_publishedAt` | `publishedAt` |
| `id` / `url` | `externalId` / `externalUrl` = `wander.com/article/{slug}` (note: `/blog/{n}` is the paginated *listing* route, 15/page; articles live at `/article/{slug}`) |
| `description`, `slug`, `tags` | `metadata` (jsonb) |

## Surfaces

- **`/app/blog`** — List + **Wall** (image-cover newsstand via the shared
  `CoverWall`), tag/topic facet filter, "Traffic in Amplitude" link.
- **`/app/blog/[id]`** — OG image + title + description + tags, "Read on wander.com"
  + "Stats in Amplitude" (per the plan: link out to Amplitude until per-post stats
  land in-app).
- Blog posts also flow into `/app/feed` (blog channel).

## Shared primitive

Both newsletters and blog use `src/components/cover-wall.tsx` (`CoverWall` /
`DocumentReader`) via a generic `CoverItem`. Newsletters pass `html` (scaled live
email render); blogs pass `coverImage` (OG image). Same component, zero changes.

## Notes

- The `@datocms/mcp@2.x` MCP is broken; `@1.0.8` is pinned but only exposes
  CMA-client *authoring* helpers — for content reads, use the GraphQL CDA above.
- Per-post analytics are deferred → Amplitude link-out for now.
- Currently capped at 300 recent; bump `CAP` in the script to import more.

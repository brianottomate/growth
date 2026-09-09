# Zernio → `platform_post` mapping

Verified against live Wander data, 2026-06-01 (`bun --conditions react-server scripts/zernio-dump.ts --json`).

## Key finding: `/posts` is empty — `/analytics` IS the list-posts endpoint

I enumerated the full Zernio API surface (OpenAPI / llms.txt). There is **no dedicated "list externally-published posts" endpoint**. The relevant ones:

| Endpoint | What it is | Wander reality |
|----------|-----------|----------------|
| `GET /v1/posts` | Posts **authored in Zernio's composer** | **Empty** — Wander does not compose through Zernio. |
| `GET /v1/analytics` | **Returns full post objects** (content, media, urls, `platformPostId`) WITH metrics, for native + external posts. `source=external\|late\|all`. Paginated. | **The real content source.** |
| `GET /v1/analytics/post-timeline` | per-post daily metric timeseries | not a post list |
| `GET /v1/analytics/content-decay` | aggregated engagement-decay buckets | not a post list |

Despite the name, **`/analytics` is Zernio's list-published-posts endpoint** — it returns whole posts, not just numbers, and has a `source` param specifically to select externally-synced posts. So the mapping target is the **analytics post** (`ZernioAnalyticsPost`), not `ZernioPost`. `/posts` only matters when we start composing *through* Zernio (the "owned" future); the fetcher exists (`listZernioPosts`) but returns nothing today.

Per `data-model.md`'s **mirror-live-first** principle: render the Feed live from `/analytics` on page load; only persist a `platform_post` row when we forge on it.

### What's actually retrievable (verified live, last 6 months, `source=external`)

| Platform | Posts | Notes |
|----------|------:|-------|
| Instagram | 100 | full content + media + reel urls |
| Facebook | 95 | (returned 0 under a ~1-year window — query 6-month windows) |
| LinkedIn | 27 | Org account. `pagination.total` reports 54 but only 27 unique rows exist — **trust walked rows, not `total`** |
| Twitter/X | 0 | not synced (X full-history is API-tier gated) |
| Meta Ads | 0 | ad account, not organic — use the ads tree instead |

**Caveats for the sync service:** (1) the endpoint defaults to 90 days, max 366; **query in ≤6-month windows** (user confirmed 6 months is the practical horizon). (2) **Paginate by walking `page` until an empty result and dedupe by `_id`** — `pagination.pages`/`total` are unreliable (LinkedIn over-reports). (3) `limit=50` behaved correctly. (4) Twitter/Meta-Ads won't appear here regardless.

## Connected accounts (`listZernioAccounts`)

`facebook` (wanderfb), `instagram` (wander), `linkedin` (Wander), `metaads` (wanderfb), `twitter` (wander). The account-level `externalPostCount` field is unreliable (reads 0 for FB even though `/analytics` returns 95) — don't use it to gate syncing.

`accountId` (e.g. `6a1e10822b2567671a91f8b5`) is the join key → `channel.externalId`.

## Profiles (`listZernioProfiles`)

A Zernio "profile" is a **workspace grouping** (`name`, `color`, `isDefault`, `accountUsernames`), **not** a social account. One profile: `Default`. Not a `channel`; at most `channel.metadata.zernioProfileId`.

## Field map: analytics post → `platform_post`

A Zernio analytics post fans out via `platforms[]`; **each `platforms[]` entry → one `platform_post` row** (the top-level fields are a denormalized copy of the first platform).

| `platform_post` column | Source | Notes |
|------------------------|--------|-------|
| `platform` | `mapZernioPlatform(platforms[].platform)` | `twitter→x`, `metaads→meta_ads`; helper in client |
| `username` | `platforms[].accountUsername` | |
| `source` | `"scraped"` if `isExternal` else `"owned"` | Wander's are all `isExternal: true` → `scraped` |
| `status` | `"published"` (Zernio `status`) | analytics posts are all published |
| `provider` | `"zernio"` | |
| `text` | `content` | |
| `media` (`MediaItem[]`) | `mediaItems[]` | `{type,url,thumbnail}` → `{type,url,thumbnail}`; `image\|video` map 1:1, post-level `mediaType` can be `carousel`/`text` |
| `stats` (`PostStats`) | `platforms[].analytics` ?? top-level `analytics` | likes/comments/shares/views/impressions/saves/clicks all present; extras (`engagementRate`, `igReels*`) ignored or → `metadata` |
| `externalId` | `platforms[].platformPostId` | IG media id / `urn:li:ugcPost:…` |
| `externalUrl` | `platforms[].platformPostUrl` | public permalink |
| `externalKind` | `mediaType` | e.g. `video`, `carousel`, `image`, `text` |
| `publishedAt` | `publishedAt` | |
| `scheduledAt` | `scheduledFor` | equals `publishedAt` for already-published |
| `scrapedAt` | now() at sync time | |
| `channelId` | lookup `channel` by `externalId == platforms[].accountId` | null if no connected channel row |
| `brandId` | Wander brand | |
| `metadata` | `{ zernioId: _id, profileId, syncStatus, engagementRate, … }` | keep raw extras here |

### `MediaItem` shape (verified)
```jsonc
{ "type": "video", "url": "https://…cdninstagram.com/…mp4", "thumbnail": "https://…jpg" }
```
Post-level `mediaType` ∈ `image | video | carousel | text`; per-item `type` ∈ `image | video`.

## X/Twitter — direct X API v2 (PRIMARY), Apify fallback

Zernio doesn't mirror native X history. We have **our own X API v2 app** (`X_BEARER_TOKEN` etc. in env), and the token has read access — so this is the source, not scraping. Wired in `src/server/clients/x.client.ts` (verified live 2026-06):
- `getXUserByUsername("wander")` → user id (405166211).
- `getXUserTweets` / `getAllXUserTweets({ userId, sinceId })` → `GET /2/users/:id/tweets` with `exclude=retweets,replies` (drops amplification at the source — the retweet-noise problem the Apify pull had), `public_metrics`, and media via expansions.
- `mapXTweetToPlatformPost(tweet, media, { brandId, channelId, username })` → `platform_post` (`platform=x`, `source=scraped`, `externalId=tweet.id`, stats = like/reply/retweet/impression/bookmark, media = highest-bitrate mp4 / photo url + poster thumbnail).

Result: 73 original Wander posts with full metrics + 68 media items, clean. `sinceId` enables incremental sync.

**Limit:** `GET /2/users/:id/tweets` only reaches the most recent ~3200 tweets; deeper history needs full-archive search (Pro/Enterprise tier). Plenty for the feed going forward.

**Fallback (Apify):** none. The Apify `apidojo/tweet-scraper` wrapper (`twitter-scraper.client.ts`) was removed on 2026-09-08 — it had no importers and the actor is API-blocked on the org's Apify plan. If X API access lapses or >3200-tweet history is needed, Bright Data's X posts dataset (`gd_lwxkxvnf1cynvib9co`, see brightdata-peer-scraping.md) is the fallback.

## Next step (not yet built)

A `syncZernioContent(brandId)` service: `getZernioAnalytics` per connected platform (1-year window cap — split older ranges) → flatten `platforms[]` → upsert `platform_post` keyed on `(provider="zernio", externalId=platformPostId)`. Until then the Feed renders live.

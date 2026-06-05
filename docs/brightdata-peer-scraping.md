# Bright Data peer-brand scraping — lay of the land

Goal: on-demand scraping of competitor / peer ("inspiration") brands' social posts
into `platform_post` (`source = "scraped"`, `brandId = <reference brand>`,
`channelId = null`, `platform` denormalized) — the exact shape the schema already
documents for "competitor scraped" rows.

Status: **discovery only.** No production client yet. Test harness lives at
`scripts/brightdata-scrape-test.ts` (`bun run scripts/brightdata-scrape-test.ts <key|all>`).
Each run dumps raw JSONL to `scripts/.brightdata-<key>.json` (gitignored). Focus brand
for discovery = **Airbnb**.

Auth: `BRIGHT_DATA_API_KEY` (validated in `src/env.ts`). Endpoint:
`POST https://api.brightdata.com/datasets/v3/scrape?dataset_id=<id>&notify=false&include_errors=true[&...]`.

## The six scrapers

| Key | Platform | Dataset ID | Extra query | Input shape | Mode | Granularity |
|-----|----------|-----------|-------------|-------------|------|-------------|
| `linkedin` | linkedin | `gd_lyy3tktm25m4avu764` | `type=discover_new&discover_by=company_url` | `{url}` (company URL) | **async** | company → ~47 recent posts (flat) |
| `instagram-profile` | instagram | `gd_l1vikfch901nx3by4` | — | `{url}` (profile URL) | sync | profile → 12 recent posts (nested in `posts[]`) |
| `instagram-post` | instagram | `gd_lk5ns7kz21pck8jpis` | — | `{url}` (post URL) | sync | one post (full detail) |
| `x` | x | `gd_lwxkxvnf1cynvib9co` | `type=discover_new&discover_by=profile_url` | `{url, start_date, end_date}` | **async** | profile → posts in date window |
| `tiktok` | tiktok | `gd_lu702nij2f790tmv9h` | — | `{url, country}` (video URL) | sync | one video (full detail) |
| `facebook` | facebook | `gd_lkaxegm826bjpoo9m5` | — | `{url, num_of_posts, posts_to_not_include?, start_date, end_date}` | **async** | page → N posts |

### Sync vs async (important)

The sync `/scrape` endpoint only blocks ~60–90s. **LinkedIn, X, and Facebook exceed
that and return `HTTP 202` + a `snapshot_id`** instead of data. Those must be polled:

- Monitor: `GET /datasets/v3/progress/<snapshot_id>` → `{status: "running"|"ready"|"failed"}`
- Download: `GET /datasets/v3/snapshot/<snapshot_id>?format=json`

(The harness handles this automatically — on a `snapshot_id` it polls then downloads.)
IG-profile (~2s), IG-post (~13s), TikTok (~36s) return `200` with data directly.

### Discovery / handle granularity

- **company/profile-level** (linkedin, instagram-profile, x, facebook): give a brand URL,
  get recent posts. These are the ones we run per peer brand.
- **item-level** (instagram-post, tiktok): need a *specific* post/video URL. Useful for
  enrichment/backfill of a known URL, or chained after a profile scrape. TikTok has **no
  profile→posts discover** here, so TikTok peer ingestion needs post URLs from elsewhere.

## Target: `platform_post` columns

`brandId` (peer brand), `platform`, `username`, `source="scraped"`, `status="published"`,
`text`, `media: MediaItem[]` (`{url,type:image|video|carousel,width?,height?,thumbnail?}`),
`stats: PostStats` (`{likes,comments,shares,views,saves,...}`), `externalId`, `externalUrl`,
`externalKind`, `publishedAt`, `scrapedAt`, `metadata` (jsonb). Dedup is by
(`brandId`, `externalId`) — same pattern as `content-sync.service.ts`.

---

## Per-platform → `platform_post` mapping

### LinkedIn (`gd_lyy3tktm25m4avu764`) — VERIFIED (47 posts, 26 w/ images, 13 w/ videos)

Flat array; record 0 is often a discovery error (`{error, error_code}`) — filter those out.

| platform_post | LinkedIn field | notes |
|---|---|---|
| `externalId` | `id` | e.g. `"7460758354420924417"` |
| `externalUrl` | `url` | |
| `text` | `post_text` (fallback `original_post_text`) | `post_text_html` also available |
| `publishedAt` | `date_posted` | ISO string |
| `media` | `images[]` → image; `videos[]` (+ `video_thumbnail`) → video | both null on text/reposts |
| `stats.likes` | `num_likes` | |
| `stats.comments` | `num_comments` | |
| `username` | `user_id` / company handle | post author |
| `externalKind` | `post_type` | `"post"` or `"repost"` |
| `metadata` | `hashtags`, `tagged_companies`, `tagged_people`, `external_link_data`, `repost`, `document_*` | |

Skip/keep decision: `post_type="repost"` are amplification (original under `repost.*`).
~36% were reposts for Airbnb.

### Instagram — profile (`gd_l1vikfch901nx3by4`) — VERIFIED

Returns **one profile object** with a nested `posts[]` (12 recent). Also gives
`followers` (6.9M for Airbnb), `posts_count`, `is_verified`, `avg_engagement`, `profile_image_link`
— useful to enrich the peer **brand** row + a `channel`-like follower count.

Per item in `posts[]` → one `platform_post`:

| platform_post | IG profile-post field | notes |
|---|---|---|
| `externalId` | `id` | |
| `externalUrl` | `url` | `instagram.com/p/<shortcode>` |
| `text` | `caption` | |
| `publishedAt` | `datetime` | |
| `media` | `image_url` (→ image/poster), `video_url` (→ video), `content_type` ∈ {Image, Video, Carousel} | carousel only exposes the cover `image_url` here — use IG-post scraper for all carousel frames |
| `stats.likes` | `likes` | |
| `stats.comments` | `comments` | |
| `username` | `account` (profile-level) | |
| `metadata` | `location`, `is_pinned`, `content_type`, `post_hashtags` | |

### Instagram — single post (`gd_lk5ns7kz21pck8jpis`) — VERIFIED (deeper)

Full single-post detail; richer than the profile feed (all carousel frames, tagged users,
comments). Use for backfilling a known post URL or full carousel media.

| platform_post | IG post field | notes |
|---|---|---|
| `externalId` | `post_id` (or `shortcode`/`content_id`) | |
| `externalUrl` | `url` | |
| `text` | `description` | |
| `publishedAt` | `date_posted` | |
| `media` | `post_content[]` (`{type:Photo/Video, url}`) — canonical; or `images[]`/`photos[]` + `thumbnail` | `content_type` ∈ {Image,Video,Carousel}; `photos_number` count |
| `stats.likes` | `likes` | |
| `stats.comments` | `num_comments` | |
| `username` | `user_posted` | |
| `metadata` | `hashtags`, `tagged_users`, `coauthor_producers`, `location_details`, `audio`, `is_paid_partnership`, `videos_duration` | |

### TikTok — single video (`gd_lu702nij2f790tmv9h`) — VERIFIED (item-level only)

| platform_post | TikTok field | notes |
|---|---|---|
| `externalId` | `post_id` | |
| `externalUrl` | `url` | |
| `text` | `description` | |
| `publishedAt` | `create_time` | |
| `media` | `video_url` (→ video) + `preview_image` (thumbnail); `carousel_images` for photo posts | TikTok CDN URLs are short-lived → **rehost to R2** |
| `stats.likes` | `digg_count` | |
| `stats.comments` | `comment_count` | |
| `stats.shares` | `share_count` / `num_share_count` | strings — coerce to number |
| `stats.views` | `play_count` | |
| `stats.saves` | `collect_count` | |
| `username` | `profile_username` / `account_id` | |
| `externalKind` | `post_type` | `"video"` |
| `metadata` | `music`, `region`, `video_duration`, `subtitle_info`, `original_sound`, `is_verified` | |

### X / Twitter (`gd_lwxkxvnf1cynvib9co`) — VERIFIED (752 posts, 375 w/ photos, 101 w/ videos)

Profile-level discovery, `start_date`/`end_date` window (empty = all → big backfill; Airbnb
returned 752 going back to 2021 — **bound the window** to control cost). Async.

| platform_post | X field | notes |
|---|---|---|
| `externalId` | `id` | |
| `externalUrl` | `url` | |
| `text` | `description` | |
| `publishedAt` | `date_posted` | |
| `media` | `photos[]` (→image), `videos[]` (`{video_url,duration}` →video), `external_image_urls`, `external_video_urls` | |
| `stats.likes` | `likes` | |
| `stats.comments` | `replies` | |
| `stats.shares` | `reposts` | |
| `stats.views` | `views` | often null on older posts |
| `stats.saves` | `bookmarks` | |
| `username` | `user_posted` | |
| `externalKind` | `is_repost` → `"repost"`, else `quoted_post` set → `"quote"`, else `"tweet"` | |
| `metadata` | `hashtags`, `tagged_users`, `quoted_post`, `parent_post_details`, `quotes`, `verification_type` | |

Also surfaces profile-level `followers`, `posts_count`, `is_verified` for brand/channel enrich.
NB: an X mapper already exists for the Apify path (`twitter-scraper.client.ts` →
`mapTweetToPlatformPost`) and is the same target shape.

### Facebook (`gd_lkaxegm826bjpoo9m5`) — VERIFIED (50 posts, 46 w/ attachments, 20 w/ images)

Page-level. `num_of_posts` caps the run; `posts_to_not_include[]` is an incremental-dedup
hint (pass already-synced `externalId`s); `start_date`/`end_date` window. Async.

| platform_post | Facebook field | notes |
|---|---|---|
| `externalId` | `post_id` | |
| `externalUrl` | `url` | |
| `text` | `content` | |
| `publishedAt` | `date_posted` | |
| `media` | `attachments[]` (`{type:Video/Photo, url}`) — canonical; `post_image`, `post_external_image`, `header_image` | |
| `stats.likes` | `likes` (or `num_likes_type.num`) | `count_reactions_type` has the full reaction breakdown |
| `stats.comments` | `num_comments` | |
| `stats.shares` | `num_shares` | |
| `stats.views` | `video_view_count` / `play_count` | video posts only |
| `username` | `page_name` / `profile_handle` | |
| `externalKind` | `post_type` | |
| `metadata` | `hashtags`, `count_reactions_type`, `is_sponsored`, `original_post`, `link_description_text` | |

Also surfaces `page_followers`, `page_is_verified`, `page_category`, `about` for brand enrich.

---

## Cross-cutting notes for the eventual implementation

1. **Reuse `content-sync.service.ts`'s pipeline.** It already does dedup-by-`externalId`,
   batched inserts, and `rehostPosters()` → R2 for expiring CDN media. A peer scraper just
   swaps the source (Bright Data) for the post rows. Social CDN URLs (IG/TikTok especially)
   expire — rehosting is mandatory for durable media.
2. **Peer brands need handles per platform.** Reference brands currently have no `channel`
   rows and no stored handles. Decide where the company/profile URLs live (lightweight
   `channel` rows for reference brands, or a `handles` JSONB on `brand`). The profile-level
   scrapers key off these URLs.
3. **Filter discovery-error rows** (`{error, error_code}`) before mapping.
4. **`num_of_posts` / date windows** keep cost down — Bright Data bills per record.
5. **Async datasets** (LinkedIn, X, Facebook) can't run inside a short request — use a
   background job / Vercel function with the snapshot poll, or fire-and-store the snapshot_id
   and reconcile on a cron.

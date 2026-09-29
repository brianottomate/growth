# Media originals and renditions

## Where media lives

Library media is stored on Cloudflare R2 (`src/server/clients/r2.client.ts`).
The browser uploads straight to R2 with a presigned PUT, so no Vercel function
sits in the byte path and the 4.5 MB function body limit does not apply. Our own
caps are in `src/lib/media-accept.ts`: 25 MB per image, 250 MB per video. R2
itself takes far larger single uploads, so raising a cap is a one-line change.

Files are served from `R2_PUBLIC_BASE_URL`, which is the bucket's `r2.dev`
domain. Cloudflare rate-limits `r2.dev`, says it is for development only, and
keeps caching and Image Resizing for buckets behind a custom domain. Platforms
fetch our videos from this URL at publish time, so a custom domain is worth
doing before volume grows.

## Originals stay untouched

The uploaded file is the canonical source. Downloads, re-crops and future
channels start from it.

- Source assets are reused for different crops and channels.
- Generic pre-compression is less valuable than controlling the final crop and
  aspect ratio for a specific post.

## Images

The library and lightbox use Next Image, which generates and caches responsive
variants on demand; the database stores none of them. At upload the browser
also writes a 640px WebP tile beside the original (`<key>.thumb.webp`), which
`media_asset.thumbnail_url` points at. External linked thumbnails stay plain
images because their hosts are not broadly allowlisted.

## Video renditions

Editors export masters that platforms reject: the Chalets Reels from DaVinci
Resolve were 2160×3840 HEVC 10-bit at 25–28 Mbps with the moov atom at the end.
Meta's Reels API caps width at 1920 px and bitrate at 25 Mbps, and Zernio lists
H.264 1080×1920 for Reels, Stories and TikTok. Zernio compresses only files over
a platform's size limit, so a 50 MB 4K master reaches Meta as it is.

So the server cuts renditions after every video upload and keeps the master:

| Rendition | What | Used by |
|---|---|---|
| `delivery` | source aspect, H.264 High, CRF 20 capped at 12 Mbps, AAC 128k, faststart; at most 1080×1920 portrait or 1920×1080 landscape, never upscaled | every organic publish (Reels, Stories, TikTok, feed video); the Stories/Reels file of a video ad |
| `feed` | 4:5 center crop at 1080×1350, cut only from sources taller than 4:5 | the feed file of a video ad |
| `deliveryPoster`, `feedPoster` | JPEG one second in | Meta's required video thumbnail; the library tile when the browser could not cut one |

Renditions are recorded on `media_asset.metadata.renditions` (typed as
`VideoRenditions` in `src/lib/video-renditions.ts`), with R2 keys derived from
the original's: `<key>.delivery.mp4`, `<key>.feed.mp4`, `<key>.delivery.jpg`,
`<key>.feed.jpg`. They live in metadata rather than a `media_rendition` table
because nothing queries them across assets yet; move them to a table when
something does. The same run fills the asset's `width`, `height` and `duration`.

**Where it runs.** `POST /api/media/renditions` (session + organization
membership) returns 202 and cuts in `after()`. The upload hook calls it the
moment a video finalizes. `GET` on the same route is an hourly Vercel Cron
sweep on `:00` (a mark the lead sync already wakes Neon for) that picks up
videos that arrived another way or whose run died. `ffmpeg-static` ships only in
this function (`outputFileTracingIncludes` in `next.config.ts`); the linux-x64
binary is about 75 MB against the 250 MB function limit.

**Cost and limits.** One decode feeds both outputs. On 2 threads the 24 s Falls
master took 33 s with `-preset veryfast` (46 s with `medium`, same size under the
12 Mbps cap). Fluid compute defaults to 1 vCPU and allows 800 s, so clips over
180 s are refused rather than risking a timeout. Output goes to the function's
temp directory and streams to R2.

**Reading them.** `src/server/services/video-delivery.service.ts` holds the
read side, apart from the ffmpeg code so publishing and ads never import it:

- `deliveryMediaFor` swaps a library video for its `delivery` file at publish
  time and refuses while a run is still `processing`, so a Reel never goes out
  as the 4K master. Videos without renditions (legacy rows, external URLs) pass
  through unchanged.
- `videoAdCardFor` builds a video ad card from the renditions: the 4:5 `feed`
  file as the card and the 9:16 `delivery` file as its `story`. The Meta push
  sends them as one ad with placement assets (`defaultVideoUrl` for feeds, a
  rule pinning the 9:16 to Stories and Reels).

## Deferred

- Image renditions (`thumbnail`, `working`) as persisted files, when library
  transfer or analysis fetch time becomes noticeable. Generate with Sharp; `sips`
  is macOS-only.
- A crop offset per video, for masters whose burned-in text sits near an edge.
  The center crop keeps the hook in all five Chalets masters.
- Checking a publish against each format's ratio and duration
  (`src/server/content/formats.ts` declares them; nothing reads them yet).

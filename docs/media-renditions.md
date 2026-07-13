# Media originals and renditions

## Current decision

the growth workspace keeps the exact uploaded file as the canonical media source in Vercel
Blob. Downloads and publishing workflows use that original.

The Media library and lightbox use Next Image for hosted Blob images. Next/Vercel
generates and caches responsive delivery variants for the requested display size;
the database does not currently store those transient variants. External linked
thumbnails remain plain images because their hosts are not broadly allowlisted.

This gives the library responsive `srcset` delivery without destructively
compressing uploads or adding an image-processing job.

## Why originals remain unchanged

- Source assets may be reused for different crops and future channels.
- Instagram, X, LinkedIn, and other platforms perform their own final encoding.
- A 2–3 MB, roughly 1700px-wide source is reasonable raw media.
- Generic pre-compression is less valuable than controlling the final crop and
  aspect ratio for a specific post.

## Deferred rendition system

If library or automation volume justifies it, generate persistent derivatives
while retaining the original:

- `thumbnail`: about 480px WebP for library grids.
- `working`: about 1600–2000px WebP/JPEG for AI analysis, lightboxes, and drafts.
- `original`: untouched download and publishing source.

`media_asset.thumbnail_url` can hold the first persistent thumbnail. If multiple
renditions become necessary, add a dedicated `media_rendition` table rather than
adding a column for every size. Server-side generation should use Sharp; `sips`
is useful for local one-offs but is macOS-only and unavailable in Vercel's Linux
runtime.

## Revisit triggers

Build persistent renditions when one or more of these becomes material:

- Media-library transfer or image-optimization cost is noticeable.
- Libraries routinely contain hundreds or thousands of large images.
- On-demand AI analysis spends meaningful time fetching originals.
- Automated publishing needs deterministic social crops such as 1080×1350 or
  1080×1920.
- Video needs poster generation or transcoded preview variants.

Until then, responsive Next Image delivery plus preserved originals is the
smallest useful system.

# Prospect unit extraction (verbatim port material)

Source: `wander/src/wos-saas/module/src/logic/website/prospect-enrichment/`. Read 2026-08-03.

Pipeline order: select-listing-pages → `extractPropertiesFromPages` (extract-source-assets) → `dropJunkUnits` (sanity-check-units) → `fillUnitDetailsFromNames` / `applyPriceEstimates` (infer-unit-details) → `buildGalleryUnits` (persist-extracted-units, uses rehost-images) → gallery served via prospect-search override.

## 1. `extract-source-assets.ts`

### EXTRACTION_PROMPT (verbatim)

```typescript
const EXTRACTION_PROMPT =
  "You are reading the markdown of one page from a vacation-rental manager's website. " +
  'Extract every rental listing the page presents. For each: the name exactly as written (required), ' +
  'location, nightly price in dollars, currency, star rating, bedrooms, beds, and baths. ' +
  'Prices may appear as "from $X", "starting at $X", "$X/night" or just "$X" — any of those is the ' +
  'nightly price. For a range ("$200-$400") use the lower bound. ' +
  'Price and rating must be figures the page actually prints — never infer those. ' +
  'Bedrooms, beds and baths are different: work them out from whatever the page shows. A room ' +
  'list, a floor plan, a "sleeps 8", an amenities table or the listing title ("3BR Casita") all ' +
  'count, and a confident reading beats leaving the field empty — every card has to show a ' +
  'bedroom and bathroom count, so an omission becomes a wrong number downstream rather than a ' +
  'blank. Only leave them out when the page genuinely gives you nothing to go on. ' +
  'Navigation links, category pages and blog posts are not listings. ' +
  "When contact sheets of the page's images are supplied, also set `thumbnailIndex` to the tile " +
  'that best sells the stay at a glance — bright living spaces, exteriors, views, pools. Close-ups ' +
  'of objects, dark or cramped shots and hallways are poor choices. ' +
  'Return an empty properties array if the page presents no rental listings.';
```

Model: `anthropicClaudeSonnet5()` with `Output.object({ schema: ExtractedListings })`; system = EXTRACTION_PROMPT; user content = full page markdown + (when contact sheets exist) this text followed by the sheet images:

```
Contact sheets of this page's images follow, each tile labelled with its index into the image list. Use them to choose `thumbnailIndex` and to read room counts the copy omits.
```

One retry on failure (`askForListings().catch(askForListings)`) — structured output intermittently returns double-encoded JSON.

### Zod schemas (verbatim)

```typescript
/**
 * Loose on purpose (coerce + optional + passthrough), matching `rank-card-thumbnails`: a field
 * the model drifts on must cost one listing, not reject the page. Every number is re-checked
 * against the page's own text by `groundNumericClaims` below, so this schema is a shape
 * contract, not a truth claim.
 */
const ExtractedListing = z
  .object({
    name: z.string().describe('The listing name exactly as the page presents it'),
    location: z.string().optional().describe('City, state, or neighborhood'),
    price: z.coerce.number().optional().describe('Nightly price in dollars, as a number'),
    currency: z.string().optional(),
    rating: z.coerce.number().optional().describe('Star rating out of 5'),
    bedrooms: z.coerce.number().optional(),
    beds: z.coerce.number().optional(),
    baths: z.coerce.number().optional(),
    thumbnailIndex: z.coerce
      .number()
      .optional()
      .describe("Index into the page's image list of the photo that best sells this stay"),
  })
  .passthrough();
const ExtractedListings = z.object({ properties: z.array(ExtractedListing) });
```

Wire shape (schemas package, `workflow/marketing.ts`, verbatim — Temporal validates this at activity boundaries):

```typescript
export const ProspectExtractedSourcePropertySchema = z.object({
  name: z.string(),
  location: z.string().optional(),
  images: z.array(z.object({ src: z.string(), alt: z.string() })),
  price: z.number().nullable(),
  /** Set when `price` is a labeled estimate rather than a figure printed on their own page. */
  priceEstimated: z.boolean().optional(),
  currency: z.string().optional(),
  rating: z.number().nullable(),
  features: z.object({ bedrooms: z.number(), beds: z.number(), baths: z.number() }).nullable(),
});
```

### `groundNumericClaims` (verbatim — short enough to keep exact)

```typescript
/**
 * The JSON extraction runs on an LLM, which fills gaps with plausible values when a page
 * lists property names without per-property numbers (learned on Beavers Bend: a fabricated
 * 5.0→4.5 rating ladder over a bare unit-picker dropdown). Ground the highest-harm claims —
 * price and rating — against the page's literal text: a number that isn't printed on the
 * page is dropped, never shown to the prospect.
 */
export function groundNumericClaims(property: ExtractedSourceProperty, pageText: string): ExtractedSourceProperty {
  if (!pageText) {
    return { ...property, price: null, rating: null };
  }
  const priceGrounded =
    property.price != null &&
    (pageText.includes(`$${Math.round(property.price)}`) ||
      pageText.includes(`$${Math.round(property.price).toLocaleString('en-US')}`));
  const ratingGrounded =
    property.rating != null &&
    (Number.isInteger(property.rating)
      ? new RegExp(`\\b${property.rating}(?:\\.0)?\\s*(?:star|/\\s*5|★|out of)`, 'i').test(pageText) ||
        pageText.includes(`${property.rating}.0`)
      : pageText.includes(property.rating.toString()));
  return {
    ...property,
    price: priceGrounded ? property.price : null,
    rating: ratingGrounded ? property.rating : null,
  };
}
```

Logic summary: no page text → drop both price and rating. Price kept only if the literal `$<rounded>` (plain or en-US thousands-separated) appears in the page text. Integer ratings kept only if followed by star/"/5"/★/"out of" wording or printed as "N.0"; fractional ratings kept if their exact string appears.

### Image filter constants (verbatim)

```typescript
// Third-party badge/icon assets sit on PM detail pages ("best viewed in", app-store
// buttons, browser-download badges) and are real, loadable images — so they survive
// rehosting and render as property photos (live case: Firefox/Chrome logos as cabin cards
// on Broken Bow). Reject by filename vocabulary, alongside logos/icons/favicons.
const JUNK_IMAGE_PATTERN =
  /\b(?:logo|icon|favicon|firefox|chrome|safari|edge|opera|browser|app[-_]?store|google[-_]?play|play[-_]?store|badge|powered[-_]?by|best[-_]?viewed|sprite|placeholder|spinner|loader|avatars?|driftt)\b/i;

const MAP_TILE_PATTERN = /(^|\.)tile\.|tiles?\.|openstreetmap|mapbox|maptiler|googleapis\.com\/maps|basemaps?\./i;
const MAX_PAGE_IMAGE_CANDIDATES = 12;

const isPageImageCandidate = (url: string): boolean =>
  url.startsWith('http') && !JUNK_IMAGE_PATTERN.test(url) && !MAP_TILE_PATTERN.test(url) && !/\.svg(\?|#|$)/i.test(url);

function usablePageImages(images: string[] | undefined): string[] {
  return (images ?? []).filter(isPageImageCandidate).slice(0, MAX_PAGE_IMAGE_CANDIDATES);
}
```

Note: no file-extension requirement (extensionless CDN photos like `uc.orez.io/i/<hash>-Large` must survive). SVGs rejected. `metadata.ogImage` is prepended to the candidate list when present.

### Other load-bearing details

- Firecrawl scrape options per page: `formats: ['markdown', 'images']`, `onlyMainContent: false`, `blockAds: true`, `waitFor: 4000`, `timeout: 60_000`, `maxAge: 86_400_000`. Bot-challenge detection (`CHALLENGE_PATTERN` below) escalates to `proxy: 'stealth'` on a 200-interstitial:

```typescript
const CHALLENGE_PATTERN =
  /attention required!?\s*\|\s*cloudflare|cf-challenge|just a moment\.\.\.|enable javascript and cookies to continue/i;
```

- Dedup of CDN resize variants (`dedupeByUnderlyingPhoto`): key = `source` query param when present (rezfusion/imgix proxy), else `origin + pathname` with trackhs `/x{n}/` segments stripped; largest `width|w` query param wins.
- `&amp;` in scraped image URLs is entity-decoded back to `&` before filtering.
- `leadWithChosenThumbnail` resolves `thumbnailIndex` against the ORIGINAL shown list, then moves that URL to the front of the surviving deduped list; unresolvable picks leave order alone.
- `toFeatures`: each of bedrooms/beds/baths narrowed independently to number; all-missing → `features: null`; otherwise missing siblings become `0`.
- `price`/`rating` ≤ 0 → `null` ("no price found", not a rate).
- Duplicate names across pages are skipped (`seen` set).
- `MAX_RETURNED_PAGE_TEXT = 32_000` caps the CONCATENATED page text returned (Temporal ~2MB payload limit); each page's full markdown still goes to inference.

## 2. `sanity-check-units.ts` — junk-unit filter

Schema (verbatim):

```typescript
const JunkVerdicts = z.object({
  junk: z
    .array(z.string())
    .describe(
      'EXACT names from the list that are clearly NOT individual rentable properties. When unsure, leave the name out.'
    ),
});
```

Prompt (verbatim — joined with `'\n'`; `roster` is one line per named unit: `- ${name}${price}${features}` where price is `` ` | $${price}` `` or `' | no price'` and features is `` ` | ${bedrooms}bd/${baths}ba` `` or `' | no bed/bath data'`):

```typescript
prompt: [
  "Below are names scraped from a vacation-rental manager's site, each presented as an individual rentable property. Some are actually CATEGORY pages, booking paths, or SEO landing pages in disguise.",
  '',
  'Real property names are specific: "Knot A Basic Beach House", "Amazing Grace", "BREEZY RETREAT – 1 Bedroom Corner Oceanfront #701".',
  'Junk names describe a CLASS of inventory or a way to book: "Weekly Vacation Stays", "Pet Friendly Rentals", "Lido Key Rentals with a Private Pool", "1 Bedroom Best Rate", "Waterfront Rentals in <place>".',
  '',
  'List ONLY the clearly-junk names, exactly as written. A quirky-but-specific name is a real property — when in doubt, leave it out.',
  '',
  roster,
].join('\n'),
```

Behavior: model `anthropicClaudeSonnet5()`, one retry. Skips entirely when fewer than 2 named units. Conservative: only clear non-properties dropped; any error keeps all units. If filtering starves the grid below the composition floor, aborting is the CORRECT outcome.

## 3. `infer-unit-details.ts` — regex table + price estimates

Regexes (verbatim):

```typescript
const NAME_BEDROOMS = /(\d+)\s*(?:bed(?:room)?s?|br)\b/i;
const NAME_BATHS = /(\d+(?:\.\d)?)\s*(?:bath(?:room)?s?|ba)\b/i;
```

`fillUnitDetailsFromNames` (deterministic, no model): if `features.bedrooms > 0` keep as-is (zero = "unknown", not studio); otherwise match `NAME_BEDROOMS` against the unit NAME only; on match set `{ bedrooms: n, beds: n, baths: NAME_BATHS match or 0 }`.

`applyPriceEstimates` — fills only `price == null` units, in order of preference:
1. Site has any real prices: median of same-bedroom-count units, else overall median; rounded via `roundTo5 = Math.max(50, Math.round(value / 5) * 5)`.
2. No real prices but page text exists: one Sonnet 5 structured call. Schema and prompt (verbatim):

```typescript
const EstimatedPrices = z.object({
  units: z
    .array(z.object({ name: z.string().describe('EXACT unit name'), pricePerNight: z.number() }))
    .describe('One entry per listed unit, plausible market nightly rate in USD, round numbers.'),
});
```

```typescript
prompt: [
  `Estimate a plausible nightly rate (USD, round to $5) for each vacation rental below, managed by "${businessName}". Use the market/region and any pricing signals in their listing text; scale by bedroom count. These render as clearly-labeled ESTIMATES — aim for believable, slightly conservative numbers.`,
  '',
  `Units:\n${missing
    .map((property) => `- ${property.name}${property.features ? ` (${property.features.bedrooms}bd)` : ''}`)
    .join('\n')}`,
  '',
  `Their listing text (market context):\n${pageText.slice(0, 6000)}`,
].join('\n'),
```

Model estimates capped at 2000 before rounding (`roundTo5(Math.min(unit.pricePerNight, 2000))`), only accepted for names actually in the missing set with `pricePerNight > 0`. Filled entries get `priceEstimated: true` (persisted; the card deliberately does NOT label them per 2026-07-31 product call — flag kept as the only record of invented prices). Errors leave prices empty.

## 4. `persist-extracted-units.ts`

### `rankAndTrim` (verbatim)

```typescript
/**
 * How many cards the gallery shows. Lives here, with the code that builds the cards, rather than
 * in the extraction layer: how much we fetch is a spend decision, how much we display is not.
 */
const MAX_GALLERY_UNITS = 10;

/**
 * Order by "can this be a card at all", then by rating DESC (unrated to the back, extraction order
 * as tiebreaker), then trim to the gallery's size.
 *
 * Having a photo outranks rating because a photo-less unit cannot render a card — it is dropped
 * below, so a slot spent on one is a slot the gallery never gets back, and a rating-first trim
 * therefore ships a short gallery whenever extraction returns more listings than photos. Among
 * units that CAN render, rating is the right order — PM sites curate top-sellers roughly by rating.
 */
function rankAndTrim(properties: ExtractedSourceProperty[]): ExtractedSourceProperty[] {
  const indexed = properties.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => {
    const aRenders = a.p.images.length > 0;
    const bRenders = b.p.images.length > 0;
    if (aRenders !== bRenders) {
      return aRenders ? -1 : 1;
    }
    if (a.p.rating != null && b.p.rating != null) {
      return b.p.rating - a.p.rating;
    }
    if (a.p.rating != null) {
      return -1;
    }
    if (b.p.rating != null) {
      return 1;
    }
    return a.i - b.i;
  });
  return indexed.slice(0, MAX_GALLERY_UNITS).map(({ p }) => p);
}
```

### `ProspectExtractedUnit` shape (`prospect-search.ts`, verbatim)

```typescript
export const ProspectExtractedUnit = z.object({
  name: z.string(),
  slug: z.string().optional(),
  imageUrls: z.array(z.string().url()).min(1),
  bedrooms: z.number().nonnegative().optional(),
  bathrooms: z.number().positive().optional(),
  occupancy: z.number().int().positive().optional(),
  pricePerNight: z.number().positive().optional(),
  priceEstimated: z.boolean().optional(),
  unitType: z.enum(['SINGLE_FAMILY_RESIDENCE', 'CONDO', 'TOWNHOME', 'CABIN', 'VILLA', 'APARTMENT', 'OTHER']).optional(),
  // Fuzzy display fields — plausible, not exact (filled by a GenAI pass at build time so the
  // card doesn't read "Studio · New"). Rating/reviews are social-proof dressing on a preview.
  overallRating: z.number().min(0).max(5).optional(),
  totalReviews: z.number().int().nonnegative().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});
export type ProspectExtractedUnit = z.infer<typeof ProspectExtractedUnit>;

export const ProspectExtractedUnits = ProspectExtractedUnit.array();
```

### Mapping + persistence details

- `buildGalleryUnits`: `rankAndTrim` first, then rehosts only the first 3 images per unit (`property.images.slice(0, 3)`) via `rehostProspectImages(websiteId, urls)`, maps via `toGalleryUnits`, persists.
- `toGalleryUnits`: keeps only images that successfully rehosted; a unit with zero hosted images is dropped ("a card with no photo reads as broken"). `bedrooms`/`bathrooms` only set when `> 0` (zero = unknown → omit). `priceEstimated` spread in only when true. `location` renamed to `city` at the end (`.map(({ location, ...unit }) => ({ ...unit, city: location }))`).
- `persistExtractedUnits`: `ProspectExtractedUnits.safeParse` first; on failure logs first 3 issues and leaves the DB column untouched (returns 0) — never fails enrichment over the gallery. On success: `db.saasWebsiteProspect.update({ where: { id: prospectId }, data: { extractedUnits: parsed.data } })`, returns count.

## 5. `img-grid.ts` — sharp contact-sheet parameters

Constants (verbatim):

```typescript
/** Contact-sheet tiles are downscaled to TILE_WIDTH anyway, so this only bounds what we buffer. */
const MAX_IMAGE_BYTES = 15_000_000;
const FETCH_TIMEOUT_MS = 20_000;

const TILE_WIDTH = 320;
const TILE_HEIGHT = 200;
const LABEL_HEIGHT = 24;
const GAP = 6;
const COLUMNS = 3;
const MAX_TILES_PER_SHEET = 12;
```

`composeImageGrids(tiles: {id, imageUrl}[])` → `Uint8Array[]` (JPEG sheets):

- Per tile: fetch via `safeFetchBytesWithUnblocker` (SSRF-safe, byte-capped, content-type must start with `image/`); `sharp(bytes, { limitInputPixels: SHARP_MAX_INPUT_PIXELS }).resize(320, 200, { fit: 'cover' })`; composited onto a `320 × 224` (`TILE_HEIGHT + LABEL_HEIGHT`) 3-channel `#111111` canvas with the photo at `top: 24` and an SVG label banner at top. Failed tiles are skipped (their IDs never appear).
- Label SVG (verbatim):

```typescript
function labelSvg(id: string): string {
  const safeId = id.replace(/[<>&"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_WIDTH}" height="${LABEL_HEIGHT}"><rect width="100%" height="100%" fill="#111111"/><text x="8" y="17" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="bold" fill="#ffffff">${safeId}</text></svg>`;
}
```

- Sheets: chunks of 12 tiles, 3 columns; canvas `width = COLUMNS * (TILE_WIDTH + GAP) + GAP` (= 984), `height = rows * (TILE_HEIGHT + LABEL_HEIGHT + GAP) + GAP`; background `#ffffff`, 3 channels; tile at `left = GAP + (index % 3) * 326`, `top = GAP + floor(index / 3) * 230`; output `.jpeg({ quality: 80 })`.
- `SHARP_MAX_INPUT_PIXELS = 64_000_000` (from `site-editor/shared/sharp-defaults.ts` — hard ceiling on decoded pixels for untrusted bytes; sharp's default ~268MP would let a ≤15MB compressed image inflate to ~1GB RGBA). The worker also runs `sharp.cache(false); sharp.concurrency(1)` (`configureSharpForWorker`).

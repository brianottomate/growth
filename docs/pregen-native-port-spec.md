# Pregen-native port spec — monolith site-builder pipeline map

> Extracted 2026-08-03 from wandercom/wander (read-only). This is the reference
> for implementing `src/server/services/pregen/steps/*`. Paths are monolith paths.
> V0 scope: HOMEPAGE only + build-time property grid (no property pages, no search).
>
> **Status 2026-08-11:** V0 shipped and E2E-proven 2026-08-03 (growth pipeline +
> standalone renderer). Production outreach currently runs on the MONOLITH build
> path (`POST /internal/prospects` → `siteEditorOnboarding`); this native
> pipeline is the generation-quality lab. The direction this doc serves long
> term: keep porting the builder into growth until the monolith's prospect job
> can take the finished artifact as INPUT (persist, preview, claim, post-claim
> lifecycle) instead of building. The `persist_artifact` divergence row below is
> the main contract to settle when that inversion happens.

## What V0 ports (and what it skips)

The monolith onboarding workflow (`siteEditorOnboarding`, Temporal queue
`saas-site-editor`) fans out ~12 parallel activities and builds every page via
child workflows. V0 ports the homepage-relevant slice only:

| V0 step | Monolith source | Model |
|---|---|---|
| crawl (homepage fetch) | `logic/website/site-editor/fetch-existing-site-page/index.ts` — here: one Firecrawl scrape (`formats: ['rawHtml','markdown']`, `waitFor: 3000`, `timeout: 60s`, `proxy: 'auto'`), markdown cap 15k chars, image candidates + og/json-ld fallbacks | — |
| crawl (listing pages) | prospect-enrichment steps 3–4: select listing pages from discovered property URLs (Sonnet, `MAX_LISTING_PAGES = 20`, prompt in `logic/website/prospect-enrichment/select-listing-pages.ts` L13-37), then per-page Firecrawl scrape (`formats: ['markdown','images']`, `blockAds`, `waitFor: 4000`, `maxAge: 86_400_000`, stealth-proxy retry) | Sonnet |
| plan (brand kit) | `siteEditorEvaluateHomepage` → `logic/website/site-editor/evaluate-homepage/` (`extract-business-context.ts` = Haiku; `extract-branding.ts` = CSS/non-LLM). Output: businessName, locations, propertyTypes, inventoryMode, voiceBrief, legacySiteBranding | Haiku 4.5 |
| generate_sections (homepage copy) | Templated path: homepage template (`logic/website/site-editor/templates/*` via `buildTemplateForKind`) + `generate-copy/` — **template owns structure, model owns copy**. `schema.ts` builds a per-writable-section Zod tuple (`getCopySchema`/`buildCopySchema`); `prompt.ts` (`buildPrompt` L40) = brand framing + kind framing + layout + tone + anti-fabrication; `merge.ts` splats copy over template, `''` skipped, re-parse through `PageSections` | Haiku 4.5, temp 0.2, 16k out |
| inject_properties (unit extraction) | prospect-enrichment: `extract-source-assets.ts` (Sonnet over markdown + **img-grid contact sheets** — sharp, 320×200, 3 cols, 12/sheet — model picks `thumbnailIndex`), `groundNumericClaims` drops unprinted prices/ratings; `sanity-check-units.ts` junk filter (Sonnet, names-only); `infer-unit-details.ts` regex; `rankAndTrim` photo-first, `MAX_GALLERY_UNITS = 10`, `MIN_GALLERY_UNITS = 3` floor; images re-hosted to R2 (first 3 per unit, ≤15MB, reject <15KB placeholders) | Sonnet |
| persist_artifact | **Divergence from monolith**: monolith stores `sections Json[]` on `SaasWebsitePages` and answers the homepage's native `property-gallery` block from `extractedUnits` via a request-time search override (`prospect-search.ts` — org-less sites only). We have no live search endpoint, so units are materialized INTO the artifact at build time and the preview renderer feeds them to the gallery component as props | — |

Skipped in V0: palette/typography/apply-brand-styles (use extracted branding
directly or defaults), logo/favicon extraction (nice-to-have, cheap to add),
image prompt bank + image generation (gemini-2.5-flash-image), SEO fields,
remaining-pages fan-out, redirects, freeform/article paths, contact details.

## Key monolith facts

- **Models** (`packages/libraries/ai-systems/src/utils/providers.ts`): Haiku 4.5
  `claude-haiku-4-5-20251001` (copy, classification, extraction), Sonnet 4
  `claude-sonnet-4-6` (freeform selection, palette, typography), Sonnet 5
  `claude-sonnet-5` (prospect extraction/judges), `gemini-2.5-flash-image`
  (image gen). All via Vercel AI SDK `generateText` + `Output.object`.
- **Section schema**: `schemas/src/defs/website/pages-sections.ts` —
  `PageSections = z.union([...27 sections])`; validates every write. Our
  generated types in the preview app come from the same OpenAPI-inlined shapes.
- **Crawl output shape** (`SiteEditorExistingSitePage`): `{ url?, title?,
  description?, ogImageUrl?, heroVideoUrl?, markdown (≤15k), html?, images:
  {url, alt?, contextText?}[] } | null`. No screenshots.
- **Copy activity input**: `{ websiteId, pageId, pageKind?, tone, evaluation?,
  existingSitePage, fetchedHomepage?, ... }` — template read fresh from DB first.
- **Durability model**: retries per activity (backoff 2, 2s initial, 2-3
  attempts, startToClose 1-10 min). Our analogue: per-step retry inside the
  Fluid runner + resume-at-failed-step via the stepLog.
- **Prospect webhook**: enrichment settles → `sendProspectWebhook` with preview
  URL (this is what writes back to growth's `leads.pregen_build` today).

## Deliberately-read-later (needed for faithful copy quality)

- `generate-copy/schema.ts` L390-1083 — per-section copy field budgets
- `generate-copy/prompt.ts` L120-459 — kindFraming, audience blocks, FAQ preservation
- `templates/*.ts` (18 files) — structural stubs per page kind (V0 needs HOMEPAGE only)
- `build-freeform-sections/` — only if V1 adds non-templated pages

## Full pipeline map (reference)

The complete step graph, activity retry table, crawl multi-source discovery
(Spider/Semrush/DataForSEO/Firecrawl-map/WordPress/sitemap), classification
rules, and persistence funnel were mapped in detail on 2026-08-03; ask the
session transcript or re-run the exploration if a non-V0 slice gets ported.
Highlights: `MAX_CONCURRENT_PAGE_BUILDS = 4`; page budget 1000; BrightData
Web Unlocker escalation on bot challenges; Redis build-progress state with
local-activity fast path; `SaasWebsiteOnboardingDiscoveredUrl` as the crawl
ledger (the prospect flow reads its `IGNORED/property` rows to find listings).

# Homepage template (verbatim port material)

Source: `wander/src/wos-saas/module/src/logic/website/site-editor/templates/` (monolith, read 2026-08-03).

## Registry — `templates/registry.ts` (71 lines, verbatim)

```typescript
import type { PageSections, SaasWebsitePageKindType } from '@wos/saas-schemas';
import { buildAboutTemplate } from './about';
import { buildActivityIndexTemplate } from './activity-index';
import { buildAttractionIndexTemplate } from './attraction-index';
import { buildBlogIndexTemplate } from './blog-index';
import { buildContactTemplate } from './contact';
import { buildDefaultTemplate } from './default';
import { buildDiningIndexTemplate } from './dining-index';
import { buildEventIndexTemplate } from './event-index';
import { buildFaqTemplate } from './faq';
import { buildGalleryTemplate } from './gallery';
import { buildHomepageTemplate } from './homepage';
import { buildListWithUsTemplate } from './list-with-us';
import { buildMarketingTemplate } from './marketing';
import { buildPrivateEventTemplate } from './private-event';
import { buildPropertyCategoryTemplate } from './property-category';
import { buildPropertyCategoryIndexTemplate } from './property-category-index';
import { buildTicketsTemplate } from './tickets';

/**
 * Single source of truth for "give me the scaffold for kind X". Used by row-create paths
 * (`createStubbedHomepage`, `siteEditorStubPlannedPages`, the POST `/pages` endpoint) that don't
 * yet have real content to slot in. Callers that *do* have content (the import path in the
 * build-page workflow) bypass this and call `buildDefaultTemplate` directly with their extracted
 * values.
 */
export const buildTemplateForKind = (kind: SaasWebsitePageKindType): PageSections[] => {
  switch (kind) {
    case 'HOMEPAGE':
      return buildHomepageTemplate();
    case 'ABOUT':
      return buildAboutTemplate();
    case 'CONTACT':
      return buildContactTemplate();
    case 'FAQ':
      return buildFaqTemplate();
    case 'LIST_WITH_US':
      return buildListWithUsTemplate();
    case 'BLOG_INDEX':
      return buildBlogIndexTemplate();
    case 'ATTRACTION_INDEX':
      return buildAttractionIndexTemplate();
    case 'EVENT_INDEX':
      return buildEventIndexTemplate();
    case 'DINING_INDEX':
      return buildDiningIndexTemplate();
    case 'ACTIVITY_INDEX':
      return buildActivityIndexTemplate();
    case 'PROPERTY_CATEGORY_INDEX':
      return buildPropertyCategoryIndexTemplate();
    case 'PROPERTY_CATEGORY':
      return buildPropertyCategoryTemplate();
    case 'GALLERY':
      return buildGalleryTemplate();
    case 'TICKETS':
      return buildTicketsTemplate();
    case 'PRIVATE_EVENT':
      return buildPrivateEventTemplate();
    case 'BLOG':
    case 'ATTRACTION':
    case 'EVENT':
    case 'DINING':
    case 'ACTIVITY':
    case 'OTHER':
      return buildDefaultTemplate();
    case 'FREEFORM':
      return [];
  }
};
```

`templates/index.ts` is a single line: `export { buildTemplateForKind } from './registry';`

## HOMEPAGE template — `templates/homepage.ts` (60 lines, verbatim)

```typescript
import { PageSections } from '@wos/saas-schemas';

const PLACEHOLDER_IMAGE_URL = 'https://placehold.co/1x1/aaa/aaa';
const FEATURE_CARD_COUNT = 3;

export const buildHomepageTemplate = () =>
  PageSections.array().parse([
    {
      version: 0,
      type: 'homepage-hero',
      title: 'Welcome',
      description: 'Find a comfortable place to stay and plan your next trip with ease.',
      showPropertyGallery: false,
      backgroundImageUrl: PLACEHOLDER_IMAGE_URL,
      backgroundOpacity: 35,
    },
    {
      version: 0,
      type: 'property-gallery',
      title: 'Properties',
    },
    {
      version: 0,
      type: 'cards',
      variant: 'feature-image-cards-overlay',
      theme: 'accent-secondary-dark',
      title: 'Featured stays',
      subtitle: 'Thoughtful homes for relaxing getaways and memorable trips.',
      items: Array.from({ length: FEATURE_CARD_COUNT }, () => ({
        imageUrl: PLACEHOLDER_IMAGE_URL,
        eyebrow: 'Featured stay',
        title: 'Comfortable home',
      })),
    },
    {
      version: 1,
      type: 'reviews',
      disableable: true,
      disabled: false,
      eyebrow: 'Guest reviews',
      title: 'What our guests say',
      showFilters: true,
      showReviewsCount: true,
    },
    {
      version: 0,
      type: 'book-direct',
      readOnly: true,
    },
    {
      version: 0,
      type: 'cta',
      variant: 'feature',
      eyebrow: 'Ready to travel',
      title: 'Plan your next stay',
      ctaText: 'Browse stays',
      ctaLink: '/s',
      backgroundImageUrl: PLACEHOLDER_IMAGE_URL,
    },
  ]);
```

## Writable vs structural

There is no explicit per-field "writable" flag on the template. Writability is derived at copy-generation time (`generate-copy/schema.ts`, see `generate-copy-schema.md`):

- `buildCopyGenerationPlan` includes a section only when it is not disabled (`'disabled' in section && section.disabled` excludes it) AND its copy schema's `promptHint` is non-empty.
- `book-direct` maps to the `EMPTY` copy schema (no writable fields) and additionally carries `readOnly: true` in the template — it is purely structural.
- The `reviews` section here (`version: 1`, no `variant`) IS writable: it yields `{ eyebrow, title }` per the `reviews` schema builder. Its `disableable: true, disabled: false` flags control section on/off, not writability.
- Structural fields never asked of the copy model (per the prompt): image URLs, CTA links, layout flags (`showPropertyGallery`, `backgroundOpacity`, `theme`, `showFilters`, `showReviewsCount`), form schemas. These are populated separately (images by the image picker, links by the template).

Writable sections/fields for this homepage, in order:

| # | section | writable copy fields |
|---|---------|----------------------|
| 1 | `homepage-hero` | `title`, `description` |
| 2 | `property-gallery` | `title` |
| 3 | `cards` (feature-image-cards-overlay) | `title`, `subtitle`, `items[3].{eyebrow,title}` (no item description for the overlay variant) |
| 4 | `reviews` (v1) | `eyebrow`, `title` |
| 5 | `book-direct` | — (readOnly, EMPTY schema, excluded) |
| 6 | `cta` (feature) | `eyebrow`, `title`, `ctaText` (no `text` for the feature variant) |

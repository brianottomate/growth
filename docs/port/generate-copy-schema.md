# Copy-generation schema (verbatim port material)

Source: `wander/src/wos-saas/module/src/logic/website/site-editor/generate-copy/schema.ts` (1083 lines). Read 2026-08-03.

Contents: the full machinery (types, helpers, `ALLOWED_ICON_NAMES`, `getCopySchema`, `buildCopyGenerationPlan`, `buildCopySchema`) plus the per-section builders for every section type the HOMEPAGE template uses (`homepage-hero`, `property-gallery`, `cards`/`feature-image-cards-overlay`, `reviews`, `cta`; `book-direct` maps to `EMPTY`).

## Machinery (verbatim)

```typescript
import type { PageSections, SaasWebsitePageKindType } from '@wos/saas-schemas';
import { z } from 'zod';

/**
 * One entry per section kind/variant. Each builder returns the Zod schema describing the copy
 * fields the model is asked to emit (no URLs, no structural fields) and the `promptHint` lines
 * embedded under that section in the prompt. Item counts read from the template's stub so the
 * schema and the prompt always agree on what the model should emit.
 *
 * Sections without writable copy (book-direct, search-bar, html, form, plain reviews variants)
 * get an empty schema + empty hint and are excluded from copy generation.
 */
type CopySchema = {
  schema: z.ZodTypeAny;
  promptHint: string[];
};

const optString = () => z.string().optional();
```

### `ALLOWED_ICON_NAMES` (verbatim, complete)

```typescript
/**
 * The set of Wander design-system icon names supported by the frontend Icon component. Any name
 * not in this list renders as invisible (null), so model-emitted icons are constrained to it and
 * fall back to 'star'. Source of truth: the `@wandercom/design-system-icons` package plus the
 * icon picker list in app.wander.com (src/components/custom/IconPicker/IconPickerIcons.ts).
 */
const ALLOWED_ICON_NAMES = [
  'accessibility',
  'air-conditioning',
  'air-fryer',
  'air-hockey',
  'alarm',
  'allow-pets',
  'amenities',
  'archive',
  'arrow-refresh',
  'audio',
  'baby-carriage',
  'baby-gate',
  'badge-check',
  'badge-dollar-sign',
  'baking-sheet',
  'balcony',
  'baseball',
  'bath',
  'bathtub-towel',
  'beach-essentials',
  'beach-umbrella',
  'bed',
  'bell',
  'bicycle',
  'bidet',
  'blender',
  'boat',
  'book',
  'book-open',
  'bottle',
  'bowling',
  'box-taped',
  'brain',
  'bread',
  'brush-cleaning',
  'building',
  'building-2',
  'bus',
  'butler',
  'calendar',
  'calendar-add',
  'calendar-back',
  'calendar-check',
  'calendar-clock',
  'calendar-day-31',
  'calendar-day-one',
  'calendar-plus',
  'calendar-x',
  'camera',
  'campfire',
  'car',
  'car-ev',
  'car-taxi',
  'card',
  'cards',
  'chat',
  'chat-conversation',
  'check',
  'check-shield',
  'check-square',
  'checklist',
  'chess',
  'cigarette-slash',
  'circle-check',
  'circle-dollar',
  'circle-percentage',
  'cliffs',
  'climbing-wall',
  'clock',
  'closet',
  'clothes-hanger',
  'cloud-snow',
  'cloudy-sun-clouds',
  'coffee',
  'coffee-machine',
  'coins',
  'color-palette',
  'computer',
  'controller',
  'cornhole',
  'coupon',
  'crib',
  'cross',
  'crown',
  'cube',
  'cubes',
  'curtains',
  'dart',
  'diaper',
  'dishes',
  'dishwasher',
  'dog',
  'dollar',
  'door',
  'drill',
  'drink',
  'dumbbell',
  'earth',
  'elevator',
  'email',
  'event',
  'fan',
  'fan-2',
  'film',
  'fingerprint',
  'fire',
  'fireplace',
  'first-aid-kit',
  'fish',
  'flower',
  'food',
  'foosball-table',
  'footsteps',
  'forest',
  'fridge',
  'fridge-mini',
  'garden',
  'gift',
  'globe',
  'golf',
  'golf-2',
  'graduation',
  'grill',
  'grill-utensils',
  'gun',
  'hair-dryer',
  'hammer-screwdriver',
  'hammock',
  'hand-heart',
  'handshake',
  'hard-hat',
  'heart',
  'heart-broken',
  'heart-handshake',
  'heat',
  'helicopter-pad',
  'hockey',
  'home',
  'home-check',
  'home-energy',
  'hoodie',
  'hot-tub',
  'house',
  'house-2',
  'humidity',
  'image',
  'iron',
  'joystick',
  'kettle',
  'key',
  'kids',
  'kitchen',
  'kitchenette',
  'lightbulb',
  'linen',
  'lock',
  'lock-open',
  'lockbox',
  'map',
  'map-cursor',
  'map-pin',
  'map-route',
  'medal',
  'meditation',
  'megaphone',
  'microphone',
  'microwave',
  'mobile',
  'money',
  'moon',
  'mug',
  'music',
  'no-pets',
  'note',
  'ocean',
  'oven',
  'pan',
  'paperclip',
  'parking',
  'parking-paid',
  'phone',
  'phone-off',
  'piano',
  'pillow',
  'pinball',
  'pizza',
  'plane',
  'plane-arrival',
  'plane-departure',
  'playing-cards',
  'pool',
  'pool-table',
  'power',
  'private-chef',
  'private-crew',
  'projector',
  'receipt',
  'recorder',
  'recycle',
  'restaurant',
  'rice-cooker',
  'rocket',
  'shield',
  'shopping-cart',
  'shower',
  'signal-tower',
  'skateboard',
  'ski',
  'skyscraper',
  'smart-home',
  'smart-mattress',
  'soccer-field',
  'sparkles',
  'sparkles-2',
  'speakers-stand',
  'spray-bottle',
  'stamp',
  'star',
  'star-filled',
  'steamer',
  'stove',
  'suitcase',
  'sun',
  'surfboard',
  'table',
  'table-tennis-bat',
  'tag',
  'telescope',
  'temperature',
  'thumb-down',
  'thumb-up',
  'thunder',
  'timer',
  'toaster',
  'toilet',
  'train',
  'tv',
  'umbrella',
  'user',
  'user-circle',
  'user-face-id',
  'users',
  'utensils',
  'video',
  'washing-machine',
  'water',
  'waves',
  'weather-cloudy',
  'weather-rainy',
  'weather-windy',
  'webcam',
  'wifi',
  'wine-cellar',
  'wishlist-heart',
  'workspace',
  'wrench',
] as const;

const optIcon = () => z.enum(ALLOWED_ICON_NAMES).catch('star').optional();

const EMPTY: CopySchema = { schema: z.object({}).strict(), promptHint: [] };

const tuple = (schemas: z.ZodTypeAny[]) => {
  const [first, ...rest] = schemas;
  return first ? z.tuple([first, ...rest]) : z.tuple([]);
};
```

### `getCopySchema` dispatcher (verbatim)

```typescript
/**
 * Looks up the copy schema for a template section. Falls back to `EMPTY` for kinds/variants we
 * don't ask the model to write copy for (search-bar, html, form, plain reviews variants).
 *
 * `pageKind` is threaded through so per-kind behaviors (e.g. FAQs preserved verbatim on FAQ
 * pages but synthesized everywhere else) can be applied at schema-build time.
 */
export const getCopySchema = (section: PageSections, pageKind?: SaasWebsitePageKindType): CopySchema => {
  switch (section.type) {
    case 'hero':
      return hero(section);
    case 'homepage-hero':
      return homepageHero();
    case 'content':
      return content(section);
    case 'reviews':
      return reviews(section);
    case 'metrics':
      return metrics(section);
    case 'property-gallery':
      return propertyGallery();
    case 'video':
      return video();
    case 'faqs':
      return faqs(section, pageKind);
    case 'feature-list':
      return featureList(section);
    case 'key-selling-points':
      return keySellingPoints(section);
    case 'photos':
      return photos(section);
    case 'cta':
      return cta(section);
    case 'blog-gallery':
      return blogGallery();
    case 'collection-gallery':
      return collectionGallery();
    case 'cards':
      return cards(section, pageKind);
    case 'testimonials':
      return testimonials(section);
    case 'categories':
      return categories(section);
    case 'logo-bar':
      return logoBar();
    case 'services':
      return services(section);
    case 'team':
      return team(section);
    case 'reviews-fallback':
      return reviewsFallback(section);
    case 'intro-text':
      return introText();
    case 'book-direct':
    case 'lightbox-gallery':
    case 'search-bar':
    case 'html':
    case 'form':
      return EMPTY;
  }
};
```

### Plan + top-level schema builders (verbatim)

```typescript
/**
 * Selects the enabled template sections the model can actually write, retaining their original
 * indices so generated copy can be merged back into the full template after generation.
 */
export const buildCopyGenerationPlan = (template: PageSections[], pageKind?: SaasWebsitePageKindType) =>
  template.flatMap((section, templateIndex) =>
    isDisabledSection(section) || getCopySchema(section, pageKind).promptHint.length === 0
      ? []
      : [{ templateIndex, section }]
  );

const isDisabledSection = (section: PageSections) => 'disabled' in section && section.disabled;

/**
 * Builds the structured-output schema the model is asked to fill: a tuple containing only writable
 * sections. Strict-positional — if the model emits the wrong number of writable sections, or a
 * section with unknown keys, validation fails and the caller falls back to the template.
 */
export const buildCopySchema = (template: PageSections[], pageKind?: SaasWebsitePageKindType) => {
  const sectionSchemas = buildCopyGenerationPlan(template, pageKind).map(
    ({ section }) => getCopySchema(section, pageKind).schema
  );
  return z.object({
    sections: tuple(sectionSchemas),
  });
};
```

## Per-section builders used by the HOMEPAGE template (verbatim)

### `homepage-hero`

```typescript
const homepageHero = (): CopySchema => ({
  schema: z
    .object({
      title: optString(),
      description: optString(),
    })
    .strict(),
  promptHint: ['- title: 3–6 words', '- description: 1 sentence, ≤22 words'],
});
```

### `property-gallery`

```typescript
const propertyGallery = (): CopySchema => ({
  schema: z.object({ title: optString() }).strict(),
  promptHint: ['- title: 1–3 words'],
});
```

### `reviews` (homepage uses `version: 1`, no variant → the writable branch)

```typescript
const reviews = (section: Extract<PageSections, { type: 'reviews' }>): CopySchema => {
  if (section.variant === 'reviews-summary' || (section.version === 1 && section.variant === undefined)) {
    return {
      schema: z.object({ eyebrow: optString(), title: optString() }).strict(),
      promptHint: ['- eyebrow: 2–4 words', '- title: 3–6 words'],
    };
  }
  return EMPTY;
};
```

### `cards` dispatcher + `feature-image-cards-overlay` builder

The homepage uses variant `feature-image-cards-overlay`, which routes to `featureImageCards(count, includeItemDescription=false)` — the overlay variant omits per-item descriptions.

```typescript
const cards = (
  section: Extract<PageSections, { type: 'cards' }>,
  pageKind: SaasWebsitePageKindType | undefined
): CopySchema => {
  switch (section.variant) {
    case 'content-cards':
      return contentCards(section.cards?.length ?? 0);
    case 'feature-cards':
      return featureCards(section.cards ?? []);
    case 'feature-image-cards':
    case 'feature-image-cards-overlay':
    case 'feature-image-cards-centered':
      return featureImageCards(section.items.length, section.variant !== 'feature-image-cards-overlay');
    case 'call-to-action-cards':
      return callToActionCards(section.items?.length ?? 0, pageKind);
  }
};

const featureImageCards = (count: number, includeItemDescription: boolean): CopySchema => ({
  schema: z
    .object({
      title: optString(),
      subtitle: optString(),
      items: z
        .array(
          z
            .object({
              eyebrow: optString(),
              title: optString(),
              ...(includeItemDescription ? { description: optString() } : {}),
            })
            .strict()
        )
        .length(count),
    })
    .strict(),
  promptHint: [
    '- title: 3–6 words',
    '- subtitle: 1 sentence, ≤22 words',
    `- items: emit exactly ${count}`,
    '- per item — eyebrow: 2–4 words',
    '- per item — title: 2–5 words',
    ...(includeItemDescription ? ['- per item — description: 1 sentence, ≤16 words'] : []),
  ],
});
```

### `cta` (homepage uses `variant: 'feature'` → `text` excluded)

```typescript
const cta = (section: Extract<PageSections, { type: 'cta' }>): CopySchema => {
  // The `feature` variant renderer ignores `text`, so don't waste tokens generating it.
  const includeText = section.variant !== 'feature';

  return {
    schema: z
      .object({
        eyebrow: optString(),
        title: optString(),
        ...(includeText ? { text: optString() } : {}),
        ctaText: optString(),
      })
      .strict(),
    promptHint: [
      '- eyebrow: 2–4 words',
      '- title: 4–8 words',
      ...(includeText ? ['- text: 1 sentence, ≤22 words'] : []),
      '- ctaText: 2–4 words',
    ],
  };
};
```

### `book-direct`

Maps to `EMPTY` in the `getCopySchema` switch (no builder function) — excluded from the plan because `promptHint` is empty.

## Skipped section builders (not used by the HOMEPAGE template)

These builders exist in schema.ts but were NOT reproduced here because the homepage template never routes to them: `hero`, `content` (all variants), `metrics`, `video`, `faqs` (both branches), `featureList`, `keySellingPoints`, `photos` (both variants), `blogGallery`, `collectionGallery`, `introText`, `contentCards`, `featureCards`, `callToActionCardItem` / `callToActionCardItemsSchema` / `callToActionCardCountHint` / `callToActionCards`, `testimonials` (both variants), `categories`, `logoBar`, `services`, `team`, `reviewsFallback`.

Note the `cards` dispatcher above references `contentCards` / `featureCards` / `callToActionCards`; if you port the dispatcher verbatim you must either port those builders too or narrow the switch to the overlay variant.

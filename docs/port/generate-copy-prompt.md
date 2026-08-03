# Copy-generation prompt (verbatim port material)

Source: `wander/src/wos-saas/module/src/logic/website/site-editor/generate-copy/prompt.ts` (459 lines) plus the shared text blocks it imports from `../shared/copy-voice.ts` and small helpers. Read 2026-08-03.

Imports it depends on:
- `buildCopyGenerationPlan`, `getCopySchema` — see `generate-copy-schema.md`
- `formatLocationPhrase` — see `brand-kit.md` (location-context.ts)
- `formatFilters` (extract-property-filters/format) — PROPERTY_CATEGORY only, not needed for homepage
- `stripInlineImageMarkdown` — included at the bottom of this doc
- `buildVoiceBriefBlock`, `COPY_VOICE_RULES`, `EXISTING_COPY_PRESERVATION_GUIDANCE`, `EXISTING_VOICE_GUIDANCE` — included below

## `generate-copy/prompt.ts` (verbatim, entire file)

```typescript
import type {
  BrandKitTone,
  PagePropertyFilters,
  PageSections,
  SaasWebsitePageKindType,
  SiteEditorEvaluatedBrandKit,
  SiteEditorExistingSitePage,
  SiteEditorHierarchicalDetailPage,
} from '@wos/saas-schemas';
import { formatFilters } from '../extract-property-filters/format';
import { formatLocationPhrase } from '../evaluate-homepage/location-context';
import { stripInlineImageMarkdown } from '../html-to-markdown';
import {
  buildVoiceBriefBlock,
  COPY_VOICE_RULES,
  EXISTING_COPY_PRESERVATION_GUIDANCE,
  EXISTING_VOICE_GUIDANCE,
} from '../shared/copy-voice';
import { buildCopyGenerationPlan, getCopySchema } from './schema';

export type CopyCapitalization = 'sentence';

type BuildPromptInput = {
  pageKind?: SaasWebsitePageKindType;
  tone: BrandKitTone;
  evaluation?: SiteEditorEvaluatedBrandKit;
  sections: PageSections[];
  existingSitePage: SiteEditorExistingSitePage;
  fetchedHomepage?: SiteEditorExistingSitePage;
  propertyFilters?: PagePropertyFilters;
  hierarchicalDetailPages?: SiteEditorHierarchicalDetailPage[];
  additionalInstructions?: string;
  capitalization?: CopyCapitalization;
};

/**
 * Assembles the Haiku prompt for one core page. Brand framing, kind framing, the section layout,
 * voice rules, and the source content all stack into a single user message. The structured-output
 * schema (built from `copy-specs.ts`) is what the model is told to fill — this composes the
 * natural-language steering around it.
 */
export const buildPrompt = (input: BuildPromptInput) => {
  const {
    pageKind,
    tone,
    evaluation,
    existingSitePage,
    fetchedHomepage,
    sections,
    propertyFilters,
    hierarchicalDetailPages,
    additionalInstructions,
    capitalization,
  } = input;

  const sourceText = pickSourceText(existingSitePage, fetchedHomepage, pageKind);
  const framing = pageKind ? kindFraming[pageKind] : undefined;
  const layout = buildLayout(sections, pageKind);
  const brandFraming = buildBrandFraming(evaluation);
  const description = existingSitePage?.description?.trim();

  // Extended `existing`-tone blocks, so the model attempts to treat the copy as verbatim.
  const hasSource = !!existingSitePage?.markdown || !!fetchedHomepage?.markdown;
  const existingToneBlock = tone === 'existing' && hasSource ? `\n\n${EXISTING_VOICE_GUIDANCE}` : '';
  const voiceBriefBlockBody =
    tone === 'existing' && evaluation?.voiceBrief ? buildVoiceBriefBlock(evaluation.voiceBrief) : '';
  const voiceBriefBlock = voiceBriefBlockBody ? `\n\n${voiceBriefBlockBody}` : '';

  // Audience constraint per page kind. Without this the model is free to bleed owner-recruitment
  // language onto guest-facing pages (or vice versa).
  const audience = pageKind ? audienceForKind[pageKind] : undefined;
  const audienceBlock = audience ? `\n\n${audience === 'guest' ? AUDIENCE_GUEST : AUDIENCE_OWNER}` : '';

  // FAQ pages must be preserved verbatim, so they get a special prompt
  const faqBlock = pageKind === 'FAQ' ? `\n\n${FAQ_PRESERVATION_BLOCK}` : '';

  // PROPERTY_CATEGORY pages get scope-aware framing for their visible category identity and
  // supporting content, derived from the page's location/amenity/bedroom filters.
  const filterBlock =
    pageKind === 'PROPERTY_CATEGORY' && propertyFilters ? `\n\n${buildFilterScopeBlock(propertyFilters)}` : '';

  // PROPERTY_CATEGORY_INDEX needs to summarise its hierarchical-detail pages (the categories it links to)
  const hierarchicalDetailsBlock =
    pageKind === 'PROPERTY_CATEGORY_INDEX' && hierarchicalDetailPages && hierarchicalDetailPages.length > 0
      ? `\n\n${buildHierarchicalDetailsBlock(hierarchicalDetailPages)}`
      : '';

  // Custom additional instructions
  const additionalInstructionsBlock = additionalInstructions
    ? `\n\n# Additional instructions\n\n${additionalInstructions}`
    : '';
  const capitalizationBlock = capitalization === 'sentence' ? `\n\n${SENTENCE_CASE_BLOCK}` : '';

  return `${brandFraming}

${framing ? `${framing}\n\n` : ''}Return copy for each writable section in order. Each position has its own field budget; emit only the fields listed for that section. Read-only sections are excluded. Structural fields (image URLs, CTA links, layout flags, form schemas) are populated separately and aren't in the schema you're filling.

${layout}

Tone: ${tone} (${toneDescription[tone]})
Existing site page title: ${existingSitePage?.title ?? 'Unknown'}${description ? `\nExisting site meta description: ${description}` : ''}${existingToneBlock}${voiceBriefBlock}

# CRITICAL: No fabrication

The copy this prompt produces ships to guests who book stays based on it. Inventing facts is harmful.

You MUST NOT invent, fabricate, or hallucinate ANY factual content. Specifically NEVER invent:
- **Amenities**: pools, hot tubs, saunas, gyms, EV chargers, fireplaces, anything you can't see in the source.
- **Numbers**: bedrooms, baths, square footage, guest capacity, prices, rates, fees, percentages, years.
- **Named features**: specific room names, named outdoor spaces, named view types, "designer" anything, "heated" anything.
- **Policies**: pet rules, smoking rules, cancellation terms, guarantees.
- **Organizations**: partnerships, certifications, awards, affiliations.

Rules:
- Every concrete claim must trace to the source markdown or meta description above.
- If the source describes the BUSINESS (an agency, a management company, a regional brand) and not specific properties, write about the business, not invented property features.
- Facts attached to a named property, unit, listing, room, package, or other scoped item, or found under a listing, tab, card, or detail block, stay item-level. Repetition does not make them portfolio-wide.
- Do not use item-level facts in generic homepage cards, metrics, hero, subtitle, or CTA unless the source explicitly frames the homepage around one property or says all, every, each, or the portfolio shares them. When scope is uncertain, omit the fact.
- An item-level fact may appear only when the output keeps that item named and scoped.
- Guest capacity has a hard ban in generic homepage copy unless the source explicitly frames the homepage around one property or says all, every, each, or the portfolio shares that capacity. Do not write capacity-shaped phrases like "sleeps 6", "sleep 6 guests", "up to 6 guests", or "6 guests" from unit-level evidence.
- Item arrays with concrete factual content (metrics with numbers, FAQ answers, named amenities, specific features): if the source is thin, prefer FEWER items over invented ones; shorter is fine.
- Item arrays of broad marketing cards (photos, feature cards; NOT source-backed TICKETS or PRIVATE_EVENT cards): aim for at LEAST 3 cards drawn from universally-true pillars: the place/region, the kind of stays the business offers, the company's care and service, local expertise, the guest experience. Phrasings like "Thoughtfully Managed" + "Every property reflects our commitment to guest care", or "Local Expertise" + "Deep knowledge of the area built over years of service", are vague-and-true and exactly the right shape, not fabrication.
- For broad homepage cards and metrics, when the source only provides item-level details, use broad truths or leave a detail out. Do not fill those sections with item-level numbers, amenities, distances, or capacities.
- TICKETS call-to-action cards are a product list, not broad marketing cards. Emit one card for each distinct ticket package explicitly offered in the source. If only one package is described, emit one card; leave unused visual capacity empty. Never turn nearby attractions, generic experiences, concierge services, or lodging into additional ticket cards unless the source separately offers them in the form of ticket products.
- When one TICKETS deal or admission price covers multiple named parks, attractions, or experiences, that bundle is ONE package and must become one card, not one card per included attraction.
- PRIVATE_EVENT call-to-action cards are a source-backed list of event types or hosted use-cases. Preserve named source categories when present; do not replace them with generic categories like retreats or corporate offsites. If fewer categories are actually supported than the layout can show, emit fewer cards.
- It is always better to be vague and true than specific and made up.

${COPY_VOICE_RULES}${audienceBlock}

Other notes:
- The per-section budgets above are the target lengths and item counts for each field. Hit them. "≤N words" is a ceiling; "N–M words" is a range; "emit exactly N" is a count; "up to N" allows fewer when the source genuinely can't support N (the no-fabrication rule wins).
- \`eyebrow\` and \`eyebrowTitle\` are optional in the schema but you should always populate them — they're load-bearing in the layout. Examples: "Our story", "Local expertise", "What guests say".
- Never reference WanderOS, Wander, or any underlying platform.${faqBlock}${filterBlock}${hierarchicalDetailsBlock}${additionalInstructionsBlock}

${buildSourceBlock(sourceText, tone, pageKind, hasSource)}${capitalizationBlock}`;
};

/**
 * Renders the list of hierarchical-detail pages a hierarchical-index page links out to, so the
 * copy model frames the list as a whole.
 */
const buildHierarchicalDetailsBlock = (details: SiteEditorHierarchicalDetailPage[]): string => {
  const lines = details.map((detail) => `- ${detail.name}`).join('\n');

  return `# Categories on this site
The collection-gallery on this page links out to these category pages:
${lines}

Write hero copy and gallery title/description that frame the **whole list** of categories above.
Do not name any single category in the hero, title, or description; instead use range-spanning
language ("Find your fit", "Browse by style", "Pick a category"). Concrete details that apply to
ONE category but not the others belong on that category's own page, not here.`;
};

/**
 * Renders the PROPERTY_CATEGORY filter-scope block, so the copy model keeps every generated page
 * identifiable as its own filtered slice rather than converging on generic shared hero copy.
 */
const buildFilterScopeBlock = (filters: PagePropertyFilters): string => {
  const scope = formatFilters(filters);
  if (!scope) {
    return '';
  }

  return `# This page's filter scope

This page is filtered to: ${scope}.

Use this scope throughout this category page:

- **hero**: make the filter scope visible in the title and subtitle. Name the city/area on a
  location page, the amenity on an amenity page, or the capacity on a bedrooms/occupancy page.
  A generic hero title that could be reused on a sibling category page is incorrect.
- **property-gallery**: use a short label that remains consistent with this scope when helpful
  (for example, "Carmichael Homes" or "Pet-Friendly Homes"), rather than an unrelated theme.
- **feature-image-cards-overlay**: write per-card eyebrows/titles that highlight what's distinctive about *this slice*.
  - For city/area scopes (e.g. Miami): cards can highlight neighborhood character, signature outings, regional food/culture, what's a short walk or drive away.
  - For amenity scopes (e.g. outdoor pool, hot tub): cards can highlight the kinds of moments these amenities enable — quiet morning swims, hosted dinners by the fire, après-ski soak.
  - For capacity scopes (e.g. 3+ bedrooms, sleeps 8+): cards can highlight the gatherings these homes are sized for — family reunions, multi-generation trips, friend groups.
  - For pet-friendly: cards can highlight pet-welcoming details — fenced yards, nearby trails, on-site space for dogs.
- **FAQs**: write 4–6 questions a traveler shopping THIS slice would ask before booking. Anchor every question on the scope above — generic vacation-rental FAQs don't belong here. Plain, concrete, factual. Never invent policies, prices, or specific amenities that aren't grounded in the source.

The reviews section may stay general because it is shared structural content.`;
};

/**
 * Renders the per-section layout block: numbered header for each writable section + indented
 * `promptHint` lines pulled from the section's copy schema.
 *
 * The `variant` and `kind` fields are surfaced in the header so the model can tell which renderer
 * it's writing for.
 */
const buildLayout = (sections: PageSections[], pageKind: SaasWebsitePageKindType | undefined) =>
  buildCopyGenerationPlan(sections, pageKind)
    .map(({ section }, outputIndex) => {
      const variant = 'variant' in section ? section.variant : undefined;
      const kind = 'kind' in section ? section.kind : undefined;

      const meta: string[] = [];
      if (variant) {
        meta.push(`variant: ${variant}`);
      }

      if (kind) {
        meta.push(`kind: ${kind}`);
      }

      const metaSuffix = meta.length > 0 ? ` (${meta.join(', ')})` : '';

      const header = `  ${outputIndex + 1}. ${section.type}${metaSuffix}`;
      const lines = getCopySchema(section, pageKind).promptHint;

      return `${header}\n${lines.map((line) => `     ${line}`).join('\n')}`;
    })
    .join('\n');

const SOURCE_CHAR_LIMIT = 15_000;

/**
 * FAQ-specific override of `SOURCE_CHAR_LIMIT`, to make sure we get them all. Keep in sync with
 * `FAQ_SOURCE_PAGE_MAX_MARKDOWN_CHARS` in `build-page/build-templated-page.ts` — a tighter slice
 * here would re-truncate the fetched FAQ markdown and leave answer-less questions that bait the
 * model into inventing answers.
 */
const FAQ_SOURCE_CHAR_LIMIT = 60_000;

/**
 * Choose the best available source markdown. If the page itself was matched, use its scrape.
 * Otherwise fall back to the homepage scrape so non-matched core pages still ground in the
 * customer's voice and vocabulary. Final fallback is the generic note.
 *
 * Inline image markdown is stripped before slicing — the copy LLM doesn't render images, the
 * picker already has them in a separate pool, and they crowd out the prose that actually steers
 * the writer. The templated-page fetch already strips at fetch time via `stripImages: true`. This
 * extra pass is defensive for any caller (notably the homepage pre-fetch) that didn't.
 *
 * For `pageKind === 'FAQ'` the slice expands to `FAQ_SOURCE_CHAR_LIMIT`.
 */
const pickSourceText = (
  existingSitePage: SiteEditorExistingSitePage,
  fetchedHomepage: SiteEditorExistingSitePage | undefined,
  pageKind: SaasWebsitePageKindType | undefined
) => {
  const limit = pageKind === 'FAQ' ? FAQ_SOURCE_CHAR_LIMIT : SOURCE_CHAR_LIMIT;

  if (existingSitePage?.markdown) {
    return stripInlineImageMarkdown(existingSitePage.markdown).slice(0, limit);
  }

  if (fetchedHomepage?.markdown) {
    return `(No source page found for this kind. The customer's homepage is included for voice/vocabulary reference; do not treat it like the page's own content.)\n\n${stripInlineImageMarkdown(fetchedHomepage.markdown).slice(0, limit)}`;
  }

  return 'No source page content was available. Create tasteful default copy for a luxury vacation rental website.';
};

/**
 * Top-of-prompt brand framing. When the homepage evaluator produced a brand kit we name the
 * customer (their business, location, and property type) explicitly so the model writes from
 * that perspective. Without an evaluation we fall back to a generic vacation-rental framing —
 * still customer-facing, but without specifics the model would have to invent.
 */
export const buildBrandFraming = (evaluation?: SiteEditorEvaluatedBrandKit) => {
  if (!evaluation) {
    return 'You are writing website copy for an independent vacation-rental brand. Write like that brand speaking to its guests.';
  }

  const location = evaluation.locationContext?.guestFacingLocation || evaluation.locations[0];
  const propertyType = evaluation.propertyTypes[0];
  const placeFragment = location ? ` ${formatLocationPhrase(location)}` : '';
  const propertyFragment = propertyType ? `, a ${propertyType}` : '';

  return `You are writing website copy for ${evaluation.businessName}${propertyFragment}${placeFragment}. Every word should sound like ${evaluation.businessName} speaking to its guests. The brand on this site is ${evaluation.businessName}, never WanderOS, Wander, or the platform we use to build it.`;
};

/**
 * Per-kind framing prepended to the copy prompt. Steers the model toward the right audience
 * (guests vs owners).
 */
const kindFraming: Partial<Record<SaasWebsitePageKindType, string>> = {
  HOMEPAGE:
    "You are writing the HOMEPAGE, the brand's first impression. Lead with what makes the stay desirable. Use portfolio-level copy unless the source explicitly frames the homepage around one property. Do not use unit-level capacity, bedrooms, baths, amenities, views, distances, rates, or policies unless the source explicitly frames the homepage around one property or says every, all, each, or the portfolio shares them.",
  ABOUT:
    "You are writing the ABOUT page. Tell the brand's story and convey trust without resorting to generic hospitality clichés.",
  CONTACT: 'You are writing the CONTACT page. Keep it short, helpful, and unambiguous about how to reach the team.',
  FAQ: 'You are writing the FAQ page. Address the questions a guest most often asks before booking. Answers stay practical and concrete.',
  LIST_WITH_US:
    'You are writing the LIST WITH US page. Pitch property owners on listing their home with this business — the services offered, the team behind them, and how to get in touch.',
  BLOG_INDEX:
    "You are writing the BLOG landing page. Introduce what the brand's journal covers - the gallery below renders real posts, so keep the hero at a high level and don't invent post titles.",
  ATTRACTION_INDEX:
    "You are writing the ATTRACTIONS landing page. Set up the character of the area near the brand's properties - the gallery below renders real attractions, so keep the hero at a high level and don't name specific places.",
  EVENT_INDEX:
    "You are writing the EVENTS landing page. Invite guests into what's happening in the area - the gallery below renders real events, so keep the hero at a high level and don't name specific events.",
  DINING_INDEX:
    "You are writing the DINING landing page. Set up the local food scene around the brand's properties - the gallery below renders real restaurants, so keep the hero at a high level and don't name specific places.",
  ACTIVITY_INDEX:
    "You are writing the ACTIVITIES landing page. Invite guests into things to do near the brand's properties - the gallery below renders real activities, so keep the hero at a high level and don't name specific activities.",
  PROPERTY_CATEGORY:
    "You are writing a PROPERTY_CATEGORY page — a filtered subset of the brand's homes (e.g. by location, bedroom count, pet-friendliness, or amenity). The property-gallery below renders the real homes that match this slice, so the hero must identify *this specific slice* without naming individual units or inventing facts. If the source title or filter scope gives you a city, amenity, or capacity, put that identity in the hero instead of writing an interchangeable getaway slogan. The feature-image-cards-overlay should highlight what's distinctive about *this slice* (neighborhood character on a city-scoped page, lifestyle moments on an amenity-scoped page). The FAQs should answer what a traveler shopping this specific slice would actually ask before booking.",
  PROPERTY_CATEGORY_INDEX:
    "You are writing a PROPERTY_CATEGORY_INDEX page — a landing that lets guests pick a category before browsing homes. The collection-gallery below renders cards for every category page on the site; copy should frame the *whole list*. The hero and gallery title/description should invite browsing across all categories, not dwell on one. Don't lift phrasing from a single category — neutral, range-encompassing language is the goal. The categories are listed below; use them to ground the copy in what's actually on offer without focusing on any particular one.",
  GALLERY:
    "You are writing a GALLERY page — a lightbox of photos from the brand's property and area. The lightbox below renders the real images, so keep the hero copy short and set up what the viewer is about to see. Don't describe specific photos.",
  TICKETS:
    'You are writing the TICKETS page. The customer sells experiences, tours, or ticketed packages in addition to (or part of) lodging. The call-to-action-cards below are a factual list of packages explicitly offered by this source page, not suggestions for other activities. Produce one card per distinct offered package, even when that means only one card. Keep the hero invitational and high-level; let the cards do the specifics.',
  PRIVATE_EVENT:
    "You are writing the PRIVATE EVENTS page for a property that hosts gatherings. The reader is planning an event and wants to know whether this property or region can host theirs. The intro-text evokes the gatherings described in the source; the call-to-action-cards represent the specific event types or hosted use-cases the source itself describes. Preserve named source categories where available and do not substitute a generic event checklist. If the source supports fewer card subjects than the layout capacity, emit fewer cards. Don't promise venues, capacities, or services that aren't in the source.",
};

/**
 * Maps page kinds to a fixed audience.
 */
const audienceForKind: Partial<Record<SaasWebsitePageKindType, 'guest' | 'owner'>> = {
  HOMEPAGE: 'guest',
  PROPERTY_CATEGORY: 'guest',
  PROPERTY_CATEGORY_INDEX: 'guest',
  GALLERY: 'guest',
  TICKETS: 'guest',
  PRIVATE_EVENT: 'guest',
  LIST_WITH_US: 'owner',
};

const toneDescription: Record<BrandKitTone, string> = {
  warm: 'warm, inviting, human, and hospitable',
  refined: 'polished, restrained, premium, and quietly confident',
  poetic: 'evocative, sensory, elegant, and emotionally resonant',
  modern: 'clear, concise, confident, and contemporary',
  existing: "preserves the existing site's voice — see the verbatim-preservation rules below",
};

const ALLOW_OWNER_LANGUAGE_KINDS = ['FAQ', 'OTHER'];

/**
 * Builds the source-content block at the bottom of the prompt.
 *
 * For `tone === 'existing'` with real source markdown available, the block reframes the source as
 * the canonical truth for both facts AND voice, with explicit verbatim-preservation rules.
 *
 * For every other case the source is just factual reference and tone is dictated by
 * `toneDescription` — the model rewrites in that voice.
 */
const buildSourceBlock = (
  sourceText: string,
  tone: BrandKitTone,
  pageKind: SaasWebsitePageKindType | undefined,
  hasSource: boolean
) => {
  if (tone !== 'existing' || !hasSource) {
    return `Source content:
${sourceText}`;
  }

  const homepageFilter = pageKind === 'HOMEPAGE' ? `\n\n${HOMEPAGE_SOURCE_FILTER}` : '';

  // FAQ and OTHER pages legitimately carry host/owner content we want to preserve
  const ignoreOwnerLanguageLine = ALLOW_OWNER_LANGUAGE_KINDS.includes(pageKind ?? '')
    ? ''
    : '- Owner/host/investor language on guest-facing pages.\n';

  return `## Existing site content (preserve verbatim)

${EXISTING_COPY_PRESERVATION_GUIDANCE}

**What to ignore in the source:**
${ignoreOwnerLanguageLine}- Layout artefacts (nav bars, footers, cookie banners), CMS chrome, and obvious boilerplate
  ("All rights reserved", "© 2024 Acme Rentals").${homepageFilter}

${sourceText}`;
};

/**
 * FAQ-specific preservation rules. Injected from `buildPrompt` whenever `pageKind === 'FAQ'`,
 * regardless of the customer's selected tone. FAQs lifted verbatim.
 */
const FAQ_PRESERVATION_BLOCK = `# FAQ preservation rules (override the tone/voice guidance above)

For the FAQ section on this page you are an extractor, not a writer. The Q/A pairs in the source markdown are the canonical content. Your job is to LIFT them across, not to rewrite them.

- Use source wording byte-for-byte. Do not paraphrase, "improve", modernize, condense, or normalize.
- Do not fix typos, awkward phrasing, dated references, repetition, or quirky punctuation. They stay.
- Do not adjust capitalization, contractions, or word choice. ALL-CAPS, em dashes, idiosyncratic phrasing all survive.
- Do not enforce length budgets on FAQ questions or answers. The aesthetic caps used elsewhere in this prompt do not apply to the FAQ section.
- Preserve source order.

Example:
- Source: "Are pets allowed? Sorry, we cannot accommodate pets at any of our properties — we know, we know, but several owners have severe allergies."
- Correct (verbatim): "Are pets allowed?" / "Sorry, we cannot accommodate pets at any of our properties — we know, we know, but several owners have severe allergies."
- WRONG (paraphrased): "Do you accept pets?" / "Unfortunately, our properties are pet-free due to owner allergies."

If the source markdown contains no FAQ-style Q/A pairs (no recognisable question headings followed by answers), emit \`items: []\` for the FAQ section. Do not invent FAQs from homepage prose or brand context. An empty FAQ section is the correct output when the customer's source has no FAQs to lift.`;

const SENTENCE_CASE_BLOCK = `# Capitalization: sentence case (highest priority)

Use sentence case for every visible copy field, including headings, eyebrows, card titles, CTA and
button labels, body copy, FAQ questions, and FAQ answers. Capitalize only the first word of each
heading, label, or sentence and proper nouns or acronyms like PMI, Disney, Universal, Orlando,
and FAQ. Lowercase all other words.

This rule overrides every earlier capitalization instruction, including title-case conversion and
FAQ or verbatim capitalization preservation. Change capitalization only; preserve source wording,
punctuation, ordering, and factual meaning.`;

/**
 * Homepage-only filter that strips B2B/owner-portal language from the source before the model
 * uses it. PMS customers often have a homepage targeted at property owners, not guests; without
 * this filter the model will preserve owner-acquisition language verbatim onto a guest-facing
 * homepage.
 *
 * Exported so business-context extraction (`evaluate-homepage/extract-business-context.ts`) can apply the same filter when
 * it extracts a verbatim voice brief — without it, a PMS homepage's prominent B2B eyebrow
 * ("Leading Property Management Firm") gets picked as `heroTitle` and downstream becomes a
 * verbatim anchor the copy model is told to use exactly, overriding the audience filter.
 */
export const HOMEPAGE_SOURCE_FILTER = `**IMPORTANT — Homepage content filter:**
The existing homepage may describe property management services, owner portals, investor
resources, tenant screening, rent collection, eviction protection, accounting, or other B2B
offerings. These are IRRELEVANT to the new homepage. Extract only:
- The business name and location
- Property/destination descriptions and amenities
- Guest-facing information (check-in, hospitality, guest services)
- Testimonials or reviews from guests
- Location and neighborhood details
Ignore ALL owner/investor/tenant service descriptions. The new homepage is for travelers, not
property owners.`;

const AUDIENCE_GUEST = `# Audience: guests

The reader is a traveler deciding where to book — not a property owner shopping for a management
company. Even if the business also offers property management, real estate, or investment
services, this page must read like a luxury travel destination. Think high-end Airbnb, boutique
hotel, resort brand. Focus on what it feels like to arrive, what guests will see and do, the
quality of the homes, and the character of the location.

NEVER mention on this page: tenant screening, rent collection, eviction, property inspections,
financial reporting, owner portals, ROI, rental analysis, property management, maintenance
coordination, managed properties, revenue optimization, dynamic pricing, occupancy rates, or any
other owner/investor-facing operational concept. Don't use "property management" like a credibility
phrase — say "hospitality experience" or "years welcoming guests" instead.

Feature cards and differentiators must describe the *guest experience*, not operational processes.
- BAD: "Responsive maintenance coordination", "Regular property inspections", "Full-service vacation rental management", "Online portal access", "Property expertise"
- GOOD: "Lakefront homes with private docks", "24/7 concierge", "Local restaurant guides", "Professionally styled interiors", "Flexible check-in", "Steps from theme parks"`;

const AUDIENCE_OWNER = `# Audience: property owners

The reader is a property owner considering letting this business manage their home. Owner-acquisition
concepts are appropriate here: revenue, management services, partnerships, compliance, reporting,
onboarding, and the team's operational track record.

Keep the register hospitality, not corporate. Read your copy aloud — does it sound like a concierge
welcoming a guest, or a SaaS pitch deck? If it's the latter, rewrite.
- First person plural ("we", "our") — never third-person corporate ("the company").
- Short, warm sentences — never compound-complex business prose.
- Concrete source-backed details beat abstract claims. Never use a numeric proof point unless source supports it.
- Active voice and conversational rhythm: "We study the market so your home earns what it should" beats "Market analysis is leveraged to optimize revenue potential".

Word swaps (use the right column, not the left): leverage → use; optimize → tune; comprehensive → everything; streamlined → simple; data-driven → backed by real numbers; methodology → approach; stakeholders → you / our owners.`;
```

## `shared/copy-voice.ts` (verbatim — the shared text blocks buildPrompt imports)

```typescript
import type { BrandKitVoiceBrief } from '@wos/saas-schemas';

/**
 * The house copy voice: rules guarding against generated-looking copy.
 *
 * The model tends toward producing copy with AI-tells, like em dashes, stock vocabulary, and
 * three-part-list rhythm. This block tells it not to.
 *
 * The single source of truth across the copy paths that write website text:
 *
 *   * Onboarding copy generation (`generate-copy`)
 *   * Freeform page building (`build-freeform-sections`)
 *   * The site-editor chat's main reply loop
 *   * The chat's per-page bulk sub-agent
 *
 * Keep it register-agnostic so it reads correctly both for generating copy from a source and for
 * editing copy already on the page.
 */
export const COPY_VOICE_RULES = `# Voice: natural, non-AI register

- Do not use em dashes in newly written page copy. Use a comma, colon, parentheses, or a new sentence instead. When the source uses an em dash and you are preserving its phrasing verbatim, keep the source punctuation exactly.
- Avoid polished AI templates: "not X but Y", "not just X, it's Y", "not only X but also Y", "more than X, it's Y", "whether X or Y", "from X to Y", "at its core", and "in today's world".
- Avoid stock model vocabulary unless it appears verbatim in the source within a real brand phrase: delve, underscore, showcase, pivotal, crucial, intricate, tapestry, testament, vibrant, robust, comprehensive, dynamic, foster, leverage, enhance, crafted, tailored, elevate, unlock.
- Do not build every line like a balanced slogan or three-part list. Vary the rhythm: one short sentence, one concrete sensory detail, one useful fact.
- Prefer plain, lived-in language over abstract polish. "Walk to the marina in five minutes" beats "seamless access to local experiences".

Clichés to avoid (three categories, hard bans unless backed by specific detail):

Generic hospitality:
- "your home away from home", "unforgettable experience", "unparalleled luxury"
- "nestled in the heart of", "hidden gem", "escape the ordinary"
- "where memories are made", "a stay like no other", "the ultimate getaway"

Vague superlatives:
- "world-class", "stunning views", "breathtaking scenery", "state-of-the-art"
- "top-notch", "second to none", "one-of-a-kind"
- "the best", "the finest", "the ultimate"

Empty action phrases:
- "elevate your experience", "discover the magic", "experience the difference"
- "explore the possibilities", "immerse yourself", "indulge in luxury"
- "unlock the potential", "take it to the next level", "at the heart of"
- "curated for you", "redefine", "seamless", "boasts"

A phrase is only a cliché if it is not backed by specific detail. "Stunning views of the Teton Range at sunrise" is fine; the specificity earns the adjective. "Stunning views" alone is a cliché. When in doubt, cut the adjective and let the noun do the work.`;

/**
 * Loose length guidance for the chat's copy paths.
 *
 * Kept in WORDS, not characters: the frontend counts are advisory (nothing enforces them) and a
 * numeric target makes the model cramp copy.
 *
 * Scoped to writing new copy - shortening existing copy on request is handled separately, from the
 * real character counts get-page/edit-section-text report.
 *
 * Shared by chat and freeform page building. Template onboarding has its own per-section budgets,
 * so it does not import this.
 */
export const COPY_LENGTH_GUIDE = `# Length: match the field, keep it tight

When you write new copy, match its length to the kind of field, and lean short: for a premium brand one concrete line beats three padded ones. Rough shapes for the common section fields:
- an eyebrow or kicker is a few words, a label
- a headline or title is a short line
- a subtitle is one sentence
- a card or section description is a sentence or two
- a section's body is a short paragraph

These are shapes to aim for, not limits. Never pad to fill a field, and never trim good copy just to be shorter. To shorten existing copy on request, work from the real character counts your tools report, not from these shapes.

Long-form pages are the exception. Blog posts, dining and attraction guides, and area guides can run however long the subject deserves, often several paragraphs. Do not compress them to a section length. The voice rules still apply to them; only these section lengths do not.`;

/**
 * The source-preservation rule for pages built with the customer's existing voice.
 *
 * It deliberately covers copy only. Each builder keeps its own instructions for source structure,
 * section choices, and ignored page chrome.
 */
export const EXISTING_COPY_PRESERVATION_GUIDANCE = `The user has chosen to preserve their existing voice. Source content is the canonical reference for both facts and voice.

Where an output field maps to source copy (headings, paragraphs, FAQs, testimonials, CTA labels), use it verbatim: same words, order, and punctuation. Do not paraphrase, polish, summarize, reorder, or combine it.

Write fresh copy only for a required field with no source equivalent. Match the source's sentence length, formality, vocabulary, and rhythm. Keep recognizable brand phrases. If source copy must be shortened, trim at a sentence or clause boundary without rewriting.`;

/**
 * Extended existing-voice guidance. Source content sets the register; source capitalization only
 * sets the casing of heading-shaped fields.
 */
export const EXISTING_VOICE_GUIDANCE = `## Voice: preserve the existing site

The source content is the canonical voice reference — match its register exactly, do not impose
a different tone. Inspect the source for: average sentence length, contractions usage, person
(we/our vs the company), vocabulary register (plain vs elevated), and overall rhythm. Match all
of these.

**Heading capitalization is typography, not voice.** When the source displays a heading, eyebrow,
card title, or CTA label in ALL CAPS (or in all-lowercase), treat that like source-page styling,
not part of the customer's voice — convert it to title case in your output. This overrides the
verbatim-preservation rule below for heading-shaped fields only. Preserve acronyms, initialisms,
and proper nouns in their canonical casing: brand names, place names, person names, and
abbreviations (FAQ, USA, NYC, ADA, EV, AI, RV, ROI, BBQ, PTO, HOA, B&B, LLC, A/C, BYOB, plus any
source-specific initialism like a region code, property code, or business shorthand) remain unchanged.
Examples: "ABOUT US" → "About Us"; "OUR ROI APPROACH" → "Our ROI Approach"; "FAQ" → "FAQ"
(stays); "B&B GETAWAYS" → "B&B Getaways"; "VISIT NYC" → "Visit NYC". Body paragraphs, FAQ
questions and answers, testimonial quotes, and inline emphasis (a single word in caps for stress
inside a sentence) keep the source's exact capitalization.

**What this is NOT:**
- Not a license to rewrite the source in a "cleaner" version of its own voice.
- Not an excuse to drop personality the source has — quirks, repetitions, and brand-specific
  phrases are part of what we're preserving.
- Not a fallback to a generic neutral tone when the source has a clear voice.`;

/**
 * Render homepage phrases extracted for voice anchors. They guide register, but only fill a field
 * when the current page has no equivalent source copy of its own.
 */
export const buildVoiceBriefBlock = (voiceBrief: BrandKitVoiceBrief): string => {
  const lines: string[] = [];
  if (voiceBrief.heroTitle.trim()) {
    lines.push(`- Hero title: "${voiceBrief.heroTitle}"`);
  }

  if (voiceBrief.heroSubtitle.trim()) {
    lines.push(`- Hero subtitle: "${voiceBrief.heroSubtitle}"`);
  }

  if (voiceBrief.ctaText.trim()) {
    lines.push(`- Primary CTA label: "${voiceBrief.ctaText}"`);
  }

  if (lines.length === 0) {
    return '';
  }

  return `## Voice anchors (extracted verbatim from the customer's homepage)

These phrases capture the brand's voice and register — sentence length, vocabulary, formality,
rhythm. Match this register on every section of every page.

For hero, subtitle, and CTA fields, do not invent new language. Find the most appropriate
corresponding string in THIS page's source content above and use it (verbatim, or trimmed at a
sentence boundary). Only fall back to these anchors when the page's own source has no
equivalent line.

${lines.join('\n')}`;
};

/**
 * Good copy examples for the AI to imitate.
 *
 * Positive-only (bad examples in-context anchor the model toward the slop), plus a few tight
 * weak/strong contrasts in the existing house style.
 *
 * Diverse across property archetypes and lengths so nothing biases toward one voice or toward
 * terseness.
 */
export const COPY_EXEMPLARS = `# Examples: the register to aim for

Study the rhythm and the concreteness, then write in the same register. Do not reuse the wording or the places.

<example label="Hero headline, a short line">
A cabin at the foot of the Tetons
</example>

<example label="Hero subtitle, one sentence">
Sleeps twelve. The hot tub stays warm through winter, and the Snake River is a two-minute walk down the hill.
</example>

<example label="Hero, a portfolio brand">
Headline: Twelve houses in downtown Charleston
Subtitle: Each one a few blocks from King Street, with off-street parking and a porch that catches the evening breeze.
</example>

<example label="Section body, a short paragraph">
Coffee on the deck while the fog lifts off the vineyard rows. The tasting rooms open at ten, so there is no rush. We leave a map on the counter marked with the growers worth the drive and the bakery in Healdsburg that sells out by nine.
</example>

<example label="Feature card">
Title: Concierge
Text: Text us before you arrive. The fridge will be stocked and the boat booked by the time you reach the door.
CTA: See the house
</example>

<example label="Long-form page (blog, dining, attraction): as long as the content needs">
Most nights you won't want to drive far, and you won't need to. The village has three places worth knowing. The trattoria on the square cooks one pasta a day and sells out early, so go at seven. Down by the water, the fish place works without a menu: they bring in what the boats landed that morning and grill it over coals. Two streets back, the enoteca pours local reds by the glass alongside a short list of small plates.

When you feel like a drive, the hill towns to the north are worth it. Tell us the night and we'll book the table.
</example>

A few quick contrasts:
- Weak: Nestled in the heart of wine country. Strong: A ten-minute drive from the Healdsburg square.
- Weak: Experience unparalleled luxury and unforgettable memories. Strong: Sleeps twelve, with a cook's kitchen and one long table for all of you.
- Weak: Whether you're seeking relaxation or adventure, there's something for everyone. Strong: Bring the paddleboards. The lake is flat most mornings before the wind picks up.`;
```

Note: `COPY_LENGTH_GUIDE` and `COPY_EXEMPLARS` are exported from copy-voice.ts but NOT imported by `generate-copy/prompt.ts` (they serve the chat/freeform paths). Included for completeness.

## Helper: `stripInlineImageMarkdown` — `html-to-markdown/normalize.ts` (verbatim excerpt)

```typescript
const INLINE_LINKED_IMAGE_PATTERN = /\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)/g;
const INLINE_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/g;

/**
 * Strips inline `![alt](url)` and `[![alt](url)](href)` blocks from markdown and collapses the
 * blank-line runs the deletions leave behind. Exported so the copy-gen prompt's `pickSourceText`
 * can apply the same transform defensively to fallback sources (e.g. the homepage) that weren't
 * fetched with the `stripImages` option — one regex pair, one place.
 */
export const stripInlineImageMarkdown = (markdown: string): string =>
  markdown
    .replace(INLINE_LINKED_IMAGE_PATTERN, '')
    .replace(INLINE_IMAGE_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
```

## Supporting type: `SiteEditorExistingSitePage` (schemas package, verbatim)

```typescript
export const SiteEditorExistingSitePageImage = z.object({
  url: z.string(),
  alt: z.string().optional(),
  contextText: z.string().optional(),
  contextHtml: z.string().optional(),
});

export const SiteEditorExistingSitePage = z
  .object({
    url: z.string().url().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    ogImageUrl: z.string().optional(),
    heroVideoUrl: z.string().url().optional(),
    markdown: z.string(),
    html: z.string().optional(),
    images: SiteEditorExistingSitePageImage.array().default([]),
  })
  .nullable();
```

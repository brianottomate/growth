import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import type { PregenNativeBrandKit } from "@/server/db/schema";
import { formatLocationPhrase, type BrandKitTone } from "./brand-kit";
import { HOMEPAGE_SOURCE_FILTER } from "./source-filter";

// Ported from the monolith's generate-copy/ + templates/homepage.ts + shared/
// copy-voice.ts (see docs/port/*.md). Narrowed to the HOMEPAGE path: section
// builders for kinds the homepage template never routes to are not ported
// (nor is ALLOWED_ICON_NAMES — no homepage section carries icon fields).
// Design invariant preserved verbatim: the template owns structure, the model
// owns copy, and the output schema is a strict positional tuple over writable
// sections — validation failure falls back to the template's stub copy.

// ---- HOMEPAGE TEMPLATE (verbatim structure) ---------------------------

const PLACEHOLDER_IMAGE_URL = "https://placehold.co/1x1/aaa/aaa";
const FEATURE_CARD_COUNT = 3;

export type TemplateSection = Record<string, unknown> & { type: string };

export const buildHomepageTemplate = (): TemplateSection[] => [
  {
    version: 0,
    type: "homepage-hero",
    title: "Welcome",
    description:
      "Find a comfortable place to stay and plan your next trip with ease.",
    showPropertyGallery: false,
    backgroundImageUrl: PLACEHOLDER_IMAGE_URL,
    backgroundOpacity: 35,
  },
  {
    version: 0,
    type: "property-gallery",
    title: "Properties",
  },
  {
    version: 0,
    type: "cards",
    variant: "feature-image-cards-overlay",
    theme: "accent-secondary-dark",
    title: "Featured stays",
    subtitle: "Thoughtful homes for relaxing getaways and memorable trips.",
    items: Array.from({ length: FEATURE_CARD_COUNT }, () => ({
      imageUrl: PLACEHOLDER_IMAGE_URL,
      eyebrow: "Featured stay",
      title: "Comfortable home",
    })),
  },
  {
    version: 1,
    type: "reviews",
    disableable: true,
    disabled: false,
    eyebrow: "Guest reviews",
    title: "What our guests say",
    showFilters: true,
    showReviewsCount: true,
  },
  {
    version: 0,
    type: "book-direct",
    readOnly: true,
  },
  {
    version: 0,
    type: "cta",
    variant: "feature",
    eyebrow: "Ready to travel",
    title: "Plan your next stay",
    ctaText: "Browse stays",
    ctaLink: "/s",
    backgroundImageUrl: PLACEHOLDER_IMAGE_URL,
  },
];

// ---- COPY SCHEMA MACHINERY (verbatim, homepage-narrowed) --------------

type CopySchema = {
  schema: z.ZodTypeAny;
  promptHint: string[];
};

const optString = () => z.string().optional();

const EMPTY: CopySchema = { schema: z.object({}).strict(), promptHint: [] };

/**
 * Positional contract as a fixed-key object (s1..sN). The monolith uses
 * z.tuple, but Anthropic's structured-output API rejects tuple schemas
 * ("Array types must be specified with a single object schema for 'items'"),
 * so position rides in the key. Strictness semantics are identical: wrong
 * shape → validation failure → template fallback.
 */
const positional = (schemas: z.ZodTypeAny[]) =>
  z
    .object(
      Object.fromEntries(schemas.map((schema, i) => [`s${i + 1}`, schema])),
    )
    .strict();

const homepageHero = (): CopySchema => ({
  schema: z.object({ title: optString(), description: optString() }).strict(),
  promptHint: ["- title: 3–6 words", "- description: 1 sentence, ≤22 words"],
});

const propertyGallery = (): CopySchema => ({
  schema: z.object({ title: optString() }).strict(),
  promptHint: ["- title: 1–3 words"],
});

const reviews = (section: TemplateSection): CopySchema => {
  if (
    section.variant === "reviews-summary" ||
    (section.version === 1 && section.variant === undefined)
  ) {
    return {
      schema: z.object({ eyebrow: optString(), title: optString() }).strict(),
      promptHint: ["- eyebrow: 2–4 words", "- title: 3–6 words"],
    };
  }
  return EMPTY;
};

const featureImageCards = (
  count: number,
  includeItemDescription: boolean,
): CopySchema => ({
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
            .strict(),
        )
        .length(count),
    })
    .strict(),
  promptHint: [
    "- title: 3–6 words",
    "- subtitle: 1 sentence, ≤22 words",
    `- items: emit exactly ${count}`,
    "- per item — eyebrow: 2–4 words",
    "- per item — title: 2–5 words",
    ...(includeItemDescription
      ? ["- per item — description: 1 sentence, ≤16 words"]
      : []),
  ],
});

const cards = (section: TemplateSection): CopySchema => {
  // Homepage only routes the overlay variant; other variants are unported.
  if (
    section.variant === "feature-image-cards" ||
    section.variant === "feature-image-cards-overlay" ||
    section.variant === "feature-image-cards-centered"
  ) {
    const items = Array.isArray(section.items) ? section.items : [];
    return featureImageCards(
      items.length,
      section.variant !== "feature-image-cards-overlay",
    );
  }
  return EMPTY;
};

const cta = (section: TemplateSection): CopySchema => {
  // The `feature` variant renderer ignores `text`, so don't waste tokens generating it.
  const includeText = section.variant !== "feature";

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
      "- eyebrow: 2–4 words",
      "- title: 4–8 words",
      ...(includeText ? ["- text: 1 sentence, ≤22 words"] : []),
      "- ctaText: 2–4 words",
    ],
  };
};

export const getCopySchema = (section: TemplateSection): CopySchema => {
  switch (section.type) {
    case "homepage-hero":
      return homepageHero();
    case "property-gallery":
      return propertyGallery();
    case "reviews":
      return reviews(section);
    case "cards":
      return cards(section);
    case "cta":
      return cta(section);
    default:
      // book-direct, search-bar, html, form + all unported kinds: no copy.
      return EMPTY;
  }
};

const isDisabledSection = (section: TemplateSection) =>
  "disabled" in section && section.disabled === true;

export const buildCopyGenerationPlan = (template: TemplateSection[]) =>
  template.flatMap((section, templateIndex) =>
    isDisabledSection(section) || getCopySchema(section).promptHint.length === 0
      ? []
      : [{ templateIndex, section }],
  );

export const buildCopySchema = (template: TemplateSection[]) => {
  const sectionSchemas = buildCopyGenerationPlan(template).map(
    ({ section }) => getCopySchema(section).schema,
  );
  return z.object({ sections: positional(sectionSchemas) });
};

// ---- PROMPT (verbatim text blocks, homepage path) ---------------------

const SOURCE_CHAR_LIMIT = 15_000;

const INLINE_LINKED_IMAGE_PATTERN = /\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)/g;
const INLINE_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/g;

export const stripInlineImageMarkdown = (markdown: string): string =>
  markdown
    .replace(INLINE_LINKED_IMAGE_PATTERN, "")
    .replace(INLINE_IMAGE_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const HOMEPAGE_KIND_FRAMING =
  "You are writing the HOMEPAGE, the brand's first impression. Lead with what makes the stay desirable. Use portfolio-level copy unless the source explicitly frames the homepage around one property. Do not use unit-level capacity, bedrooms, baths, amenities, views, distances, rates, or policies unless the source explicitly frames the homepage around one property or says every, all, each, or the portfolio shares them.";

const toneDescription: Record<BrandKitTone, string> = {
  warm: "warm, inviting, human, and hospitable",
  refined: "polished, restrained, premium, and quietly confident",
  poetic: "evocative, sensory, elegant, and emotionally resonant",
  modern: "clear, concise, confident, and contemporary",
  existing:
    "preserves the existing site's voice — see the verbatim-preservation rules below",
};

const NO_FABRICATION_BLOCK = `# CRITICAL: No fabrication

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
- It is always better to be vague and true than specific and made up.`;

const COPY_VOICE_RULES = `# Voice: natural, non-AI register

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

const EXISTING_COPY_PRESERVATION_GUIDANCE = `The user has chosen to preserve their existing voice. Source content is the canonical reference for both facts and voice.

Where an output field maps to source copy (headings, paragraphs, FAQs, testimonials, CTA labels), use it verbatim: same words, order, and punctuation. Do not paraphrase, polish, summarize, reorder, or combine it.

Write fresh copy only for a required field with no source equivalent. Match the source's sentence length, formality, vocabulary, and rhythm. Keep recognizable brand phrases. If source copy must be shortened, trim at a sentence or clause boundary without rewriting.`;

const EXISTING_VOICE_GUIDANCE = `## Voice: preserve the existing site

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

const buildVoiceBriefBlock = (voiceBrief: {
  heroTitle: string;
  heroSubtitle: string;
  ctaText: string;
}): string => {
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
    return "";
  }

  return `## Voice anchors (extracted verbatim from the customer's homepage)

These phrases capture the brand's voice and register — sentence length, vocabulary, formality,
rhythm. Match this register on every section of every page.

For hero, subtitle, and CTA fields, do not invent new language. Find the most appropriate
corresponding string in THIS page's source content above and use it (verbatim, or trimmed at a
sentence boundary). Only fall back to these anchors when the page's own source has no
equivalent line.

${lines.join("\n")}`;
};

const buildBrandFraming = (evaluation: PregenNativeBrandKit | undefined) => {
  if (!evaluation) {
    return "You are writing website copy for an independent vacation-rental brand. Write like that brand speaking to its guests.";
  }

  const location =
    evaluation.locationContext?.guestFacingLocation || evaluation.locations[0];
  const propertyType = evaluation.propertyTypes[0];
  const placeFragment = location ? ` ${formatLocationPhrase(location)}` : "";
  const propertyFragment = propertyType ? `, a ${propertyType}` : "";

  return `You are writing website copy for ${evaluation.businessName}${propertyFragment}${placeFragment}. Every word should sound like ${evaluation.businessName} speaking to its guests. The brand on this site is ${evaluation.businessName}, never WanderOS, Wander, or the platform we use to build it.`;
};

const buildLayout = (sections: TemplateSection[]) =>
  buildCopyGenerationPlan(sections)
    .map(({ section }, outputIndex) => {
      const variant =
        "variant" in section && typeof section.variant === "string"
          ? section.variant
          : undefined;
      const metaSuffix = variant ? ` (variant: ${variant})` : "";
      const header = `  ${outputIndex + 1}. ${section.type}${metaSuffix}`;
      const lines = getCopySchema(section).promptHint;
      return `${header}\n${lines.map((line) => `     ${line}`).join("\n")}`;
    })
    .join("\n");

const buildSourceBlock = (
  sourceText: string,
  tone: BrandKitTone,
  hasSource: boolean,
) => {
  if (tone !== "existing" || !hasSource) {
    return `Source content:\n${sourceText}`;
  }

  return `## Existing site content (preserve verbatim)

${EXISTING_COPY_PRESERVATION_GUIDANCE}

**What to ignore in the source:**
- Owner/host/investor language on guest-facing pages.
- Layout artefacts (nav bars, footers, cookie banners), CMS chrome, and obvious boilerplate
  ("All rights reserved", "© 2024 Acme Rentals").

${HOMEPAGE_SOURCE_FILTER}

${sourceText}`;
};

export type HomepageCopySource = {
  title?: string;
  description?: string;
  markdown: string;
};

export const buildHomepagePrompt = (input: {
  tone: BrandKitTone;
  evaluation?: PregenNativeBrandKit;
  sections: TemplateSection[];
  source: HomepageCopySource;
}): string => {
  const { tone, evaluation, sections, source } = input;

  const sourceText = stripInlineImageMarkdown(source.markdown).slice(
    0,
    SOURCE_CHAR_LIMIT,
  );
  const layout = buildLayout(sections);
  const brandFraming = buildBrandFraming(evaluation);
  const description = source.description?.trim();

  const hasSource = !!source.markdown;
  const existingToneBlock =
    tone === "existing" && hasSource ? `\n\n${EXISTING_VOICE_GUIDANCE}` : "";
  const voiceBriefBlockBody =
    tone === "existing" && evaluation?.voiceBrief
      ? buildVoiceBriefBlock(evaluation.voiceBrief)
      : "";
  const voiceBriefBlock = voiceBriefBlockBody
    ? `\n\n${voiceBriefBlockBody}`
    : "";

  return `${brandFraming}

${HOMEPAGE_KIND_FRAMING}

Return copy for each writable section in order. Each position has its own field budget; emit only the fields listed for that section. Read-only sections are excluded. Structural fields (image URLs, CTA links, layout flags, form schemas) are populated separately and aren't in the schema you're filling.

${layout}

Tone: ${tone} (${toneDescription[tone]})
Existing site page title: ${source.title ?? "Unknown"}${description ? `\nExisting site meta description: ${description}` : ""}${existingToneBlock}${voiceBriefBlock}

${NO_FABRICATION_BLOCK}

${COPY_VOICE_RULES}

${AUDIENCE_GUEST}

Other notes:
- The per-section budgets above are the target lengths and item counts for each field. Hit them. "≤N words" is a ceiling; "N–M words" is a range; "emit exactly N" is a count; "up to N" allows fewer when the source genuinely can't support N (the no-fabrication rule wins).
- \`eyebrow\` and \`eyebrowTitle\` are optional in the schema but you should always populate them — they're load-bearing in the layout. Examples: "Our story", "Local expertise", "What guests say".
- Never reference WanderOS, Wander, or any underlying platform.

${buildSourceBlock(sourceText, tone, hasSource)}`;
};

// ---- GENERATION + MERGE ------------------------------------------------

/**
 * Merge semantics ported from generate-copy/merge.ts: splat generated copy
 * over the template section, merging item arrays element-wise; empty-string
 * values are skipped (a Haiku habit) so template stubs survive them.
 */
const mergeSectionCopy = (
  template: TemplateSection,
  copy: Record<string, unknown>,
): TemplateSection => {
  const merged: TemplateSection = { ...template };

  for (const [key, value] of Object.entries(copy)) {
    if (value === undefined || value === "") continue;

    if (
      key === "items" &&
      Array.isArray(value) &&
      Array.isArray(template.items)
    ) {
      merged.items = (template.items as Record<string, unknown>[]).map(
        (templateItem, i) => {
          const generated = (value[i] ?? {}) as Record<string, unknown>;
          const mergedItem = { ...templateItem };
          for (const [itemKey, itemValue] of Object.entries(generated)) {
            if (itemValue !== undefined && itemValue !== "") {
              mergedItem[itemKey] = itemValue;
            }
          }
          return mergedItem;
        },
      );
      continue;
    }

    merged[key] = value;
  }

  return merged;
};

export type HomepageCopyResult = {
  sections: TemplateSection[];
  usedFallback: boolean;
};

/**
 * Generate homepage copy (Haiku 4.5, temp 0.2, 16k out — monolith parity) and
 * merge it into the template. Any failure falls back to the template's stub
 * copy, exactly like the monolith — visible in the result so callers can
 * record it rather than mistake stubs for output.
 */
export async function generateHomepageCopy(input: {
  tone: BrandKitTone;
  evaluation?: PregenNativeBrandKit;
  source: HomepageCopySource;
}): Promise<HomepageCopyResult> {
  const template = buildHomepageTemplate();
  const plan = buildCopyGenerationPlan(template);
  const schema = buildCopySchema(template);
  const prompt = buildHomepagePrompt({ ...input, sections: template });

  try {
    const { output } = await generateText({
      model: anthropic("claude-sonnet-5"),
      output: Output.object({ schema }),
      temperature: 0.2,
      maxOutputTokens: 16_000,
      prompt,
    });

    const generated = output.sections;
    const sections = [...template];
    plan.forEach(({ templateIndex }, outputIndex) => {
      const copy = generated[`s${outputIndex + 1}`] as
        | Record<string, unknown>
        | undefined;
      const templateSection = sections[templateIndex];
      if (copy && templateSection) {
        sections[templateIndex] = mergeSectionCopy(templateSection, copy);
      }
    });

    return { sections, usedFallback: false };
  } catch (error) {
    // Fallback keeps monolith behavior (stub copy beats a dead build), but the
    // reason must be visible — a silent fallback looks like a working build.
    console.error(
      "[pregen] homepage copy generation failed, using template stubs",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return { sections: template, usedFallback: true };
  }
}

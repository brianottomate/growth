import type {
  ContentBriefGroundingContext,
  ContentBriefInput,
} from "./contract";
import { EDITORIAL_RULES } from "./editorial";

// Versioned workbench copy of the site-editor prompt and shared copy voice.
// The lab records its exact prompt text with each immutable run. Production
// evolves independently, so every workbench prompt change needs a new version.

export const PROMPT_VERSION = "content-brief-page/workbench-v6-2026-10-02";

/**
 * Builds the system prompt for generating a page from a content brief.
 *
 * The brief supplies the structure and the target query, the grounding context supplies the
 * substance.
 *
 * The rules below were tuned against an evaluation harness: the anti-fabrication block (no
 * invented numbers, including "illustrative" ones) removed the fabrication that otherwise appears
 * across every model, the first-hand framing lifted the "would Google treat this as original,
 * people-first content" score, and the confidence rule stops the model over-deferring to "ask the
 * host" once fabrication is banned.
 */
export const buildContentBriefPagePrompt = (
  brief: ContentBriefInput,
  context: ContentBriefGroundingContext,
): string =>
  [
    `You are writing one long-form guide for ${context.businessName}, a vacation-rental property`,
    `manager. The guide must genuinely help someone searching: "${brief.targetQuery}".`,
    ``,
    `Write from the manager's supplied knowledge of these homes and this area. Your edge over a generic`,
    `roundup is the specific, real detail in the facts below. Help the reader make the travel decision`,
    `before promoting the portfolio. Each section should add a useful distinction, practical detail or`,
    `supported recommendation. Never manufacture that specificity: draw it from`,
    `the facts, and where you lack a detail, be honestly useful instead of padding with generic advice.`,
    ``,
    `Use a real home when its supplied features make the travel advice concrete. Select examples for`,
    `a distinct, evidenced fit, not equal coverage of the inventory. A spacious interior alone does not`,
    `establish a unique seasonal recommendation. Do not force a property into every section or recommend`,
    `three homes per season by habit. If a home is only a partial match, explain the supported tradeoff.`,
    ``,
    `# Who is searching, and what they need`,
    brief.guestIntent,
    ``,
    `# Editorial decisions`,
    EDITORIAL_RULES,
    ``,
    `# What this page must do`,
    brief.summary,
    brief.suggestedWordCount === null
      ? `Lead each section with a direct, citable answer, then support it.`
      : `Aim for roughly ${brief.suggestedWordCount} words. Lead each section with a direct, citable answer.`,
    `Cover these entities naturally where relevant: ${brief.entitiesToCover.join(", ")}.`,
    ``,
    `# Section outline (write one section per heading, in this order)`,
    renderOutline(brief),
    ``,
    `# Grounded facts — the ONLY source of specific claims`,
    renderFacts(context),
    ``,
    `# Grounding rules (critical — the page's credibility depends on this)`,
    `- Never invent, fabricate, or infer a fact. Every specific claim must trace to the facts above.`,
    `- NO INVENTED NUMBERS OF ANY KIND. Do not state a temperature, price, dollar amount, percentage,`,
    `  bedroom/bathroom/bed/bunk count, distance, ratio, or date unless that exact figure is in the`,
    `  facts. This includes "illustrative" or "example" figures: a made-up number is still fabrication`,
    `  and is the single biggest failure mode here. Use no number you do not have — describe it`,
    `  qualitatively, or tell the reader to confirm it with the host.`,
    `- When the brief asks about something the facts don't cover (bathroom counts, exact seasonal`,
    `  pricing, water temperatures), turn it into useful guidance to ASK, never an invented answer.`,
    `- But answer confidently from the rich facts you DO have — the real homes, their capacities, pools,`,
    `  positions, amenities, price band, and locations. Do not hedge what you know. Reserve "ask the host"`,
    `  for genuine gaps only; never repeat it as a refrain or let it replace an answer the facts support.`,
    `- Pricing: general terms only; never an exact nightly rate, a per-person figure, or a`,
    `  hotel-comparison number you made up.`,
    `- Mention a specific home only where it genuinely helps, linked with its exact href from the facts`,
    `  (e.g. <a href="/property/...">Name</a>). Never invent a home, an amenity it lacks, or a link.`,
    `- Where the honest answer is "it depends" or "confirm with the host", say so — that earns trust and`,
    `  reads as genuine operator knowledge, not a search-engine-first roundup.`,
    `- A missing amenity in the supplied facts means unknown, not absent. Do not write "no pool" or`,
    `  "no pool is listed" from an incomplete amenity list. Do not claim fixed features such as bedroom`,
    `  counts vary by booking date. Do not invent concierge services or promises to arrange bookings.`,
    ``,
    `# Voice`,
    context.voice ??
      `Warm, plain-spoken, and specific. Earn trust with concrete detail, never superlatives.`,
    COPY_VOICE_RULES,
    ``,
    COPY_EXEMPLARS,
  ].join("\n");

/**
 * Renders the brief's outline into a numbered spec the model writes against.
 */
const renderOutline = (brief: ContentBriefInput): string =>
  brief.outline
    .map(
      (s, i) => `${i + 1}. ${s.heading}\n   - ${s.keyPoints.join("\n   - ")}`,
    )
    .join("\n");

/**
 * Renders the grounded facts, including the real homes the copy may name and link.
 */
const renderFacts = (context: ContentBriefGroundingContext): string => {
  const properties = context.properties
    .map((p) => {
      const sleeps = p.sleeps === null ? "" : `sleeps ${p.sleeps}, `;
      const bedrooms = p.bedrooms === null ? "" : `${p.bedrooms} bed, `;
      const location = p.location === null ? "" : `${p.location}. `;
      return `- ${p.name} (${p.href}): ${bedrooms}${sleeps}${location}Amenities: ${p.amenities.join(", ")}.`;
    })
    .join("\n");

  return [
    context.summary === null
      ? `Business: ${context.businessName}.`
      : `Business: ${context.businessName}. ${context.summary}`,
    context.locations.length > 0
      ? `Locations: ${context.locations.join("; ")}.`
      : "",
    context.amenities.length > 0
      ? `Amenities across the portfolio: ${context.amenities.join(", ")}.`
      : "",
    context.activities.length > 0
      ? `Activities nearby: ${context.activities.join(", ")}.`
      : "",
    context.targetAudience === null
      ? ""
      : `Audience: ${context.targetAudience}.`,
    context.distinctiveFeatures.length > 0
      ? `Distinctive: ${context.distinctiveFeatures.join("; ")}.`
      : "",
    context.typicalPriceRange === null
      ? ""
      : `Typical price range: ${context.typicalPriceRange}.`,
    properties.length > 0
      ? `Bookable homes (link to these with their exact href when it helps):\n${properties}`
      : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
};

// ---- MONOLITH COPY VOICE (verbatim) -----------------------------------

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

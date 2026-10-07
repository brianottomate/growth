import {
  CATALOG_COPY_INTENTS,
  COMPOSITION_TEMPLATES,
  type CatalogCopyTemplateId,
} from "@/lib/compositions";

/**
 * Shipped catalog headlines, human-written, as the voice to aim for: Silvina's
 * Chalets Hocking Hills and Hollyhock Suites catalogs. Examples of a great
 * card rather than rules against bad ones.
 */
const CATALOG_VOICE_EXAMPLES = [
  "Hot tub & waterfall in Hocking Hills, Ohio",
  "Lodge with private pool in Hocking Hills, Ohio",
  "Romantic cabin in Hocking Hills, Ohio",
  "Cozy cabin with hot tub in Hocking Hills, Ohio",
  "Sauna & hot tub in Hocking Hills, Ohio",
  "Outdoor fire pit & hot tub in Hocking Hills, Ohio",
  "Modern loft with river views in Louisville, KY",
  "Soaking tub & city views in Louisville, KY",
  "Suite by the Convention Center in Louisville, KY",
  "Two-story loft suite in Louisville, KY",
  "Coffee bar & soaking tub in Louisville, KY",
  "Entire building with 7 suites in Louisville, KY",
] as const;

/**
 * How a catalog card's headline and hero are chosen. One text for every
 * surface that writes catalog copy: the per-home chat, the whole-catalog
 * review and the New copy button, so they never pull a card in different
 * directions. It describes a great card rather than listing banned words:
 * approved cards are the taste signal, and only what the card can physically
 * draw is enforced in code.
 */
export function catalogCopyRules(input: {
  /** The catalog's place suffix, e.g. "Logan, OH". */
  place: string | null;
  /** Amenities nearly every home in this catalog lists. */
  brandWide: readonly string[];
  /** The card being written; omitted, every catalog layout is described. */
  templateId?: string;
}): string {
  const brandWide = input.brandWide.length
    ? ` In this catalog these are on nearly every home, ${input.brandWide.join(", ")}. When one is this home's draw it is a fine lead; when the home has more, pair it with what this home adds.`
    : "";
  const intent = (id: string) =>
    CATALOG_COPY_INTENTS[id as CatalogCopyTemplateId] ?? null;
  const layout = (id: CatalogCopyTemplateId) => {
    const card = CATALOG_COPY_INTENTS[id];
    const label = COMPOSITION_TEMPLATES.find((t) => t.id === id)?.label ?? id;
    const length = card.placeSuffix
      ? `The lead before " in" should aim for ${card.headlineChars} characters so it stays on two lines (the card cannot draw more than 37); the place is where a guest would search, the destination region the listing or brand names (e.g. "Hocking Hills, Ohio") over a small town's postal name${input.place ? ` (current: ${input.place})` : ""}; use this home’s assigned destination, which can differ between homes.`
      : `The headline is at most about ${card.headlineChars} characters so it stays on two lines.`;
    return `"${label}" card: ${card.intent} ${length}`;
  };
  const own = input.templateId ? intent(input.templateId) : null;
  const layouts = own
    ? layout(input.templateId as CatalogCopyTemplateId)
    : (Object.keys(CATALOG_COPY_INTENTS) as CatalogCopyTemplateId[])
        .map(layout)
        .join("\n\n");
  return `A catalog card is a product tile: Meta shows it in a scroll of this brand's homes, to people the brand did not pick, so the card says why to book this home. Occasions and audiences (a Derby weekend, a bachelorette) belong to campaign ads; the catalog describes the home.

${layouts}

Voice: plain, warm and short, the way a good host would sum the place up in one line. Name the draw a guest is searching for, and let the kind of home or one warm word carry the rest. Cards our designers shipped, the voice and quality to aim for:
${CATALOG_VOICE_EXAMPLES.map((line) => `- "${line}"`).join("\n")}
Each names one or two things a guest pictures themselves using or seeing, or the kind of home with its best feature, and stops.

The best line is usually in the listing title, the opening of the description and the location paragraph, so read those before the amenity list. When the title names a feature ("with soaking tub", "on 50 acres", "river views"), that is the operator's own pick of the draw and the first candidate for the lead. The amenity list is evidence, not the message.${brandWide} A number can sell when it is the point and the facts line does not already show it (12 acres, 7 suites, 2 miles from the falls).

A strong lead is something to soak in, play or gather around, a view, grounds, a layout that fits the group, a landmark a guest would walk to, or the kind of home when that is the draw (a lodge, an A-frame, a loft, a whole building). The draw a whole catalog shares (a hot tub in cabin country, a city view downtown) is a strong lead, and cards may share it: a guest sees one or two cards at a time, and the right draw said plainly beats a rarer detail. A warm word is welcome when the home fits it: a secluded cabin for two is a "Romantic cabin", a bright downtown loft is a "Modern loft". How a room is furnished or finished, its screens, how the home is reached and its accessibility features are true and matter to some guests, and they live in the listing and the pills; the headline leads with them only when the listing's title does.

Prefer sentence case and one clear idea or two joined by "&". Short is good: the character limit is a ceiling. Frame facts around what a guest gains without inventing a benefit; an interior suite is not evidence of quiet or soundproofing.

Truth: use only this home's own listing, never a fact from a sibling. Keep the listing's qualifiers ("seasonal" stays seasonal; "private" only when the listing says private, so a community pool is not a private pool), and when one does not fit, change the pairing ("Seasonal private pool") rather than drop it. A shared amenity never reads as the home's own, and each claim is as strong as the listing makes it ("steps to the slopes" is slope access, not ski-in). A service guests can book (a private chef) is not a feature of the home. Describe a style in plain words, never by another company's product or character. The facts line shows bedrooms · baths · guests. Prefer a headline that adds a reason to book, but capacity, unit counts and amenities can be the draw. Listing titles often say "bed" for bedroom.

Hero: a catalog card sells the stay at a glance, so default to the home's exterior in good light, or an aerial when the home sits on grounds, a pool or a view that sells it. People enjoying the home are a plus. Use an interior when it is the home's signature (a wall of windows, a great room, a downtown loft) and the exterior is weak. Avoid bathrooms, close-ups, and dark, cluttered or tilted frames.`;
}

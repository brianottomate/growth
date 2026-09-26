import {
  CATALOG_COPY_INTENTS,
  COMPOSITION_TEMPLATES,
  type CatalogCopyTemplateId,
} from "@/lib/compositions";

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
    ? ` In this catalog these are on nearly every home, so they are the brand's, not the home's: ${input.brandWide.join(", ")}. They support a lead; they rarely are one.`
    : "";
  const intent = (id: string) =>
    CATALOG_COPY_INTENTS[id as CatalogCopyTemplateId] ?? null;
  const layout = (id: CatalogCopyTemplateId) => {
    const card = CATALOG_COPY_INTENTS[id];
    const label = COMPOSITION_TEMPLATES.find((t) => t.id === id)?.label ?? id;
    const length = card.placeSuffix
      ? `The lead before " in" is at most ${card.headlineChars} characters so it stays on two lines (the card cannot draw more than 37); the place is where a guest would search, the destination region the listing or brand names (e.g. "Hocking Hills, Ohio") over a small town's postal name${input.place ? ` (current: ${input.place})` : ""}, one place for every card in the catalog.`
      : `The headline is at most about ${card.headlineChars} characters so it stays on two lines.`;
    return `"${label}" card: ${card.intent} ${length}`;
  };
  const own = input.templateId ? intent(input.templateId) : null;
  const layouts = own
    ? layout(input.templateId as CatalogCopyTemplateId)
    : (Object.keys(CATALOG_COPY_INTENTS) as CatalogCopyTemplateId[])
        .map(layout)
        .join("\n\n");
  return `A catalog card is a product tile: Meta shows it in a scroll of this brand's homes, to people the brand did not pick, so the card says what this home offers that the cards beside it do not. Occasions and audiences (a Derby weekend, a bachelorette) belong to campaign ads; the catalog describes the home.

${layouts}

The best line is usually in the description and the location paragraph, so read those before the amenity list. The amenity list is evidence, not the message: everyday items describe every home.${brandWide} A number can sell when it is the point (sleeps 22 in a lodge, 12 acres).

Sentence case, "&" to join two ideas, never an em dash.

When homes are near-identical (units in one building), a strong real lead shared with a few other cards beats a weak unique one: vary the pairing and the wording. Look-alike homes (numbered A-frames, units on one lane) get different angles from their own descriptions and photos. Keep the listing's qualifiers exactly: "seasonal" stays seasonal, and "private" appears only when the listing says private (a community pool is not a private pool). Use only this home's own listing; never invent a fact or borrow one from a sibling. The facts line is bedrooms · baths · guests unless the operator asks otherwise.

Hero: a catalog card sells the stay at a glance, so default to the home's exterior in good light, or an aerial when the home sits on grounds, a pool or a view that sells it. People enjoying the home are a plus. Use an interior when it is the home's signature (a wall of windows, a great room, a downtown loft) and the exterior is weak. Avoid bathrooms, close-ups, and dark, cluttered or tilted frames.`;
}

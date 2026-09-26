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
  /** The card being written; omitted, both catalog templates are described. */
  templateId?: string;
}): string {
  const brandWide = input.brandWide.length
    ? ` In this catalog these are on nearly every home, so they are the brand's, not the home's: ${input.brandWide.join(", ")}. They support a lead; they rarely are one.`
    : "";
  const withPlace = `A "Catalog · place" card reads "{lead} in {place}": the lead is at most 28 characters so it stays on two lines (the card cannot draw more than 37), and the place is where a guest would search, the destination region the listing or brand names (e.g. "Hocking Hills, Ohio") over a small town's postal name${input.place ? ` (current: ${input.place})` : ""}, one place for every card in the catalog.`;
  const noPlace = `A "Catalog · copy" card has no place line: the headline is the whole statement, at most about 40 characters so it stays on two lines.`;
  const length =
    input.templateId === "catalog-place"
      ? withPlace
      : input.templateId === "catalog-copy"
        ? noPlace
        : `${withPlace} ${noPlace}`;
  return `A catalog card is a product tile: Meta shows it in a scroll of this brand's homes, to people the brand did not pick, so the headline says what this space is and why it is unlike the cards beside it. Describe it the way a friend who has stayed there would: what the place is, what being there is like, what no other card in this catalog can claim. "Two suites joined for groups", "Log cabin with a private sauna", "Rooftop deck over the skyline", "12 wooded acres by a stream". Occasions and audiences (a Derby weekend, a bachelorette) belong to campaign ads; the catalog describes the space.

The best line is usually in the description and the location paragraph, so read those before the amenity list. The amenity list is evidence, not the message: everyday items describe every home.${brandWide} A number can sell when it is the point (sleeps 22 in a lodge, 12 acres).

${length} Sentence case, "&" to join two ideas, never an em dash.

When homes are near-identical (units in one building), a strong real lead shared with a few other cards beats a weak unique one: vary the pairing and the wording. Look-alike homes (numbered A-frames, units on one lane) get different angles from their own descriptions and photos. Keep the listing's qualifiers exactly: "seasonal" stays seasonal, and "private" appears only when the listing says private (a community pool is not a private pool). Use only this home's own listing; never invent a fact or borrow one from a sibling. The facts line is bedrooms · baths · guests unless the operator asks otherwise.

Hero: a catalog card sells the stay at a glance, so default to the home's exterior in good light, or an aerial when the home sits on grounds, a pool or a view that sells it. People enjoying the home are a plus. Use an interior when it is the home's signature (a wall of windows, a great room, a downtown loft) and the exterior is weak. Avoid bathrooms, close-ups, and dark, cluttered or tilted frames.`;
}

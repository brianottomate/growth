/**
 * How a catalog card's headline and hero are chosen. One text for every
 * surface that writes catalog copy: the per-home chat and the whole-catalog
 * review, so the two never pull a card in different directions.
 */
export function catalogCopyRules(input: {
  /** The card's current place suffix, e.g. "Logan, OH". */
  place: string | null;
  /** Amenities nearly every home in this catalog lists. */
  brandWide: readonly string[];
}): string {
  const brandWide = input.brandWide.length
    ? ` In this catalog these are on nearly every home, so they are the brand's, not the home's: ${input.brandWide.join(", ")}. Never lead with one; pair one with the home's own feature only when nothing else sells it.`
    : "";
  return `Headline: "{lead} in {place}", at most 28 characters before " in", so it stays on two lines (the card cannot draw more than 37). Lead with what makes this home different from the other homes in the catalog, not with what every home has. Read the description and location paragraph before the amenity list: the better line is usually there (a sauna, a shower for two, a seasonal waterfall, an arcade bunk room, 12 wooded acres by a stream, sleeps 22, 2 miles from a landmark). Text every listing repeats word for word (an "All our homes include..." paragraph) is brand boilerplate, not a lead.${brandWide} Utility labels (Wifi, Elevator, Dedicated workspace, Dining table) are a last resort. Never lead with supplies or small appliances (mini fridge, blender, kettle, dishwasher, spice rack, dinnerware, a safe, blackout curtains), with paid or street parking, or with anything negative ("windowless"). Treat an amenity that does not fit the home (waterfront or tennis courts on a downtown suite) as feed noise unless the description confirms it.

Shapes that work: "{home type} with {feature}" (Log cabin with private sauna), "{feature} & {feature}" (Shower for two & hot tub), "{guest or mood} {home type}" (Pet-friendly A-frame), and a number that sells (10-person hot tub & game room, A-frame lodge that sleeps 22). Join with "&", never "+". Sentence case. Never use an em dash anywhere in copy; use a comma or two short phrases.

The place is where a guest would search: the destination region the listing or brand names (e.g. "Hocking Hills, Ohio") beats a small town's postal name${input.place ? ` (current: ${input.place})` : ""}. Use one place for every card in the catalog.

Cards lead differently where the homes differ. When many homes in the catalog are near-identical (units in one building), a strong real lead shared with a few other cards beats a trivial unique one: vary the pairing and the wording instead of reaching for a weak detail. Look-alike homes (numbered A-frames, units on one lane, twins built from one plan) get different angles from their own descriptions and photos, never synonyms of one line. Keep the listing's qualifiers: "seasonal" stays seasonal, and "private" appears only when the listing says private (a community or shared pool is not a private pool). Never invent a fact: "Hot tub" never becomes "private hot tub". Use only this home's own listing, never a fact from a sibling. The facts line is bedrooms · baths · guests unless the operator asks otherwise.

Hero: a catalog card sells the stay at a glance, so default to the home's exterior in good light, or an aerial when the home sits on grounds, a pool or a view that sells it. People enjoying the home are a plus. Use an interior only when it is the home's signature (a wall of windows, a great room) and the exterior is weak. Avoid bathrooms, close-ups, and dark, cluttered or tilted frames.`;
}

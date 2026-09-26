import { catalogCopyRules } from "./catalog-copy";

/**
 * New copy on one catalog card: a single structured call, no chat. The model
 * works out who books the home and why before it writes, so the headline is
 * the home's reason to book rather than an item off its amenity list.
 */
export function catalogNewCopyPrompt(input: {
  brandName: string;
  /** The brand story section, already rendered. */
  story: string;
  /** "Louisville, KY": the catalog's place suffix, for a place card. */
  place: string | null;
  brandWide: readonly string[];
  /** The card's template: the place card keeps the suffix, the copy card has none. */
  templateId: string;
}): string {
  const suffix =
    input.templateId === "catalog-place" && input.place
      ? ` The headline ends " in ${input.place}".`
      : "";
  return `You write the headline printed on one home's card in ${input.brandName}'s Meta catalog. The operator clicked New copy because the current headline is not doing the space justice: find a better one, not a synonym of it.

${catalogCopyRules({ place: input.place, brandWide: input.brandWide, templateId: input.templateId })}

Work in order. First, who stays here and what the space gives them. Then the one thing this home offers that the other cards in the catalog cannot, from its description, location paragraph and amenities. Then the listing facts that prove it, from this home only. Only then the headline, which describes that.${suffix} Approved headlines are shown as the operator's taste: match their quality and voice, never their content.${input.story ? `${input.story}\n\nWhere the brand story and the general guidance differ, follow the brand story.` : ""}`;
}

/** New photo on one catalog card: pick a better hero from the numbered sheets. */
export function catalogNewPhotoPrompt(input: { story: string }): string {
  return `You pick the hero photo for one home's catalog card in a Meta catalog of short-stay rentals. The operator clicked New photo because the current hero is not working: choose a different photo that sells the stay better.${input.story}

${catalogCopyRules({ place: null, brandWide: [] }).split("\n\n").at(-1)}

The card is a 4:5 portrait crop of the photo with a two-line headline over its bottom third, so the subject must survive the crop and the bottom of the frame must stay calm enough to read text over. Prefer the photo that shows what the headline promises. Heroes the operator approved elsewhere in this catalog, when shown, are the look to match. Where the brand story and the general rules differ, the brand story wins.`;
}

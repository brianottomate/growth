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
  /** "Louisville, KY": the suffix every headline in this catalog keeps. */
  place: string | null;
  brandWide: readonly string[];
}): string {
  return `You write the headline printed on one home's card in ${input.brandName}'s Meta catalog. The operator clicked New copy because the current headline is weak: find a better one, not a synonym of it.

General rules for catalog headlines:
${catalogCopyRules({ place: input.place, brandWide: input.brandWide })}

Work in order. First, who books this home and for what. Then the single reason this home wins over the other cards in the catalog, from its description, location paragraph and amenities. Then the listing facts that prove it, quoted from this home only. Only then the headline, which states that reason.${input.place ? ` The headline ends " in ${input.place}".` : ""} Approved headlines are shown as the operator's taste: match their quality and voice, never their content.${input.story ? `${input.story}\n\nThe brand story overrides the general rules. Every "never" and "avoid" in it is a hard rule for the headline, with no exceptions for pairing it with something else: if it bans guest-count phrasing, no "sleeps N" and no "for N" at all.` : ""}`;
}

/** New photo on one catalog card: pick a better hero from the numbered sheets. */
export function catalogNewPhotoPrompt(input: { story: string }): string {
  return `You pick the hero photo for one home's catalog card in a Meta catalog of short-stay rentals. The operator clicked New photo because the current hero is not working: choose a different photo that sells the stay better.${input.story}

${catalogCopyRules({ place: null, brandWide: [] }).split("\n\n").at(-1)}

The card is a 4:5 portrait crop of the photo with a two-line headline over its bottom third, so the subject must survive the crop and the bottom of the frame must stay calm enough to read text over. Prefer the photo that shows what the headline promises. Heroes the operator approved elsewhere in this catalog, when shown, are the look to match. Where the brand story and the general rules differ, the brand story wins.`;
}

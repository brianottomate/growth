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
export function catalogNewPhotoPrompt(input: {
  story: string;
  /** Judging a card in a full pass rather than answering a New photo click. */
  judge?: boolean;
  /** "late September", and the market's seasons, so the hero can fit the time of year. */
  season?: string | null;
}): string {
  const task = input.judge
    ? "Judge whether the current hero is the best photo for the card, and pick a better one only when it clearly is."
    : "The operator clicked New photo because the current hero is not working: choose a different photo that sells the stay better.";
  return `You pick the hero photo for one home's catalog card in a Meta catalog of short-stay rentals. ${task}${input.story}

${catalogCopyRules({ place: null, brandWide: [] }).split("\n\n").at(-1)}

The card is a 4:5 portrait crop of the photo with a two-line headline over its bottom third, so the subject must survive the crop and the bottom of the frame must stay calm enough to read text over. Prefer the photo that shows what the headline promises, and that stops a thumb in a feed: people enjoying the place, warm light, a view.${input.season ? ` ${input.season} All else equal, prefer a frame that fits the time of year (autumn colour in fall, snow in winter, green in summer); never pick a worse photo for its season.` : ""} Heroes the operator approved elsewhere in this catalog, when shown, are the look to match. Where the brand story and the general rules differ, the brand story wins.`;
}

/**
 * The editor's read of a whole catalog: a guest scrolls these cards side by
 * side, so sameness and weak leads only show up as a set.
 */
export function catalogEditSetPrompt(input: {
  brandName: string;
  /** The brand story section, already rendered. */
  story: string;
  /** The copy rules for the templates the catalog uses. */
  rules: string;
}): string {
  return `You are the editor of ${input.brandName}'s Meta catalog. A guest scrolls these cards side by side in a carousel. Read them as a set.

${input.rules}

Rewrite a card only when it needs it: when it reads like the cards around it (the same angle, the same opening, the same pill set), when it leads with something every home has or something expected (a screen, wifi, an appliance, blackout curtains), or when it frames a fact as a lack. Keep strong cards as they are, and never touch an approved card. Across the set, pills should vary: each card's pills name what sets that home apart, and the same three pills should not appear on most cards. Each edit gives the full new headline and pills, written to the rules above, and a few words on why.

Then suggest exclusions: homes a guest would not miss because another card already sells the same suite better (near-identical units in one building), at most a third of the catalog, weakest first, with a few words on why. These are suggestions for the operator, who decides.${input.story ? `${input.story}\n\nWhere the brand story and the general rules differ, follow the brand story.` : ""}`;
}

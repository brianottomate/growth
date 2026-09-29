import { isPlaceCard } from "@/lib/catalog-studio";
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
    isPlaceCard(input.templateId) && input.place
      ? ` The headline ends " in ${input.place}".`
      : "";
  return `You write the headline printed on one home's card in ${input.brandName}'s Meta catalog. The operator clicked New copy because the current headline is not doing the space justice: find a better one, not a synonym of it. Better usually means the real draw said plainly, not a rarer detail.

${catalogCopyRules({ place: input.place, brandWide: input.brandWide, templateId: input.templateId })}

Work in order, from the whole home, not from one photo. First, who stays here and what the space gives them. Then the strongest reason to book this home, from all of its listing: its photos on the numbered sheets, its description, location paragraph and amenities, and its market. When the description is boilerplate the brand repeats on every home, the photos are the evidence of what the space offers (a view, a great room, a deck), not an inventory of its fixtures. Then the listing facts that prove it, from this home only. Only then the headline, which describes that. The headline sits on the card's photo: it must never contradict it (no porch over a pool shot, no lake over a bedroom), but it names what the home is chosen for, not only what that one photo shows. When another photo shows that better than the card's, give its number as showPhoto.${suffix} Approved headlines are shown as the operator's taste: match their quality and voice, never their content.${input.story ? `${input.story}\n\nWhere the brand story and the general guidance differ, follow the brand story.` : ""}`;
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

The card is a 4:5 portrait crop of the photo with a two-line headline over its bottom third, so the subject must survive the crop and the bottom of the frame must stay calm enough to read text over. Never pick a photo with anything baked into it: text, a logo, a map pin or marker, a map, a watermark, a promo banner, a collage, a screenshot or a floor plan. Prefer the photo that shows what the headline promises, and that stops a thumb in a feed: people enjoying the place, warm light, a view.${input.season ? ` ${input.season} All else equal, prefer a frame that fits the time of year (autumn colour in fall, snow in winter, green in summer); never pick a worse photo for its season.` : ""} Heroes the operator approved elsewhere in this catalog, when shown, are the look to match. Where the brand story and the general rules differ, the brand story wins.`;
}

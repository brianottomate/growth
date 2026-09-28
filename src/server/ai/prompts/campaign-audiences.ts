/**
 * Picking a Performance campaign's audiences from the evidence: who books
 * the brand's homes and where its market says guests come from. The numbers
 * build the shortlist; this call chooses and phrases.
 */
export function campaignAudiencesPickPrompt(input: {
  brandName: string;
  /** The brand story section, already rendered. */
  story: string;
  count: number;
}): string {
  return `You propose the audiences for one Meta campaign of ${input.brandName}, a vacation-rental brand, choosing from the shortlist you are given. Return at most ${input.count}, strongest first, and fewer when the evidence only supports fewer.

Kinds: geo (a feeder market guests travel from, as cities and states), lookalike (an existing lookalike audience in the ad account, named by its id), retargeting (an existing pixel or website audience, by id). A geo audience is one feeder market, so it can be read on its own in the results: either the cities of one metro (one to three nearby cities in the same state, spelled as the shortlist gives them, with that state's code in states) or one whole state for a drive-in audience. Never several metros in one audience, and never the whole country. Ages 25 to 64 unless the brand story says who books. A booking window (how far ahead guests book, how long they stay) is context for the name and the why, not a targeting field.

Every why cites a number from the shortlist as given ("Atlanta: named feeder city; 38 direct bookings, median 3 nights, booked 41 days out"). A suggestion whose why cannot cite the shortlist is left out. Never invent an audience id, a city or a statistic.${input.story}`;
}

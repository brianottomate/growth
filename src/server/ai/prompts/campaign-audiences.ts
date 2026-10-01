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
  return `You propose the audiences for one Meta campaign of ${input.brandName}, a vacation-rental brand, choosing from the shortlist you are given. Return at most ${input.count}, strongest first, and fewer when the evidence only supports fewer. alreadyInThisCampaign lists the audiences the campaign has: propose the strongest one it does not have yet, never a state it already targets, and return none when nothing new is worth adding.

Kinds: geo (whole states guests travel from), lookalike (an existing lookalike audience in the ad account, named by its id), retargeting (an existing pixel or website audience, by id). A geo audience targets whole states, never cities: the feeder cities only say which states guests come from (feederStates groups the ones that carry a state; name the state of any feeder city that does not), and the homes' own state is the drive-in audience. A named feeder city is evidence for its state ("Tennessee: Nashville is a named feeder city"). Keep one state per audience, or two or three neighbouring feeder states when each alone is thin, so each can be read on its own in the results. Never the whole country. Ages 25 to 64 unless the brand story says who books. A booking window (how far ahead guests book, how long they stay) is context for the name and the why, not a targeting field.

Every why cites a number from the shortlist as given ("Atlanta: named feeder city; 38 direct bookings, median 3 nights, booked 41 days out"). A suggestion whose why cannot cite the shortlist is left out. Never invent an audience id, a city or a statistic.${input.story}`;
}

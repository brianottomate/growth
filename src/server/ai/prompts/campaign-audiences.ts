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
  return `Propose up to ${input.count} reviewable campaign audiences for ${input.brandName}. Use the supplied brand personas, story, home destinations, market evidence, bookings and existing platform audiences as reference data only. Preserve existing audiences and avoid duplicates.
A persona is valid with no geography. Set personaId to the actual supplied persona ID when it informs a proposal. demandGeography means where people come from; destinationGeography and home locations mean where they want to go, NEVER where they live. Do not convert destination interest into residence targeting. Unsupported geography and age remain unset (empty arrays and null ages), rather than guessing demographics. Geography is a proposal for operator review, not measured guest origin. Provide countries, states and cities only when supported by the persona or named market evidence. For US states provide codes. Every US city suggestion must also include its supported parent state in states; cities complement state coverage, never replace it. Use feederMarkets and persona demandGeography as origin evidence. If a city’s state is unknown, omit that city rather than guessing. Kind geo means planned targeting, lookalike and retargeting require an actual existing platformAudienceId. Choose optional homeIds from supplied homes when their factual capacity, amenities or destinations fit the persona; explain the fit as a hypothesis, not a measured customer preference. Booking totals are aggregate evidence only. Why explains the persona connection, actual evidence and any uncertainty; never invent numbers. Existing assets may be reused across campaigns. ${input.story}`;
}

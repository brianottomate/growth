import { usStateCode } from "./us-states";

/** Fill city-to-state gaps from origin evidence, excluding already covered states. */
export function campaignGeography(
  proposal: { states: string[]; originCities: string[]; countries?: string[] },
  feeders: { city: string; state: string | null }[],
  coveredStates: ReadonlySet<string>,
) {
  if (proposal.countries?.length && !proposal.countries.includes("US")) {
    return { states: [], originCities: [...new Set(proposal.originCities)] };
  }
  const parentState = (city: string) => {
    const explicit = usStateCode(city.split(",").at(-1)?.trim() ?? "");
    if (explicit) return explicit;
    const matches = new Set(
      feeders
        .filter(
          (feeder) => feeder.city.toLowerCase() === city.trim().toLowerCase(),
        )
        .flatMap((feeder) => {
          const state = usStateCode(feeder.state ?? "");
          return state ? [state] : [];
        }),
    );
    return matches.size === 1 ? [...matches][0]! : null;
  };
  const originCities = proposal.originCities.filter((city) => {
    const state = parentState(city);
    return state && !coveredStates.has(state);
  });
  const states = [
    ...new Set(
      [
        ...proposal.states.map(usStateCode),
        ...originCities.map(parentState),
      ].filter(
        (state): state is string =>
          Boolean(state) && !coveredStates.has(state!),
      ),
    ),
  ];
  return { states, originCities };
}

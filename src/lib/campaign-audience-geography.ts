import { usStateCode } from "./us-states";

/** Fill city-to-state gaps from origin evidence, excluding already covered states. */
export function campaignGeography(
  proposal: { states: string[]; cities: string[] },
  feeders: { city: string; state: string | null }[],
  coveredStates: ReadonlySet<string>,
) {
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
  const cities = proposal.cities.filter((city) => {
    const state = parentState(city);
    return state && !coveredStates.has(state);
  });
  const states = [
    ...new Set(
      [...proposal.states.map(usStateCode), ...cities.map(parentState)].filter(
        (state): state is string =>
          Boolean(state) && !coveredStates.has(state!),
      ),
    ),
  ];
  return { states, cities };
}

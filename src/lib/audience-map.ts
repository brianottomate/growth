import { usStateCode } from "./us-states";

export type AudienceGeography = {
  countries?: string[];
  states?: string[];
  regions?: string[];
  cities?: string[];
};

/** "Seattle, WA" or "Seattle, Washington, US" → "WA"; a bare city has none. Callers decide whether the place is in the US. */
export function cityState(city: string) {
  const [, ...rest] = city.split(",").map((part) => part.trim());
  return rest.map((part) => usStateCode(part)).find(Boolean) ?? null;
}

/** Display interpretation only: never rewrites the saved platform targeting. */
export function audienceMapTarget(geography: AudienceGeography | null) {
  const countries = new Set(
    (geography?.countries ?? []).map((c) => c.trim().toUpperCase()),
  );
  const states = new Set<string>();
  const cityStates = new Set<string>();
  const isUS = !countries.size || countries.has("US");
  for (const place of [
    ...(geography?.states ?? []),
    ...(geography?.regions ?? []),
  ]) {
    const code = isUS ? usStateCode(place) : null;
    if (code) states.add(code);
  }
  // A city reaches part of its state: shown, never treated as the whole state.
  for (const city of geography?.cities ?? []) {
    const code = isUS ? cityState(city) : null;
    if (code) cityStates.add(code);
  }
  if (!countries.size && (states.size || cityStates.size)) countries.add("US");
  const narrowed = Boolean(
    geography?.states?.length ||
    geography?.regions?.length ||
    geography?.cities?.length,
  );
  return { countries, states, cityStates, narrowed };
}

export function audienceMapCoverage(
  targets: ReturnType<typeof audienceMapTarget>[],
  view: "us" | "world",
  id: string,
): "full" | "partial" | "none" {
  if (view === "us") {
    if (
      targets.some(
        (t) => (t.countries.has("US") && !t.narrowed) || t.states.has(id),
      )
    )
      return "full";
    return targets.some((t) => t.cityStates.has(id)) ? "partial" : "none";
  }
  if (targets.some((t) => t.countries.has(id) && !t.narrowed)) return "full";
  return targets.some((t) => t.countries.has(id)) ? "partial" : "none";
}

import { usStateCode } from "./us-states";

export type AudienceGeography = {
  countries?: string[];
  states?: string[];
  regions?: string[];
  cities?: string[];
};

/** Display interpretation only: never rewrites the saved platform targeting. */
export function audienceMapTarget(geography: AudienceGeography | null) {
  const countries = new Set(
    (geography?.countries ?? []).map((c) => c.trim().toUpperCase()),
  );
  const states = new Set<string>();
  const unlocated: string[] = [...(geography?.cities ?? [])];
  const isUS = !countries.size || countries.has("US");
  for (const place of [
    ...(geography?.states ?? []),
    ...(geography?.regions ?? []),
  ]) {
    const code = isUS ? usStateCode(place) : null;
    if (code) states.add(code);
    else unlocated.push(place);
  }
  if (!countries.size && states.size) countries.add("US");
  const narrowed = Boolean(
    geography?.states?.length ||
    geography?.regions?.length ||
    geography?.cities?.length,
  );
  return { countries, states, narrowed, unlocated };
}

export function audienceMapCoverage(
  targets: ReturnType<typeof audienceMapTarget>[],
  view: "us" | "world",
  id: string,
): "full" | "partial" | "none" {
  if (view === "us") {
    return targets.some(
      (t) => (t.countries.has("US") && !t.narrowed) || t.states.has(id),
    )
      ? "full"
      : "none";
  }
  if (targets.some((t) => t.countries.has(id) && !t.narrowed)) return "full";
  return targets.some((t) => t.countries.has(id)) ? "partial" : "none";
}

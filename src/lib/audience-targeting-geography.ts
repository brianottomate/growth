import { usStateCode } from "./us-states";

type Geography = {
  countries?: string[];
  states?: string[];
  regions?: string[];
  cities?: string[];
  originCities?: string[];
};

/** US states have one stored representation; international subdivisions retain their names. */
export function normalizeAudienceGeography<T extends Geography>(
  geography: T,
): T & Geography {
  const countries = geography.countries?.map((country) =>
    country.trim().toUpperCase(),
  );
  const states = [
    ...new Set(
      (geography.states ?? []).map((state) => usStateCode(state) ?? state),
    ),
  ];
  const regions: string[] = [];
  const us = countries?.length
    ? countries.length === 1 && countries[0] === "US"
    : true;
  for (const region of geography.regions ?? []) {
    const state = us ? usStateCode(region) : null;
    if (state) states.push(state);
    else regions.push(region);
  }
  return {
    ...geography,
    countries,
    states: [...new Set(states)],
    regions: [...new Set(regions)],
  };
}

/** Reject fuzzy, ambiguous or wrong-type results before any provider write. */
export function matchAudienceLocation<
  T extends { name: string; type: string; path?: string[] },
>(name: string, type: "region" | "city", results: T[]): T | undefined {
  const parts = name.split(",").map((part) => part.trim().toLowerCase());
  const matches = results.filter(
    (row) =>
      row.type === type &&
      row.name.trim().toLowerCase() === parts[0] &&
      parts
        .slice(1)
        .every((part) =>
          (row.path ?? []).some(
            (path) =>
              path.toLowerCase() === part ||
              (usStateCode(path) !== null &&
                usStateCode(path) === usStateCode(part)),
          ),
        ),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

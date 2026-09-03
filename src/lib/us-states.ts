/**
 * US state codes to the names a platform's geo search can resolve.
 *
 * Listing feeds give a two-letter code; Meta's and Google's location search
 * take a name. Keeping both means the code stays the stored fact and the name
 * stays a lookup, so an unrecognised code degrades to "no region layer"
 * rather than to a region nobody meant.
 */
export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  PR: "Puerto Rico",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/** The resolvable name for a state code, or null when we do not know it. */
export function usStateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return US_STATE_NAMES[code.trim().toUpperCase()] ?? null;
}

/**
 * The two-letter code for a state written either way.
 *
 * Listing data carries both forms — the same portfolio had homes in "OH" and
 * in "Ohio" — and uppercasing alone kept them as two different states, so a
 * pitch page and its ad copy read "OH, OHIO".
 */
export function usStateCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (US_STATE_NAMES[upper]) return upper;
  const byName = Object.entries(US_STATE_NAMES).find(
    ([, name]) => name.toUpperCase() === upper,
  );
  return byName?.[0] ?? null;
}

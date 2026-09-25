// A home's amenities ranked by how much they sell a stay. Client-safe: the
// catalog cards, the feed description and the ad captions all lead on the
// same amenities, in the same order.
//
// The labels are WanderOS's own ("Hot tub", "Game Room", "Pool outdoor").
// Anything unranked is a utility (Wifi, Dishes, Smoke detector) and never
// headlines a card. Hooks say only what the label says: "Hot tub" never
// becomes "private hot tub", because a shared one is a refund.

export type RankedAmenity = {
  key: string;
  /** Printed on a card: short, capitalised, no emoji (satori cannot draw it). */
  hook: string;
  /** A caption bullet, led by its emoji, the way the post template reads. */
  bullet: string;
};

const RANKED: { test: RegExp; key: string; hook: string; bullet: string }[] = [
  {
    test: /ski.?in|ski.?out/i,
    key: "ski",
    hook: "Ski-in, ski-out",
    bullet: "🎿 Ski-in, ski-out access",
  },
  {
    test: /beach.?front|ocean.?front/i,
    key: "beach",
    hook: "Beachfront",
    bullet: "🏖️ Beachfront location",
  },
  {
    test: /lake.?front|river.?front|water.?front/i,
    key: "water",
    hook: "Waterfront",
    bullet: "🌊 Waterfront location",
  },
  {
    test: /hot ?tub|jacuzzi|whirlpool/i,
    key: "hot-tub",
    hook: "Hot tub",
    bullet: "♨️ Hot tub",
  },
  {
    test: /private pool|pool outdoor|outdoor pool|heated pool|^pool$/i,
    key: "pool",
    hook: "Outdoor pool",
    bullet: "🏊 Outdoor pool",
  },
  {
    test: /rooftop/i,
    key: "rooftop",
    hook: "Rooftop deck",
    bullet: "🌇 Rooftop deck",
  },
  { test: /sauna/i, key: "sauna", hook: "Sauna", bullet: "🧖 Sauna" },
  {
    test: /game room/i,
    key: "game-room",
    hook: "Game room",
    bullet: "🎱 Game room",
  },
  {
    test: /theater|cinema/i,
    key: "theater",
    hook: "Home theater",
    bullet: "🎬 Home theater",
  },
  {
    test: /pool table|billiard/i,
    key: "pool-table",
    hook: "Pool table",
    bullet: "🎱 Pool table",
  },
  {
    test: /fire ?pit/i,
    key: "fire-pit",
    hook: "Fire pit",
    bullet: "🔥 Fire pit",
  },
  {
    test: /mountain view/i,
    key: "mountain-view",
    hook: "Mountain views",
    bullet: "🏔️ Mountain views",
  },
  {
    test: /lake view|ocean view|sea view|water view|beach view/i,
    key: "water-view",
    hook: "Water views",
    bullet: "🌊 Water views",
  },
  {
    test: /city view|skyline/i,
    key: "city-view",
    hook: "City views",
    bullet: "🏙️ City views",
  },
  {
    test: /fire ?place/i,
    key: "fireplace",
    hook: "Cozy fireplace",
    bullet: "🔥 Cozy fireplace",
  },
  {
    test: /bbq area|grill|barbecue/i,
    key: "grill",
    hook: "Outdoor grill",
    bullet: "🔥 Outdoor grill",
  },
  {
    test: /\bgym\b|fitness/i,
    key: "gym",
    hook: "Home gym",
    bullet: "🏋️ Home gym",
  },
  {
    test: /game console/i,
    key: "console",
    hook: "Game console",
    bullet: "🎮 Game console",
  },
  {
    test: /foosball|air hockey|ping pong|table tennis/i,
    key: "games",
    hook: "Table games",
    bullet: "🏓 Table games",
  },
  {
    test: /community pool/i,
    key: "community-pool",
    hook: "Pool access",
    bullet: "🏊 Pool access",
  },
  {
    test: /patio|deck|balcony|garden/i,
    key: "outdoor",
    hook: "Outdoor space",
    bullet: "🌿 Outdoor space",
  },
  {
    test: /ev charger/i,
    key: "ev",
    hook: "EV charger",
    bullet: "🔌 EV charger",
  },
  {
    test: /dedicated workspace/i,
    key: "workspace",
    hook: "Dedicated workspace",
    bullet: "💻 Dedicated workspace",
  },
];

/**
 * Kinds a description can vouch for when a listing has no amenity labels. Only
 * things inside the home: "minutes from the beach" must never become
 * "Beachfront", so location and view claims stay label-only.
 */
const DESCRIBED = new Set([
  "hot-tub",
  "pool",
  "rooftop",
  "sauna",
  "game-room",
  "pool-table",
  "fire-pit",
  "fireplace",
]);

/**
 * The labels to rank: the listing's own, or when it has none, the in-home
 * features its description names, phrased as their labels would be.
 */
export function amenitySource(
  labels: readonly string[] | null | undefined,
  description?: string | null,
): string[] {
  if (labels?.length || !description) return [...(labels ?? [])];
  const sentences = description.split(/(?<=[.!?])\s+/);
  return RANKED.filter(
    (row) =>
      DESCRIBED.has(row.key) &&
      // A sentence that denies it ("no hot tub") does not count.
      sentences.some(
        (line) => row.test.test(line) && !/\bno\b|\bnot\b|without/i.test(line),
      ),
  ).map((row) => row.hook);
}

/** Two amenities share a hook only when the pair still fits the card's first line. */
const HOOK_MAX = 28;

/** The home's selling amenities, best first, one per kind. */
export function rankAmenities(labels: readonly string[] | null | undefined) {
  const found = new Map<string, RankedAmenity>();
  for (const label of labels ?? []) {
    const rank = RANKED.findIndex((row) => row.test.test(label.trim()));
    if (rank === -1) continue;
    const row = RANKED[rank]!;
    if (!found.has(row.key))
      found.set(row.key, { key: row.key, hook: row.hook, bullet: row.bullet });
  }
  const order = (key: string) => RANKED.findIndex((row) => row.key === key);
  return [...found.values()].sort((a, b) => order(a.key) - order(b.key));
}

const lower = (hook: string) =>
  // "Game room", not "game Room"; proper words ("EV") keep their case.
  /^[A-Z][a-z]/.test(hook) ? hook[0]!.toLowerCase() + hook.slice(1) : hook;

/**
 * The line a card leads on: the best amenity, joined by the next one when both
 * fit ("Hot tub + game room"). `avoid` holds leads other cards in the
 * set already use, so a catalog of hot-tub cabins does not print one headline
 * twenty times while a home has something else worth saying.
 */
export function amenityHook(
  labels: readonly string[] | null | undefined,
  avoid: ReadonlySet<string> = new Set(),
): { lead: string; hook: string } | null {
  const ranked = rankAmenities(labels);
  if (ranked.length === 0) return null;
  // Variety only reorders the top two: a home's third-best amenity never
  // headlines it just because its neighbours share the best one.
  const lead =
    ranked.slice(0, 2).find((row) => !avoid.has(row.key)) ?? ranked[0]!;
  const second = ranked.find((row) => row.key !== lead.key);
  const pair = second ? `${lead.hook} + ${lower(second.hook)}` : null;
  return {
    lead: lead.key,
    hook: pair && pair.length <= HOOK_MAX ? pair : lead.hook,
  };
}

/** Headlines an operator can pick instead of the default, all from real amenities. */
export function amenityHeadlineOptions(
  labels: readonly string[] | null | undefined,
  place: string,
): string[] {
  const ranked = rankAmenities(labels).slice(0, 4);
  const suffix = place ? ` in ${place}` : "";
  const options = [
    ...ranked.map((row) => `${row.hook}${suffix}`),
    ...ranked.slice(1).map((row) => {
      const pair = `${ranked[0]!.hook} + ${lower(row.hook)}`;
      return pair.length <= HOOK_MAX ? `${pair}${suffix}` : null;
    }),
  ];
  return [...new Set(options.filter((line): line is string => Boolean(line)))];
}

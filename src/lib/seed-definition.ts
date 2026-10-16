import { z } from "zod";

const words = z.array(z.string().trim().min(1).max(160)).max(40).default([]);
export const seedPropertyFilterSchema = z.object({
  states: words.describe(
    "Travel destination states, not the guest's home state.",
  ),
  cities: words,
  landscapes: z
    .array(z.enum(["lake", "forest", "mountain", "desert", "nationalparks"]))
    .max(5)
    .default([]),
  terms: words.describe(
    "Literal case-insensitive matches against property name, description and activities. Any term matches.",
  ),
  minBedrooms: z.number().int().min(0).max(30).nullable().default(null),
  minOccupancy: z.number().int().min(1).max(100).nullable().default(null),
  petsAllowed: z.boolean().nullable().default(null),
});
export const seedSearchSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/),
  why: z.string().trim().min(1).max(1500),
  filter: seedPropertyFilterSchema,
});

/** The filters a list's build runs over WanderOS bookings and Wander's own signals. */
export const seedDefinitionSchema = z
  .object({
    clientBookers: z.boolean().default(false),
    wander: z.boolean().default(false),
    wanderSignals: z
      .array(z.enum(["bookers", "intent"]))
      .min(1)
      .max(2)
      .default(["bookers", "intent"]),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(50)
      .default(["US"])
      .describe("Wander profile countries only."),
    bookingDays: z.number().int().min(1).max(3650).default(730),
    intentDays: z.number().int().min(1).max(730).default(180),
    minScore: z.number().int().min(1).max(100).default(45),
    searches: z.array(seedSearchSchema).max(12).default([]),
  })
  .superRefine((v, ctx) => {
    if (!v.wander && !v.clientBookers)
      ctx.addIssue({ code: "custom", message: "Choose at least one source" });
    if (v.wander && !v.searches.length)
      ctx.addIssue({
        code: "custom",
        message: "Wander sources require a property search",
      });
  });
export type SeedDefinition = z.infer<typeof seedDefinitionSchema>;
export type SeedQueryParams = Record<
  string,
  string | number | boolean | string[] | number[]
>;

export type SeedSignal = {
  emailHash: string;
  bookings: number;
  views: number;
  dates: number;
  checkouts: number;
};

/** Transparent evidence tiers; ordinal heuristics, not conversion probabilities. */
export function seedEvidenceScore(signal: Omit<SeedSignal, "emailHash">) {
  if (signal.bookings > 0) return 100;
  if (signal.checkouts > 0) return 80;
  if (signal.dates > 0) return 65;
  if (signal.views >= 2) return 45;
  return signal.views > 0 ? 25 : 0;
}

/** Everyone whose combined activity reaches the evidence floor, once each. */
export function selectSeedMembers(signals: SeedSignal[], minScore: number) {
  const byHash = new Map<string, Omit<SeedSignal, "emailHash">>();
  for (const s of signals) {
    const prior = byHash.get(s.emailHash);
    byHash.set(s.emailHash, {
      bookings: (prior?.bookings ?? 0) + s.bookings,
      views: (prior?.views ?? 0) + s.views,
      dates: (prior?.dates ?? 0) + s.dates,
      checkouts: (prior?.checkouts ?? 0) + s.checkouts,
    });
  }
  const evidence = { bookers: 0, checkouts: 0, dates: 0, views: 0 };
  const hashes: string[] = [];
  for (const [hash, s] of byHash) {
    const score = seedEvidenceScore(s);
    if (score < minScore) continue;
    hashes.push(hash);
    if (score === 100) evidence.bookers += 1;
    else if (score === 80) evidence.checkouts += 1;
    else if (score === 65) evidence.dates += 1;
    else evidence.views += 1;
  }
  return { hashes: hashes.sort(), evidence, candidates: byHash.size };
}

/** One person in a list, as uploaded to Meta (Zernio hashes on receipt). */
export type SeedMember = {
  emailHash: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

/** What a build saw, for the list card and the operator. */
export type SeedBuildSummary = {
  candidates: number;
  evidence: {
    bookers: number;
    checkouts: number;
    dates: number;
    views: number;
  };
  identifiable: number;
  phones: number;
};

/**
 * Wander's own customers may only reach Meta through Wander's ad account. A
 * list without them belongs to the brand and uploads to the brand's account.
 */
export const seedUsesWanderData = (definition: SeedDefinition | null) =>
  definition?.wander === true;

/** Guideline, not a gate: Meta builds weak lookalikes from smaller lists. */
export const SEED_GUIDELINE_ENTRIES = 1000;

/** Starting points for a seed list, grouped by whose people they are. */
export const SEED_TEMPLATES = [
  {
    id: "past_bookers",
    group: "guests",
    label: "Past bookers",
    summary: "Confirmed direct bookings on the brand's WanderOS site.",
  },
  {
    id: "email_list",
    group: "guests",
    label: "An email list",
    summary: "The people on one of the brand's email lists, copied in.",
  },
  {
    id: "destinations",
    group: "wander",
    label: "Interested in these towns",
    summary:
      "Booked, picked dates, checked out or kept viewing homes in the brand's towns.",
  },
  {
    id: "similar_homes",
    group: "wander",
    label: "Like homes like these",
    summary:
      "Drawn to homes with as many bedrooms and guests as the brand's, anywhere.",
  },
  {
    id: "persona",
    group: "wander",
    label: "Fit a persona",
    summary: "One of the brand's personas, turned into home filters with AI.",
  },
  {
    id: "described",
    group: "wander",
    label: "Fit a description",
    summary: "Say who you want; AI turns it into home filters.",
  },
] as const;
export const SEED_TEMPLATE_GROUPS = {
  guests: {
    label: "Your guests",
    summary: "Uploads to the brand's own Meta ad account.",
  },
  wander: {
    label: "Wander travelers",
    summary:
      "Uploads to Wander's Meta ad account; the lookalike is shared with the brand.",
  },
} as const;
export type SeedTemplateId = (typeof SEED_TEMPLATES)[number]["id"];
export const SEED_TEMPLATE_IDS = SEED_TEMPLATES.map((t) => t.id) as [
  SeedTemplateId,
  ...SeedTemplateId[],
];

/** Which starting point built a seed list. */
export const seedOriginSchema = z.discriminatedUnion("template", [
  z.object({ template: z.literal("past_bookers") }),
  z.object({ template: z.literal("destinations") }),
  z.object({ template: z.literal("similar_homes") }),
  z.object({
    template: z.literal("persona"),
    personaId: z.string(),
    personaName: z.string(),
  }),
  z.object({ template: z.literal("described"), steer: z.string() }),
  z.object({
    template: z.literal("email_list"),
    listId: z.string(),
    listName: z.string(),
  }),
]);
export type SeedOrigin = z.infer<typeof seedOriginSchema>;

export function seedOriginLabel(origin: SeedOrigin) {
  switch (origin.template) {
    case "persona":
      return `Persona: ${origin.personaName}`;
    case "described":
      return `Described: ${origin.steer}`;
    case "email_list":
      return `Email list: ${origin.listName}`;
    default:
      return SEED_TEMPLATES.find((t) => t.id === origin.template)!.label;
  }
}

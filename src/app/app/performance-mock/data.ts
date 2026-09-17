export type Stage = "Lead" | "Onboarding" | "Ready to launch" | "Live";

export type DemoClient = {
  id: string;
  name: string;
  initials: string;
  market: string;
  stage: Stage;
  detail: string;
  meta: string;
  budget?: string;
  featured?: boolean;
};

export const STAGES: Stage[] = [
  "Lead",
  "Onboarding",
  "Ready to launch",
  "Live",
];

export const CLIENTS: DemoClient[] = [
  {
    id: "timber",
    name: "Timber & Tide",
    initials: "TT",
    market: "Bend, OR",
    stage: "Lead",
    detail: "Discovery call tomorrow",
    meta: "8 demo properties",
  },
  {
    id: "alpine",
    name: "Alpine Weekends",
    initials: "AW",
    market: "Breckenridge, CO",
    stage: "Lead",
    detail: "Follow up on fictional proposal",
    meta: "12 demo properties",
  },
  {
    id: "coastlight",
    name: "Coastlight Stays",
    initials: "CS",
    market: "30A, FL",
    stage: "Onboarding",
    detail: "Waiting on demo Meta access",
    meta: "4 properties selected",
  },
  {
    id: "canyon",
    name: "Canyon & Co.",
    initials: "CC",
    market: "Sedona, AZ",
    stage: "Onboarding",
    detail: "Choose starting homes",
    meta: "3 properties selected",
  },
  {
    id: "desert",
    name: "Desert House Co.",
    initials: "DH",
    market: "Scottsdale, AZ",
    stage: "Ready to launch",
    detail: "Complete local build, ready for review",
    meta: "3 starting properties",
    budget: "$1,500 demo / mo",
    featured: true,
  },
  {
    id: "juniper",
    name: "Juniper Escapes",
    initials: "JE",
    market: "Joshua Tree, CA",
    stage: "Ready to launch",
    detail: "In Meta · Awaiting your QA",
    meta: "2 properties selected",
    budget: "$1,000 demo / mo",
  },
  {
    id: "cedar",
    name: "Cedar & Sea",
    initials: "CS",
    market: "Hilton Head, SC",
    stage: "Live",
    detail: "Demo ads delivering",
    meta: "5 properties selected",
    budget: "$2,000 demo / mo",
  },
  {
    id: "highland",
    name: "Highland House",
    initials: "HH",
    market: "Asheville, NC",
    stage: "Live",
    detail: "Demo ads delivering",
    meta: "3 properties selected",
    budget: "$1,500 demo / mo",
  },
];

export type Property = {
  id: string;
  name: string;
  facts: string;
  palette: string;
  copy: {
    primary: string;
    headline: string;
    description: string;
    destination: string;
  };
};

export const PROPERTIES: Property[] = [
  {
    id: "sol",
    name: "Sol House",
    facts: "4 bedrooms · Sleeps 8",
    palette: "from-cyan-200 via-stone-200 to-teal-700",
    copy: {
      primary:
        "Slow mornings. Poolside afternoons. Make Sol House your fictional home base for an illustrative Scottsdale getaway.",
      headline: "Your demo Scottsdale poolside escape",
      description: "Illustrative stay — no real booking.",
      destination: "https://demo.invalid/stays/sol-house",
    },
  },
  {
    id: "palm",
    name: "The Palm Residence",
    facts: "5 bedrooms · Sleeps 10",
    palette: "from-sky-300 via-amber-100 to-blue-800",
    copy: {
      primary:
        "Gather under desert skies at the fictional Palm Residence. This copy and property are illustrative only.",
      headline: "Room for your whole demo crew",
      description: "A fictional direct-stay campaign.",
      destination: "https://demo.invalid/stays/palm-residence",
    },
  },
  {
    id: "hideaway",
    name: "Desert Hideaway",
    facts: "3 bedrooms · Sleeps 6",
    palette: "from-orange-200 via-stone-300 to-rose-900",
    copy: {
      primary:
        "Unplug in a made-up desert retreat. Desert Hideaway and every detail in this preview are illustrative.",
      headline: "A quieter fictional desert stay",
      description: "Demo creative. Demo destination.",
      destination: "https://demo.invalid/stays/desert-hideaway",
    },
  },
];

export const ORIGINS = [
  ["California", 46],
  ["Texas", 38],
  ["Arizona", 29],
  ["Colorado", 24],
  ["Washington", 18],
  ["Illinois", 17],
] as const;

export type CatalogEntry = {
  id: string;
  name: string;
  place: string;
  facts: string;
  palette: string;
  /** One of the three the client picked to start on; the rest are catalog-only. */
  starting?: boolean;
};

/**
 * The fictional Meta Hotels feed: every demo property in the portfolio, the
 * set an Advantage+ catalog ad would draw from. Wider than the hand-picked
 * starting three, which is the point of the catalog. All illustrative.
 */
export const CATALOG: CatalogEntry[] = [
  {
    id: "sol",
    name: "Sol House",
    place: "Scottsdale, AZ",
    facts: "4 bd · Sleeps 8",
    palette: "from-cyan-200 via-stone-200 to-teal-700",
    starting: true,
  },
  {
    id: "palm",
    name: "The Palm Residence",
    place: "Scottsdale, AZ",
    facts: "5 bd · Sleeps 10",
    palette: "from-sky-300 via-amber-100 to-blue-800",
    starting: true,
  },
  {
    id: "hideaway",
    name: "Desert Hideaway",
    place: "Scottsdale, AZ",
    facts: "3 bd · Sleeps 6",
    palette: "from-orange-200 via-stone-300 to-rose-900",
    starting: true,
  },
  {
    id: "cactus",
    name: "Cactus Court",
    place: "Cave Creek, AZ",
    facts: "3 bd · Sleeps 6",
    palette: "from-lime-200 via-stone-200 to-emerald-800",
  },
  {
    id: "saguaro",
    name: "Saguaro Retreat",
    place: "Carefree, AZ",
    facts: "4 bd · Sleeps 8",
    palette: "from-amber-200 via-orange-200 to-red-900",
  },
  {
    id: "adobe",
    name: "Adobe Rise",
    place: "Paradise Valley, AZ",
    facts: "5 bd · Sleeps 11",
    palette: "from-rose-200 via-stone-200 to-amber-800",
  },
  {
    id: "mesa",
    name: "Mesa View Villa",
    place: "Fountain Hills, AZ",
    facts: "4 bd · Sleeps 9",
    palette: "from-indigo-200 via-stone-200 to-orange-800",
  },
  {
    id: "ocotillo",
    name: "Ocotillo Bungalow",
    place: "Scottsdale, AZ",
    facts: "2 bd · Sleeps 4",
    palette: "from-teal-200 via-amber-100 to-rose-800",
  },
  {
    id: "ironwood",
    name: "Ironwood Lodge",
    place: "Cave Creek, AZ",
    facts: "6 bd · Sleeps 12",
    palette: "from-emerald-200 via-stone-300 to-slate-800",
  },
  {
    id: "sunridge",
    name: "Sunridge Casita",
    place: "Carefree, AZ",
    facts: "2 bd · Sleeps 4",
    palette: "from-yellow-200 via-orange-200 to-rose-900",
  },
  {
    id: "dune",
    name: "Dune & Sky",
    place: "Paradise Valley, AZ",
    facts: "3 bd · Sleeps 6",
    palette: "from-sky-200 via-stone-200 to-indigo-800",
  },
  {
    id: "agave",
    name: "Agave Flats",
    place: "Fountain Hills, AZ",
    facts: "4 bd · Sleeps 8",
    palette: "from-green-200 via-amber-100 to-teal-800",
  },
];

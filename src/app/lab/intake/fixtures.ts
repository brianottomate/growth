import {
  type IntakeSetupCheck,
  intakeSetupSummary,
} from "@/lib/intake-setup-status";
import type { ConnectViewProps } from "@/app/connect/[token]/ConnectView";

/**
 * Mirrors of wander.com's `src/features/intake/schema.ts` types. The form
 * lives on wander.com, so these are copies, not imports: when the schema
 * there changes, change these with it.
 */
export type IntakeAnswers = {
  detailsConfirmed: boolean;
  reportEmails: string;
  propertyUrls: string[];
  allProperties: boolean;
  propertyNotes: string;
  budget: string;
  billingAcknowledged: boolean;
  invoiceEmail: string;
  ugcPermission: "" | "yes" | "unsure" | "no";
  creativeDriveUrl: string;
  guestListDriveUrl: string;
  anythingElse: string;
  accountsConnected: boolean;
};

export type IntakePrefill = {
  brand: string;
  slug: string | null;
  contact: string | null;
  email: string | null;
  site: string | null;
  properties: string[];
  repName: string | null;
  repEmail: string | null;
  links?: { connect: string | null; emailDns: string | null };
};

export type IntakeListing = {
  name: string;
  url: string;
  bedrooms: number | null;
  imageUrl: string | null;
};

export type IntakeSetup = {
  checkedAt: string;
  ready: boolean;
  checks: IntakeSetupCheck[];
};

// ---- scenario axes ----------------------------------------------------

export const LINK_OPTIONS = {
  token: "Token link, connect + DNS",
  connect: "Token link, connect only",
  slug: "Slug link, no setup links",
} as const;

export const SITE_OPTIONS = {
  wanderos: "Site we built (listings)",
  other: "Other site (paste URLs)",
} as const;

export const ANSWER_OPTIONS = {
  empty: "Fresh",
  filled: "Filled in",
} as const;

export const SETUP_OPTIONS = {
  partial: "Setup in progress",
  ready: "Setup ready",
  none: "Check unavailable",
} as const;

export type Scenario = {
  link: keyof typeof LINK_OPTIONS;
  site: keyof typeof SITE_OPTIONS;
  answers: keyof typeof ANSWER_OPTIONS;
  setup: keyof typeof SETUP_OPTIONS;
};

function pick<T extends Record<string, string>>(
  options: T,
  value: string | string[] | undefined,
): keyof T {
  const first = Array.isArray(value) ? value[0] : value;
  const keys = Object.keys(options) as (keyof T)[];
  return keys.find((key) => key === first) ?? keys[0]!;
}

export function parseScenario(
  params: Record<string, string | string[] | undefined>,
): Scenario {
  return {
    link: pick(LINK_OPTIONS, params.link),
    site: pick(SITE_OPTIONS, params.site),
    answers: pick(ANSWER_OPTIONS, params.answers),
    setup: pick(SETUP_OPTIONS, params.setup),
  };
}

// ---- fixture data -----------------------------------------------------

const SITE = "https://saltmarshstays.com";

const HOME_NAMES = [
  ["The Heron House", 4],
  ["Dune Cottage", 2],
  ["Tidewater Lodge", 6],
  ["Pelican Point", 3],
  ["Marsh Light", 3],
  ["Oyster Shell Bungalow", 2],
  ["Cape Lantern", 5],
  ["Seagrass Retreat", 4],
  ["Low Country Loft", 1],
  ["Sandpiper Suite", 2],
  ["Driftwood Den", 3],
  ["The Boathouse", 4],
  ["Sound Side", 5],
  ["Egret's Nest", 2],
  ["Windward Villa", 7],
  ["Shrimp Boat Cabin", 1],
  ["Palmetto Porch", 3],
  ["High Tide Hideaway", 4],
] as const;

const LISTINGS: IntakeListing[] = HOME_NAMES.map(([name, bedrooms]) => ({
  name,
  bedrooms,
  url: `${SITE}/homes/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  imageUrl: null,
}));

const EMPTY_ANSWERS: IntakeAnswers = {
  detailsConfirmed: false,
  reportEmails: "",
  propertyUrls: [],
  allProperties: false,
  propertyNotes: "",
  budget: "",
  billingAcknowledged: false,
  invoiceEmail: "",
  ugcPermission: "",
  creativeDriveUrl: "",
  guestListDriveUrl: "",
  anythingElse: "",
  accountsConnected: false,
};

/**
 * A budget under $200 per home on purpose, so the per-home warning shows,
 * and more than ten homes so the "spreads the budget thin" note does too.
 */
function filledAnswers(site: Scenario["site"]): IntakeAnswers {
  const urls =
    site === "wanderos"
      ? LISTINGS.slice(0, 12).map((row) => row.url)
      : [`${SITE}/homes/the-heron-house`, `${SITE}/homes/tidewater-lodge`];
  return {
    detailsConfirmed: true,
    reportEmails: "owner@saltmarshstays.com, ops@saltmarshstays.com",
    propertyUrls: urls,
    allProperties: false,
    propertyNotes: "Tidewater Lodge is offline for renovation until March.",
    budget: "$2,000",
    billingAcknowledged: true,
    invoiceEmail: "accounts@saltmarshstays.com",
    ugcPermission: "",
    creativeDriveUrl: "https://drive.google.com/drive/folders/example",
    guestListDriveUrl: "",
    anythingElse: "",
    accountsConnected: true,
  };
}

function prefill(scenario: Scenario): IntakePrefill {
  const slug = scenario.link === "slug";
  return {
    brand: "Saltmarsh Stays",
    slug: "saltmarsh-stays",
    // A slug-addressed page gets no contact details from growth.
    contact: slug ? null : "Jordan Avery",
    email: slug ? null : "jordan@saltmarshstays.com",
    site: SITE.replace("https://", ""),
    properties: [],
    repName: "Sam Ortiz",
    repEmail: "sam@wander.com",
    links: slug
      ? { connect: null, emailDns: null }
      : {
          connect: "https://growth.wander.com/connect/example",
          emailDns:
            scenario.link === "token"
              ? "https://growth.wander.com/connect/email/example"
              : null,
        },
  };
}

const CHECKED_AT = "2026-10-16T15:42:00.000Z";

function setup(scenario: Scenario): IntakeSetup | null {
  if (scenario.setup === "none") return null;
  const ready = scenario.setup === "ready";
  const summary = intakeSetupSummary(
    {
      profile: "connected",
      meta: ready ? "ready" : "incomplete",
      billing: ready ? "present" : "missing",
      route: "",
      clientSetupComplete: ready,
      pixelId: ready ? "px" : null,
      sitePixelIds: ready ? ["px"] : [],
      customerPixelId: null,
    },
    ready ? "verified" : "pending",
    ready ? "connected" : "missing",
    !ready,
  );
  return { checkedAt: CHECKED_AT, ...summary };
}

export function scenarioData(scenario: Scenario) {
  return {
    prefill: prefill(scenario),
    listings:
      scenario.site === "wanderos"
        ? { supported: true, listings: LISTINGS }
        : { supported: false, listings: [] },
    answers:
      scenario.answers === "filled"
        ? filledAnswers(scenario.site)
        : EMPTY_ANSWERS,
    setup: setup(scenario),
  };
}

// ---- growth /connect/[token] ------------------------------------------

type ConnectStatusRow = ConnectViewProps["status"][number];

function connectRow(
  key: "meta-ads" | "google-ads",
  connected: boolean,
): ConnectStatusRow {
  return {
    key,
    label: key === "meta-ads" ? "Meta Ads" : "Google Ads",
    offered: true,
    connected,
    accounts: connected ? ["Saltmarsh Stays"] : [],
    externalIds: connected
      ? [key === "meta-ads" ? "act_1877763863159956" : "482-913-5520"]
      : [],
  };
}

const META_ACCOUNTS = [
  {
    id: "act_1877763863159956",
    name: "Saltmarsh Stays Ads",
    businessName: "Saltmarsh Stays LLC",
    currency: "USD",
    selectable: true,
    reason: null,
  },
  {
    id: "act_2290017745102231",
    name: "Jordan Avery (personal)",
    businessName: null,
    currency: "USD",
    selectable: false,
    reason: "This account cannot currently run ads. Contact your Wander team.",
  },
];

function metaChecks(ready: boolean) {
  return (
    setup({
      link: "token",
      site: "wanderos",
      answers: "filled",
      setup: ready ? "ready" : "partial",
    })?.checks.filter((check) =>
      ["meta", "billing", "pixel"].includes(check.key),
    ) ?? []
  );
}

const CONNECT_BASE = {
  token: "lab",
  brand: { name: "Saltmarsh Stays", logo: null },
  metaUnavailable: false,
  contactName: "Sam",
  contactEmail: "sam@wander.com",
  error: false,
  selectionReview: false,
};

export const CONNECT_STATES: {
  id: string;
  caption: string;
  props: ConnectViewProps;
}[] = [
  {
    id: "connect-fresh",
    caption: "Connect · nothing connected",
    props: {
      ...CONNECT_BASE,
      status: [connectRow("meta-ads", false), connectRow("google-ads", false)],
      metaConnected: false,
      metaChoice: null,
      setupChecks: [],
      allDone: false,
    },
  },
  {
    id: "connect-choose",
    caption: "Connect · choose Meta ad account",
    props: {
      ...CONNECT_BASE,
      status: [connectRow("meta-ads", true), connectRow("google-ads", false)],
      metaConnected: true,
      metaChoice: { selectedId: null, accounts: META_ACCOUNTS },
      setupChecks: metaChecks(false),
      allDone: false,
    },
  },
  {
    id: "connect-done",
    caption: "Connect · all done",
    props: {
      ...CONNECT_BASE,
      status: [connectRow("meta-ads", true), connectRow("google-ads", true)],
      metaConnected: true,
      metaChoice: { selectedId: META_ACCOUNTS[0]!.id, accounts: META_ACCOUNTS },
      setupChecks: metaChecks(true),
      allDone: true,
    },
  },
];

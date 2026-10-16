import {
  type IntakeSetupCheck,
  intakeSetupSummary,
} from "@/lib/intake-setup-status";
import type { ConnectViewProps } from "@/app/connect/[token]/ConnectView";
import type { EmailDnsRecord } from "@/lib/email-dns";

/**
 * The proposed intake. The brand section is a one-time submission (the
 * receipt `performance_intake.answers` already is); everything after it is
 * live state read from the record that owns it, which is what makes a
 * section resumable without saving drafts on a semi-public link.
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
  creativeDriveUrl: string;
  guestListDriveUrl: string;
  /** Meta's Custom Audience attestation; becomes `guestListConsentAt`. */
  guestConsent: boolean;
  anythingElse: string;
};

export type IntakePrefill = {
  brand: string;
  slug: string | null;
  contact: string | null;
  email: string | null;
  site: string | null;
  repName: string | null;
  repEmail: string | null;
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

/** Owner: brand channels, written by the post-OAuth sync. */
export type ConnectionRow = {
  key: "meta-ads" | "google-ads" | "instagram" | "facebook";
  label: string;
  group: "ads" | "social";
  connected: boolean;
  account: string | null;
};

/** Owner: `brand.emailSender.marketingDomain` plus Postmark's verify calls. */
export type EmailDomainState = {
  sendingDomain: string;
  state: "not_started" | "waiting" | "verified";
  records: EmailDnsRecord[];
  dkimVerified: boolean;
  returnPathVerified: boolean;
};

export const EMAIL_PROGRAMS = {
  newsletter: {
    label: "Newsletter",
    detail:
      "Once a month: featured homes, what is on locally, a reason to plan the next trip.",
  },
  offers: {
    label: "Offers and announcements",
    detail:
      "A few a year: a last-minute opening, a new home, a seasonal offer.",
  },
  sequences: {
    label: "Automated emails",
    detail:
      "Sent on their own when a guest signs up, stays or has not been back in a while.",
  },
} as const;

export type EmailProgram = keyof typeof EMAIL_PROGRAMS;

export const EMAIL_TOOLS = [
  "None",
  "Mailchimp",
  "Klaviyo",
  "Constant Contact",
  "My PMS sends them",
  "Something else",
] as const;

/**
 * Sent from the email section on its own, after the intake. Reply-to goes
 * to `brand.emailSender`, the rest to Performance settings; a later send
 * replaces it.
 */
export type EmailPreferences = {
  replyTo: string;
  programs: EmailProgram[];
  discount: "ask" | "cap";
  discountCapDollars: string;
  emailTool: (typeof EMAIL_TOOLS)[number] | "";
  saved: boolean;
};

// ---- scenario axes ----------------------------------------------------

export const STAGE_OPTIONS = {
  fresh: "Not sent yet",
  sent: "Sent, nothing connected",
  partway: "Sent, Meta connected",
  done: "Everything done",
} as const;

export const SITE_OPTIONS = {
  wanderos: "Site we built (listings)",
  other: "Other site (paste URLs)",
} as const;

export const ANSWER_OPTIONS = {
  empty: "Fresh",
  filled: "Filled in",
} as const;

export type Scenario = {
  stage: keyof typeof STAGE_OPTIONS;
  site: keyof typeof SITE_OPTIONS;
  answers: keyof typeof ANSWER_OPTIONS;
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
    stage: pick(STAGE_OPTIONS, params.stage),
    site: pick(SITE_OPTIONS, params.site),
    answers: pick(ANSWER_OPTIONS, params.answers),
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
  creativeDriveUrl: "",
  guestListDriveUrl: "",
  guestConsent: false,
  anythingElse: "",
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
    creativeDriveUrl: "https://drive.google.com/drive/folders/example",
    guestListDriveUrl: "https://drive.google.com/file/d/guests-example",
    guestConsent: true,
    anythingElse: "",
  };
}

const PREFILL: IntakePrefill = {
  brand: "Saltmarsh Stays",
  slug: "saltmarsh-stays",
  contact: "Jordan Avery",
  email: "jordan@saltmarshstays.com",
  site: SITE.replace("https://", ""),
  repName: "Sam Ortiz",
  repEmail: "sam@wander.com",
};

const CHECKED_AT = "2026-10-16T15:42:00.000Z";
export const SENT_AT = "2026-10-16T14:05:00.000Z";

function setup(ready: boolean): IntakeSetup {
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

function connections(stage: Scenario["stage"]): ConnectionRow[] {
  const meta = stage === "partway" || stage === "done";
  const all = stage === "done";
  return [
    {
      key: "meta-ads",
      label: "Meta Ads",
      group: "ads",
      connected: meta,
      account: meta ? "Saltmarsh Stays Ads" : null,
    },
    {
      key: "google-ads",
      label: "Google Ads",
      group: "ads",
      connected: all,
      account: all ? "482-913-5520" : null,
    },
    {
      key: "instagram",
      label: "Instagram",
      group: "social",
      connected: meta,
      account: meta ? "@saltmarshstays" : null,
    },
    {
      key: "facebook",
      label: "Facebook Page",
      group: "social",
      connected: all,
      account: all ? "Saltmarsh Stays" : null,
    },
  ];
}

const DNS_RECORDS: EmailDnsRecord[] = [
  {
    type: "TXT",
    host: "20261016._domainkey.post",
    value: "k=rsa;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC…",
    ttl: 3600,
  },
  {
    type: "CNAME",
    host: "pm-bounces.post",
    value: "pm.mtasv.net",
    ttl: 3600,
  },
];

function emailDomain(stage: Scenario["stage"]): EmailDomainState {
  const state =
    stage === "done"
      ? "verified"
      : stage === "partway"
        ? "waiting"
        : "not_started";
  return {
    sendingDomain: "post.saltmarshstays.com",
    state,
    records: DNS_RECORDS,
    dkimVerified: state === "verified",
    returnPathVerified: state === "verified",
  };
}

function emailPreferences(stage: Scenario["stage"]): EmailPreferences {
  const saved = stage === "done";
  return {
    replyTo: PREFILL.email ?? "",
    programs: saved ? ["newsletter", "sequences"] : [],
    discount: saved ? "cap" : "ask",
    discountCapDollars: saved ? "150" : "",
    emailTool: saved ? "Mailchimp" : "",
    saved,
  };
}

export function scenarioData(scenario: Scenario) {
  const sent = scenario.stage !== "fresh";
  return {
    prefill: PREFILL,
    listings:
      scenario.site === "wanderos"
        ? { supported: true, listings: LISTINGS }
        : { supported: false, listings: [] },
    // Once sent, the form is the receipt: always the filled answers.
    answers:
      sent || scenario.answers === "filled"
        ? filledAnswers(scenario.site)
        : EMPTY_ANSWERS,
    sentAt: sent ? SENT_AT : null,
    connections: connections(scenario.stage),
    setup: setup(scenario.stage === "done"),
    emailDomain: emailDomain(scenario.stage),
    emailPreferences: emailPreferences(scenario.stage),
  };
}

export type ScenarioData = ReturnType<typeof scenarioData>;

// ---- growth /connect/[token], today's page, for reference ------------

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

export const META_ACCOUNTS = [
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
  return setup(ready).checks.filter((check) =>
    ["meta", "billing", "pixel"].includes(check.key),
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
    caption: "Today · growth connect, nothing connected",
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
    caption: "Today · growth connect, choose Meta account",
    props: {
      ...CONNECT_BASE,
      status: [connectRow("meta-ads", true), connectRow("google-ads", false)],
      metaConnected: true,
      metaChoice: { selectedId: null, accounts: META_ACCOUNTS },
      setupChecks: metaChecks(false),
      allDone: false,
    },
  },
];

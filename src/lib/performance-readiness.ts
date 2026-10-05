// The production checklist for one Performance client, derived from facts the
// database already holds rather than ticked by hand. The playbook names the
// axis this tracks — brief received, creative gathered, ads built paused,
// launched — and says it is not the campaign's platform status. Every item
// here is a fact a page can show and a link can fix, so the list never drifts
// from what is true; when a step needs a manual tick it needs a column first.

/**
 * Where an unticked item is resolved. The page maps these to hrefs:
 * `intake` is the client-facing form, `connect` the brand's access flow,
 * `homes` and `draw` the brand's Homes and Ads tabs, `mark` the brand-mark
 * section, `ads` the full ads desk.
 */
export type ReadinessFix =
  | "intake"
  | "connect"
  | "homes"
  | "draw"
  | "mark"
  | "ads";

export type ReadinessItem = {
  id: string;
  label: string;
  done: boolean;
  /** The fact behind the tick, short enough to sit beside the label. */
  detail: string | null;
  provenance?: string;
  /** The verb on the link, and where it goes; null when nothing is left to do. */
  action: { label: string; to: ReadinessFix } | null;
};

export type ReadinessGroup = {
  id: "onboarded" | "creative" | "launch";
  label: string;
  items: ReadinessItem[];
  done: number;
  total: number;
};

export type ReadinessChecklist = {
  groups: ReadinessGroup[];
  done: number;
  total: number;
};

export type ReadinessFacts = {
  intakeFiled: boolean;
  /** Whole dollars a month that reach ad platforms, from the cycle or the intake. */
  mediaBudget: number | null;
  accessVerified: boolean;
  accessClaimed: boolean;
  homesOnRecord: number;
  /** The intake said "all of them" instead of naming homes. */
  homesAll: boolean;
  hasMark: boolean;
  reportEmails: boolean;
  invoiceEmail: boolean;
  creativeFolder: boolean;
  previewsKept: number;
  adsDrafted: number;
  campaigns: number;
  audiences: number;
  lookalikes: number;
  /** Any campaign exists on Meta, paused or running. */
  pushed: boolean;
  live: boolean;
};

const money = (n: number) => `$${n.toLocaleString()}/mo`;
const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const INTAKE = { label: "Open intake form", to: "intake" } as const;
const ADS_DESK = { label: "Open ads desk", to: "ads" } as const;

/** The action when the item is not done, none when it is. */
const unless = (done: boolean, action: ReadinessItem["action"]) =>
  done ? null : action;

export function readinessChecklist(f: ReadinessFacts): ReadinessChecklist {
  const budgetSet = f.mediaBudget != null && f.mediaBudget > 0;
  const contactsSet = f.reportEmails && f.invoiceEmail;

  const onboarded: ReadinessItem[] = [
    {
      id: "intake",
      label: "Intake filed",
      done: f.intakeFiled,
      detail: f.intakeFiled ? null : "Send the intake form",
      action: unless(f.intakeFiled, INTAKE),
    },
    {
      id: "budget",
      label: "Media budget set",
      done: budgetSet,
      detail: budgetSet
        ? money(f.mediaBudget!)
        : "No monthly media budget on record",
      action: unless(budgetSet, INTAKE),
    },
    {
      id: "access",
      label: "Ad account access verified",
      done: f.accessVerified,
      detail: f.accessVerified
        ? null
        : f.accessClaimed
          ? "Claimed on the intake, not seen yet"
          : "Not granted",
      action: unless(f.accessVerified, {
        label: "Check access",
        to: "connect",
      }),
    },
    {
      id: "homes",
      label: "Homes on record",
      done: f.homesOnRecord > 0,
      detail:
        f.homesOnRecord > 0
          ? count(f.homesOnRecord, "home", "homes")
          : f.homesAll
            ? "Intake said all of them; none on record yet"
            : "None named",
      action: unless(f.homesOnRecord > 0, INTAKE),
    },
    {
      id: "contacts",
      label: "Report and invoice contacts",
      done: contactsSet,
      detail: contactsSet
        ? null
        : f.reportEmails
          ? "No invoice email"
          : f.invoiceEmail
            ? "No report emails"
            : "Neither given",
      action: unless(contactsSet, INTAKE),
    },
  ];

  const creative: ReadinessItem[] = [
    {
      id: "mark",
      label: "Brand mark on file",
      done: f.hasMark,
      detail: f.hasMark ? null : "Cards render without the logo",
      action: unless(f.hasMark, { label: "Add the mark", to: "mark" }),
    },
    {
      id: "folder",
      label: "Creative folder shared",
      done: f.creativeFolder,
      detail: f.creativeFolder
        ? null
        : "No Drive or Dropbox link on the intake",
      action: unless(f.creativeFolder, INTAKE),
    },
    {
      id: "previews",
      label: "Cards kept as previews",
      done: f.previewsKept > 0,
      detail:
        f.previewsKept > 0
          ? count(f.previewsKept, "card", "cards")
          : "Nothing kept yet",
      action: unless(f.previewsKept > 0, { label: "Draw cards", to: "draw" }),
    },
    {
      id: "ads",
      label: "Ads drafted",
      done: f.adsDrafted > 0,
      detail:
        f.adsDrafted > 0
          ? count(f.adsDrafted, "ad", "ads")
          : "No ads on any campaign",
      action: unless(f.adsDrafted > 0, ADS_DESK),
    },
  ];

  const launch: ReadinessItem[] = [
    {
      id: "campaign",
      label: "Campaign drafted",
      done: f.campaigns > 0,
      detail:
        f.campaigns > 0 ? count(f.campaigns, "campaign", "campaigns") : null,
      action: unless(f.campaigns > 0, ADS_DESK),
    },
    {
      id: "audience",
      label: "Audience in the ad account",
      done: f.audiences > 0,
      detail:
        f.audiences > 0
          ? `${count(f.audiences, "audience", "audiences")}${f.lookalikes > 0 ? `, ${count(f.lookalikes, "lookalike", "lookalikes")}` : ", no lookalike"}`
          : "None mirrored from the account",
      action: unless(f.audiences > 0, ADS_DESK),
    },
    {
      id: "pushed",
      label: "Built on Meta, paused",
      done: f.pushed,
      detail: f.pushed ? null : "Nothing pushed yet",
      action: unless(f.pushed, ADS_DESK),
    },
    {
      id: "live",
      label: "Live",
      done: f.live,
      detail: f.live ? null : f.pushed ? "Paused on the platform" : null,
      action: null,
    },
  ];

  const groups: ReadinessGroup[] = [
    group("onboarded", "Onboarded", onboarded),
    group("creative", "Creative", creative),
    group("launch", "Launch", launch),
  ];
  const done = groups.reduce((sum, g) => sum + g.done, 0);
  const total = groups.reduce((sum, g) => sum + g.total, 0);
  return { groups, done, total };
}

function group(
  id: ReadinessGroup["id"],
  label: string,
  items: ReadinessItem[],
): ReadinessGroup {
  return {
    id,
    label,
    items,
    done: items.filter((item) => item.done).length,
    total: items.length,
  };
}

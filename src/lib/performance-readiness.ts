// The onboarding checklist for one Performance client. Every item is a
// milestone a person or the assistant records explicitly, with a date when
// the milestone happened outside the app. Creative and launch state live on
// the catalog, ads and campaigns themselves and are not ticked here.

/**
 * Where an unticked item is resolved. The page maps these to hrefs:
 * `intake` is the client-facing form, `connect` the brand's access flow,
 * `wanderos` the brand's WanderOS tab, `finance` the Finance page.
 */
export type ReadinessFix = "intake" | "connect" | "wanderos" | "finance";

export type ReadinessItem = {
  id: string;
  label: string;
  done: boolean;
  /** Read from what the app knows rather than ticked; no checkbox or skip. */
  observed: boolean;
  /** Recorded as not applicable to this client; counts as settled. */
  skipped: boolean;
  /** The milestone happened outside the app, so ticking it asks for the date. */
  dated: boolean;
  /** Who recorded it and when, or "Not recorded". */
  detail: string | null;
  provenance?: string;
  /** The verb on the link, and where it goes; null when nothing is left to do. */
  action: { label: string; to: ReadinessFix } | null;
};

export type ReadinessGroup = {
  id: "onboarding";
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

type Milestone = {
  id: string;
  label: string;
  dated?: boolean;
  observed?: boolean;
  action: ReadinessItem["action"];
};

/** What the app can see for itself; everything else is recorded by hand. */
export type ObservedFacts = {
  /** When the intake form was submitted, if it has been. */
  intakeFiledAt: Date | null;
  /** The brand is on a WanderOS site. */
  wanderOsConnected: boolean;
};

const INTAKE = { label: "Open intake form", to: "intake" } as const;
const FINANCE = { label: "Open finance", to: "finance" } as const;

/** The milestones in order. Ids are stored on the brand. */
export const LAUNCH_MILESTONES: readonly {
  id: ReadinessGroup["id"];
  label: string;
  items: readonly Milestone[];
}[] = [
  {
    id: "onboarding",
    label: "Onboarding",
    items: [
      { id: "signed", label: "Signed", dated: true, action: null },
      { id: "intake_sent", label: "Intake sent", dated: true, action: INTAKE },
      { id: "intake", label: "Intake filed", observed: true, action: INTAKE },
      {
        id: "invoice_sent",
        label: "Invoice sent",
        dated: true,
        action: FINANCE,
      },
      { id: "invoice_paid", label: "Invoice paid", action: FINANCE },
      { id: "budget", label: "Media budget set", action: INTAKE },
      {
        id: "access",
        label: "Meta ad access verified",
        action: { label: "Check access", to: "connect" },
      },
      { id: "google_access", label: "Google ad access verified", action: null },
      {
        id: "wanderos",
        label: "WanderOS connected",
        observed: true,
        action: { label: "Open WanderOS", to: "wanderos" },
      },
      { id: "email_domain", label: "Email domain verified", action: null },
      { id: "guest_list", label: "Guest list shared", action: INTAKE },
    ],
  },
];

export const LAUNCH_ITEM_IDS = LAUNCH_MILESTONES.flatMap((group) =>
  group.items.map((item) => item.id),
);

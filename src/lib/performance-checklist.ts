// The MANUAL performance checklist: one place an operator records where a
// client stands, whether or not they filed the intake. Each field carries who
// last set it and when, like a comment, so the desk can see who moved what.
// The derived readiness checklist (`performance-readiness`) stays beside this
// and will later feed a "suggested complete" hint into it. Client-safe: the
// page renders from the field schema below, so a new item is one row here.

export type ChecklistStatus = "yes" | "no" | "in_progress";
export type ChecklistValue = string | number | null;

/** Who last set a field, and when. Server-stamped from the session, never trusted from the client. */
export type ChecklistItemMeta = {
  by: string;
  byName: string | null;
  at: string;
};

export type PerformanceChecklist = {
  values?: Record<string, ChecklistValue>;
  meta?: Record<string, ChecklistItemMeta>;
};

export type ChecklistFieldKind =
  | "text"
  | "money"
  | "number"
  | "date"
  | "status";

export type ChecklistField = {
  key: string;
  label: string;
  kind: ChecklistFieldKind;
};

export const CHECKLIST_SECTIONS: {
  title: string;
  fields: ChecklistField[];
}[] = [
  {
    title: "Client & Agreement",
    fields: [
      { key: "monthlyFee", label: "Monthly management fee", kind: "money" },
      { key: "effectiveDate", label: "Effective date", kind: "date" },
      { key: "term", label: "Term", kind: "text" },
      { key: "endDate", label: "End date", kind: "date" },
      { key: "agreedAdSpend", label: "Agreed ad spend", kind: "money" },
      { key: "billedAdSpend", label: "Billed ad spend", kind: "money" },
    ],
  },
  {
    title: "Onboarding & Setup",
    fields: [
      {
        key: "metaConnected",
        label: "Facebook / Meta connection",
        kind: "status",
      },
      { key: "catalogCreative", label: "Catalog ad creative", kind: "status" },
      {
        key: "carouselCreative",
        label: "Carousel ad creative",
        kind: "status",
      },
      { key: "heroCreative", label: "Hero ad creative", kind: "status" },
      { key: "adCopy", label: "Ad copy", kind: "status" },
      { key: "adsLive", label: "Ads live", kind: "status" },
    ],
  },
  {
    title: "Marketing",
    fields: [
      { key: "newsletter", label: "Wander newsletter", kind: "status" },
      { key: "influencer", label: "Influencer", kind: "status" },
      { key: "socialPosts", label: "Social media posts", kind: "status" },
    ],
  },
  {
    title: "Results",
    fields: [
      { key: "cpb", label: "Cost per booking (CPB)", kind: "money" },
      { key: "bookings", label: "Bookings", kind: "number" },
    ],
  },
];

export const CHECKLIST_FIELDS: ChecklistField[] = CHECKLIST_SECTIONS.flatMap(
  (section) => section.fields,
);

export const CHECKLIST_FIELD_KIND: Record<string, ChecklistFieldKind> =
  Object.fromEntries(CHECKLIST_FIELDS.map((f) => [f.key, f.kind]));

/** Status items count toward the completion bar; a "yes" is done. */
export const CHECKLIST_STATUS_KEYS = CHECKLIST_FIELDS.filter(
  (f) => f.kind === "status",
).map((f) => f.key);

export function checklistProgress(checklist: PerformanceChecklist | null) {
  const values = checklist?.values ?? {};
  const done = CHECKLIST_STATUS_KEYS.filter(
    (key) => values[key] === "yes",
  ).length;
  return { done, total: CHECKLIST_STATUS_KEYS.length };
}

export const STATUS_LABEL: Record<ChecklistStatus, string> = {
  yes: "Yes",
  in_progress: "In progress",
  no: "No",
};

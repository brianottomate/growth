// The MANUAL performance checklist: one place an operator records where a
// client stands, whether or not they filed the intake. Each field carries who
// last set it and when, like a comment, so the desk can see who moved what.
// Operational work lives in brand_task; older status values here are archival.
// Explicit onboarding milestones live alongside tracker fields in `launch`.
// Neither is inferred from asset or provider state. Client-safe.

export type ChecklistValue = string | number | null;

/** Who last set a field, and when. Server-stamped from the session, never trusted from the client. */
export type ChecklistItemMeta = {
  by: string;
  byName: string | null;
  at: string;
};

import type { LaunchRecord } from "./launch-checklist";

export type PerformanceChecklist = {
  launch?: LaunchRecord;
  values?: Record<string, ChecklistValue>;
  meta?: Record<string, ChecklistItemMeta>;
};

export type ChecklistFieldKind = "text" | "money" | "number" | "date";

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

/**
 * Derive a newsletter's "kind" (format / recurring series) from its name.
 * This is the cadence axis — orthogonal to the future *topic* axis
 * (General / Destinations / Location Recommendations), which will come from
 * Customer.io subscription topics. Heuristic, name-based for now.
 */
export type NewsletterKind =
  | "wednesday_recs"
  | "saturday_send"
  | "bdr_sprint"
  | "friday_push"
  | "milestone"
  | "one_off";

export const NEWSLETTER_KINDS: NewsletterKind[] = [
  "wednesday_recs",
  "saturday_send",
  "bdr_sprint",
  "friday_push",
  "milestone",
  "one_off",
];

export const NEWSLETTER_KIND_META: Record<
  NewsletterKind,
  { label: string; cadence: string; color: string }
> = {
  wednesday_recs: { label: "Wednesday recs", cadence: "weekly · Wed", color: "#f59e0b" },
  saturday_send: { label: "Saturday send", cadence: "weekly · Sat", color: "#a78bfa" },
  bdr_sprint: { label: "BDR sprint", cadence: "outreach batches", color: "#34d399" },
  friday_push: { label: "Friday push", cadence: "weekly · Fri", color: "#38bdf8" },
  milestone: { label: "Milestone", cadence: "one-off announce", color: "#fb7185" },
  one_off: { label: "One-off", cadence: "ad hoc", color: "#94a3b8" },
};

export function newsletterKind(name: string): NewsletterKind {
  const n = name.toLowerCase();
  if (n.includes("saturday send")) return "saturday_send";
  if (n.includes("personalized recs") || n.includes("wednesday")) return "wednesday_recs";
  if (n.includes("bdr sprint")) return "bdr_sprint";
  if (n.includes("friday push")) return "friday_push";
  if (/anniversary|founding member|investor|birthday/.test(n)) return "milestone";
  return "one_off";
}

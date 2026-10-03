export const PIPELINE_COLUMNS = [
  {
    id: "prospects",
    name: "Prospects",
    description: "Sales conversations",
    color: "border-t-muted-foreground",
  },
  {
    id: "signed",
    name: "Signed",
    description: "Before onboarding",
    color: "border-t-slate-400",
  },
  {
    id: "onboarding",
    name: "Onboarding",
    description: "Collect, connect, prepare",
    color: "border-t-sky-500",
  },
  {
    id: "launch_prep",
    name: "Launch prep",
    description: "Create, review, and prepare the initial work for launch",
    color: "border-t-sky-500",
  },
  {
    id: "first_month",
    name: "First month",
    description: "Initial launch and settling in; advanced manually",
    color: "border-t-amber-500",
  },
  {
    id: "live",
    name: "Ongoing",
    description: "Manually recorded stage",
    color: "border-t-emerald-500",
  },
  {
    id: "paused",
    name: "On hold",
    description: "Client work on hold",
    color: "border-t-violet-400",
  },
] as const;

export type PipelineStage = (typeof PIPELINE_COLUMNS)[number]["id"];
/** Retain older saved review records without implying that they have launched. */
export type StoredPipelineStage = PipelineStage | "review";
export const STORED_PIPELINE_STAGES = [
  ...PIPELINE_COLUMNS.map((column) => column.id),
  "review",
] as const;

/** Explicit pipeline stages are independent of billing, intake, and campaigns.
 * Unassigned records start in the entry column for their relationship.
 */
export function pipelineStage(brand: {
  relationship: string;
  pipelineStage?: StoredPipelineStage | null;
}): PipelineStage {
  if (brand.pipelineStage === "review") return "onboarding";
  return (
    brand.pipelineStage ??
    (brand.relationship === "prospect" ? "prospects" : "signed")
  );
}

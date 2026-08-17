import { createHash } from "node:crypto";

import { z } from "zod";

import type { CheckReceipt } from "./checks";
import type { EvaluatorReceipt } from "./evaluate";

export const WORKBENCH_VERSION = "blog-workbench/v2";

export const visualDirectionSchema = z.object({
  id: z.string().min(1),
  placement: z.string().min(1),
  purpose: z.string().min(1),
  direction: z.string().min(1),
  constraints: z.array(z.string().min(1)),
  fulfillmentOwner: z.enum(["local-agent", "human"]),
  status: z.enum(["direction", "ready", "rejected"]),
  assetPath: z.string().min(1).nullable(),
});

export const visualDirectionsSchema = z.array(visualDirectionSchema);

export type VisualDirection = z.infer<typeof visualDirectionSchema>;

export const generatedStoryboardSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        heading: z.string().min(1),
        purpose: z.string().min(1),
        keyPoints: z.array(z.string().min(1)).min(1),
        visualDirectionIds: z.array(z.string()),
        promotion: z.object({
          decision: z.enum(["none", "property-links", "comparison"]),
          rationale: z.string().min(1),
        }),
      }),
    )
    .min(4)
    .max(10),
});

export type GeneratedStoryboard = z.infer<typeof generatedStoryboardSchema>;
export type StoryboardSection = GeneratedStoryboard["sections"][number] & {
  index: number;
  generatedHeading: string | null;
  wordCount: number;
};

export type WorkbenchComment = {
  id: string;
  status: "open" | "resolved";
  source: "independent-evaluator";
  sectionHeading: string;
  excerpt: string;
  kind: EvaluatorReceipt["comments"][number]["kind"];
  note: string;
  severity: EvaluatorReceipt["comments"][number]["severity"];
};

export type WorkbenchStage = {
  id:
    | "brief"
    | "grounding"
    | "storyboard"
    | "draft"
    | "revision"
    | "review"
    | "visuals"
    | "export";
  label: string;
  detail: string;
  status: "complete" | "attention" | "waiting";
};

export type WorkbenchSnapshot = {
  version: typeof WORKBENCH_VERSION;
  mode: "agent-accompanied";
  state: "review" | "publish-candidate";
  stages: WorkbenchStage[];
  comments: WorkbenchComment[];
  visuals: VisualDirection[];
  agentBrief: string;
};

export function normalizeStoryboardVisualPlacements(
  storyboard: GeneratedStoryboard,
): GeneratedStoryboard {
  const placed = new Set<string>();
  return {
    sections: storyboard.sections.map((section) => ({
      ...section,
      visualDirectionIds: section.visualDirectionIds.filter((visualId) => {
        if (placed.has(visualId)) return false;
        placed.add(visualId);
        return true;
      }),
    })),
  };
}

export type WorkbenchRun = {
  runId: string;
  writerModel: string;
  storyboard: Array<{
    index: number;
    heading: string;
    keyPoints: string[];
    generatedHeading: string | null;
    wordCount: number;
    id?: string;
    purpose?: string;
    visualDirectionIds?: string[];
    promotion?: StoryboardSection["promotion"];
  }>;
  stages: {
    normalizedBrief: { workingTitle: string; targetQuery: string };
    draftArticle?: unknown;
  };
  receipts: {
    deterministic: CheckReceipt[];
    evaluator: EvaluatorReceipt;
  };
  comments?: WorkbenchComment[];
  workflow?: {
    version: typeof WORKBENCH_VERSION;
    previousRunId: string | null;
    sourceCommentIds: string[];
  };
};

export function evaluatorCommentsToWorkbench(
  receipt: EvaluatorReceipt,
): WorkbenchComment[] {
  return receipt.comments.map((comment) => ({
    ...comment,
    id: commentId(comment),
    status: "open",
    source: "independent-evaluator",
  }));
}

export function buildWorkbenchSnapshot(
  run: WorkbenchRun,
  visuals: VisualDirection[],
): WorkbenchSnapshot {
  const comments =
    run.comments ?? evaluatorCommentsToWorkbench(run.receipts.evaluator);
  const openComments = comments.filter((comment) => comment.status === "open");
  const needsReview =
    openComments.length > 0 ||
    run.receipts.evaluator.verdict !== "publish_candidate" ||
    run.receipts.deterministic.some((receipt) => receipt.status !== "passed");
  const hasRevisionStage = Boolean(run.stages.draftArticle);

  const stages: WorkbenchStage[] = [
    {
      id: "brief",
      label: "Normalize brief",
      detail:
        "Preserve the SEO Engine response and map it into the writer contract.",
      status: "complete",
    },
    {
      id: "grounding",
      label: "Ground claims",
      detail:
        "Bind the article to explicit business, inventory, and location facts.",
      status: "complete",
    },
    {
      id: "storyboard",
      label: "Plan storyboard",
      detail: `${run.storyboard.length} ordered sections with a purpose, evidence needs, and visual decisions.`,
      status: "complete",
    },
    {
      id: "draft",
      label: "Generate draft",
      detail: `Long-form article generated with ${run.writerModel}.`,
      status: "complete",
    },
    {
      id: "revision",
      label: "Editorial revision",
      detail: hasRevisionStage
        ? "One bounded edit pass ran before independent review."
        : "This saved run predates the revision stage. The next run will include it.",
      status: hasRevisionStage ? "complete" : "waiting",
    },
    {
      id: "review",
      label: "Independent review",
      detail: `${openComments.length} open anchored comments and ${run.receipts.deterministic.length} deterministic checks.`,
      status: needsReview ? "attention" : "complete",
    },
    {
      id: "visuals",
      label: "Fulfill visuals",
      detail: `${visuals.filter((visual) => visual.status === "direction").length} directions still need an agent or teammate.`,
      status: visuals.some((visual) => visual.status === "direction")
        ? "waiting"
        : "complete",
    },
    {
      id: "export",
      label: "Prepare CMS draft",
      detail: "Derive a DatoCMS draft after editorial and visual review.",
      status: needsReview ? "waiting" : "complete",
    },
  ];

  return {
    version: WORKBENCH_VERSION,
    mode: "agent-accompanied",
    state: needsReview ? "review" : "publish-candidate",
    stages,
    comments,
    visuals,
    agentBrief: buildAgentBrief(run, openComments, visuals),
  };
}

export function buildAgentBrief(
  run: WorkbenchRun,
  comments: WorkbenchComment[],
  visuals: VisualDirection[],
): string {
  const storyboard = run.storyboard
    .map((section) => {
      const purpose = section.purpose ?? section.keyPoints.join("; ");
      return `${section.index}. ${section.heading}\n   Purpose: ${purpose}`;
    })
    .join("\n");
  const review = comments.length
    ? comments
        .map(
          (comment) =>
            `- [${comment.id}] ${comment.severity} ${comment.kind} in "${comment.sectionHeading}"\n  Excerpt: ${comment.excerpt}\n  Required change: ${comment.note}`,
        )
        .join("\n")
    : "- No open editorial comments.";
  const visualRequests = visuals.length
    ? visuals
        .map(
          (visual) =>
            `- [${visual.id}] ${visual.placement}, owner ${visual.fulfillmentOwner}, status ${visual.status}\n  Purpose: ${visual.purpose}\n  Direction: ${visual.direction}\n  Constraints: ${visual.constraints.join("; ")}`,
        )
        .join("\n")
    : "- No visual directions are registered.";

  return [
    "# Blog workbench agent brief",
    "",
    `Run: ${run.runId}`,
    `Article: ${run.stages.normalizedBrief.workingTitle}`,
    `Target query: ${run.stages.normalizedBrief.targetQuery}`,
    "Mode: external local agent beside the workbench",
    "",
    "## Task",
    "Create the next immutable revision of this run. Preserve grounded facts and section ownership. Resolve each applicable comment by ID. Keep visual requests as directions until their assigned owner supplies an approved asset.",
    "",
    "## Storyboard",
    storyboard,
    "",
    "## Open review comments",
    review,
    "",
    "## Visual directions",
    visualRequests,
    "",
    "## Return contract",
    "Return the complete revised article, a disposition for every comment ID, and any changed visual placement. Create a new run directory. Keep the current run unchanged.",
  ].join("\n");
}

function commentId(comment: EvaluatorReceipt["comments"][number]): string {
  const digest = createHash("sha256")
    .update(
      [
        comment.sectionHeading,
        comment.kind,
        comment.severity,
        comment.excerpt,
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 10);
  return `review-${digest}`;
}

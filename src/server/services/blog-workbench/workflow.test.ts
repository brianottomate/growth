import { describe, expect, test } from "bun:test";

import type { CheckReceipt } from "./checks";
import type { EvaluatorReceipt } from "./evaluate";
import {
  buildWorkbenchSnapshot,
  evaluatorCommentsToWorkbench,
  normalizeStoryboardVisualPlacements,
  type VisualDirection,
  type WorkbenchRun,
} from "./workflow";

const evaluator: EvaluatorReceipt = {
  evaluatorVersion: "editorial-evaluator/v1",
  model: "fixture-editor",
  verdict: "revise",
  summary: "One factual claim needs attention.",
  strengths: [],
  comments: [
    {
      sectionHeading: "Compare the homes",
      excerpt: "Every home has a pool.",
      kind: "fabrication",
      note: "One grounded property has no recorded pool.",
      severity: "major",
    },
  ],
  usage: { inputTokens: null, outputTokens: null },
  latencyMs: 0,
};

const checks: CheckReceipt[] = [
  {
    id: "grounding",
    name: "Grounding",
    status: "needs_review",
    summary: "One claim needs review.",
    rows: [{ label: "pool claim", ok: false, detail: "Not grounded" }],
  },
];

const run: WorkbenchRun = {
  runId: "bgr_fixture",
  writerModel: "fixture-writer",
  storyboard: [
    {
      index: 1,
      heading: "Compare the homes",
      keyPoints: ["Compare verified amenities"],
      generatedHeading: "Compare the homes",
      wordCount: 120,
      purpose: "Help the reader compare verified amenities.",
    },
  ],
  stages: {
    normalizedBrief: {
      workingTitle: "Large beach homes",
      targetQuery: "large beach homes",
    },
  },
  receipts: { deterministic: checks, evaluator },
};

const visuals: VisualDirection[] = [
  {
    id: "comparison-card",
    placement: "Compare the homes",
    purpose: "Make the grounded comparison scannable.",
    direction: "Build a card from verified property facts.",
    constraints: ["Leave unknown facts blank"],
    fulfillmentOwner: "local-agent",
    status: "direction",
    assetPath: null,
  },
];

describe("blog workbench workflow", () => {
  test("gives evaluator comments stable IDs", () => {
    const first = evaluatorCommentsToWorkbench(evaluator);
    const second = evaluatorCommentsToWorkbench(evaluator);

    expect(first).toEqual(second);
    expect(first[0]?.id).toMatch(/^review-[a-f0-9]{10}$/);
  });

  test("builds a review state and a complete external-agent packet", () => {
    const snapshot = buildWorkbenchSnapshot(run, visuals);

    expect(snapshot.mode).toBe("agent-accompanied");
    expect(snapshot.state).toBe("review");
    expect(snapshot.stages.find((stage) => stage.id === "review")?.status).toBe(
      "attention",
    );
    expect(snapshot.agentBrief).toContain(snapshot.comments[0]!.id);
    expect(snapshot.agentBrief).toContain("comparison-card");
    expect(snapshot.agentBrief).toContain("Create a new run directory");
  });

  test("keeps the first visual placement when a storyboard repeats one", () => {
    const storyboard = normalizeStoryboardVisualPlacements({
      sections: [
        {
          id: "first",
          heading: "First",
          purpose: "First job",
          keyPoints: ["One"],
          visualDirectionIds: ["comparison-card"],
          promotion: { decision: "none", rationale: "Editorial only" },
        },
        {
          id: "second",
          heading: "Second",
          purpose: "Second job",
          keyPoints: ["Two"],
          visualDirectionIds: ["comparison-card"],
          promotion: { decision: "none", rationale: "Editorial only" },
        },
      ],
    });

    expect(storyboard.sections[0]?.visualDirectionIds).toEqual([
      "comparison-card",
    ]);
    expect(storyboard.sections[1]?.visualDirectionIds).toEqual([]);
  });
});

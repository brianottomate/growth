/**
 * Where a Performance brand is on its way from lead to live: one stage per
 * brand, in order. Workflows move it forward; the ⋯ dialog can set anything.
 */
export const PERFORMANCE_STAGES = [
  "ready_to_pitch",
  "pitch_sent",
  "meeting_booked",
  "ready_for_intake",
  "intake_sent",
  "signed",
  "intake_submitted",
  "access_verified",
  "ads_review",
  "live",
  "paused",
  "lost",
  "churned",
] as const;

export type PerformanceStage = (typeof PERFORMANCE_STAGES)[number];

export const STAGE_LABEL: Record<PerformanceStage, string> = {
  ready_to_pitch: "Ready to pitch",
  pitch_sent: "Pitch sent",
  meeting_booked: "Meeting booked",
  ready_for_intake: "Ready to send intake",
  intake_sent: "Intake sent",
  signed: "Signed",
  intake_submitted: "Intake submitted",
  access_verified: "Access verified",
  ads_review: "Ads ready for review",
  live: "Live",
  paused: "Paused",
  lost: "Lost",
  churned: "Churned",
};

/** Stages a workflow sets on its own; the rest are set by a person. */
export const AUTO_STAGES: readonly PerformanceStage[] = [
  "ready_to_pitch",
  "intake_submitted",
  "access_verified",
  "ads_review",
  "live",
  "paused",
];

/** Stages that end the journey; a brand here leaves both tabs. */
export const CLOSED_STAGES: readonly PerformanceStage[] = ["lost", "churned"];

export function stageIndex(stage: PerformanceStage) {
  return PERFORMANCE_STAGES.indexOf(stage);
}

/** The client line: signed, or a filed intake, is where a prospect becomes a client. */
export function isClientStage(stage: PerformanceStage) {
  return stageIndex(stage) >= stageIndex("signed") && !CLOSED_STAGES.includes(stage);
}

export function isClosedStage(stage: PerformanceStage) {
  return CLOSED_STAGES.includes(stage);
}

/** The later of two stages, so a workflow never walks a brand backwards. */
export function laterStage(a: PerformanceStage | null | undefined, b: PerformanceStage) {
  if (!a) return b;
  return stageIndex(b) > stageIndex(a) ? b : a;
}

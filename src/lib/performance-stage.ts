/**
 * Two lifecycles per Performance brand, kept apart because they do not move
 * together: a client can be paid with nothing built, or have ads drafted with
 * the invoice still open.
 *
 * Business is the money and the relationship, set by a person. Delivery is
 * the production line, set almost entirely by workflows. Monthly billing is
 * not here; it belongs on the cycle.
 */
export const BUSINESS_STAGES = [
  "prospect",
  "pitch_sent",
  "meeting_booked",
  "signed",
  "paid",
  "paused",
  "lost",
  "churned",
] as const;

export type BusinessStage = (typeof BUSINESS_STAGES)[number];

export const BUSINESS_LABEL: Record<BusinessStage, string> = {
  prospect: "Prospect",
  pitch_sent: "Pitch sent",
  meeting_booked: "Meeting booked",
  signed: "Signed",
  paid: "Paid",
  paused: "Paused",
  lost: "Lost",
  churned: "Churned",
};

export const DELIVERY_STAGES = [
  "not_started",
  "intake_sent",
  "intake_submitted",
  "access_verified",
  "ads_review",
  "live",
  "paused",
] as const;

export type DeliveryStage = (typeof DELIVERY_STAGES)[number];

export const DELIVERY_LABEL: Record<DeliveryStage, string> = {
  not_started: "Not started",
  intake_sent: "Intake sent",
  intake_submitted: "Intake submitted",
  access_verified: "Access verified",
  ads_review: "Ads ready for review",
  live: "Live",
  paused: "Ads paused",
};

/** Delivery stages a workflow sets on its own; the rest are set by a person. */
export const AUTO_DELIVERY_STAGES: readonly DeliveryStage[] = [
  "intake_submitted",
  "access_verified",
  "ads_review",
  "live",
  "paused",
];

/** Business stages that end the journey; a brand here leaves both tabs. */
export const CLOSED_BUSINESS_STAGES: readonly BusinessStage[] = [
  "lost",
  "churned",
];

/** Business stages on the client side of the line. Paused clients are still clients. */
export const CLIENT_BUSINESS_STAGES: readonly BusinessStage[] = [
  "signed",
  "paid",
  "paused",
];

export function isClientStage(stage: BusinessStage) {
  return CLIENT_BUSINESS_STAGES.includes(stage);
}

export function isClosedStage(stage: BusinessStage) {
  return CLOSED_BUSINESS_STAGES.includes(stage);
}

/**
 * The later of two stages in one lifecycle, so a workflow never walks a brand
 * backwards. Paused in either list is later than everything that runs.
 */
export function laterStage<S extends string>(
  order: readonly S[],
  a: S | null | undefined,
  b: S,
): S {
  if (!a) return b;
  return order.indexOf(b) > order.indexOf(a) ? b : a;
}

/**
 * The single stage list this replaced, kept only so the remap script and its
 * test can say what each old value becomes. Delete with the script.
 */
export const LEGACY_STAGES = [
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

export type LegacyStage = (typeof LEGACY_STAGES)[number];

/**
 * What one old stage says about each new lifecycle. The old list was ordered,
 * so a brand at a stage had passed the ones before it: intake sent implies a
 * meeting, and every stage past signed implies a signature.
 */
export const LEGACY_SPLIT: Record<
  LegacyStage,
  { business: BusinessStage; delivery: DeliveryStage }
> = {
  ready_to_pitch: { business: "prospect", delivery: "not_started" },
  pitch_sent: { business: "pitch_sent", delivery: "not_started" },
  meeting_booked: { business: "meeting_booked", delivery: "not_started" },
  ready_for_intake: { business: "meeting_booked", delivery: "not_started" },
  intake_sent: { business: "meeting_booked", delivery: "intake_sent" },
  signed: { business: "signed", delivery: "intake_sent" },
  intake_submitted: { business: "signed", delivery: "intake_submitted" },
  access_verified: { business: "signed", delivery: "access_verified" },
  ads_review: { business: "signed", delivery: "ads_review" },
  live: { business: "signed", delivery: "live" },
  paused: { business: "signed", delivery: "paused" },
  lost: { business: "lost", delivery: "not_started" },
  churned: { business: "churned", delivery: "paused" },
};

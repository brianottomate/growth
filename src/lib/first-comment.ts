export type FirstCommentStatus = "draft" | "queued" | "posted" | "failed";

/** Caption edits retain delivery receipts when the comment stays unchanged. */
export function firstCommentDraftPatch(
  current: string | null,
  next: string | null | undefined,
  now: Date,
) {
  if (
    next === undefined ||
    (next?.trim() || null) === (current?.trim() || null)
  )
    return {};
  const text = next?.trim() || null;
  return {
    firstCommentText: text,
    firstCommentStatus: text ? ("draft" as const) : null,
    firstCommentError: null,
    firstCommentUpdatedAt: text ? now : null,
  };
}

export function firstCommentLimit(
  platform: string,
  format: string | null | undefined,
): number | null {
  if (format?.toLowerCase().includes("story")) return null;
  if (platform === "instagram") return 2_200;
  if (platform === "linkedin") return 1_250;
  return null;
}

export function firstCommentStatusLabel(
  status: string | null | undefined,
): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "posted":
      return "Posted";
    case "failed":
      return "Failed";
    default:
      return "Draft";
  }
}

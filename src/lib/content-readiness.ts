export type ReadinessSpot = {
  source: string;
  platform: string;
  archetype: string | null;
  text: string | null;
  scheduledAt: Date | string | null;
  mediaCount: number;
  assetLinkCount: number;
};

export type ContentReadinessInput = {
  hook: string | null;
  status: string;
  spots: ReadinessSpot[];
};

const needsProductionAsset = (archetype: string | null) =>
  !!archetype &&
  ["image", "carousel", "video_short", "video_long"].includes(archetype);

export function getContentReadiness(input: ContentReadinessInput) {
  const owned = input.spots.filter((spot) => spot.source === "owned");
  const missingCopy = owned.filter((spot) => !spot.text?.trim());
  const missingDates = owned.filter((spot) => !spot.scheduledAt);
  const missingAssets = owned.filter(
    (spot) =>
      needsProductionAsset(spot.archetype) &&
      spot.mediaCount === 0 &&
      spot.assetLinkCount === 0,
  );

  const checks = [
    {
      id: "hook",
      label: "Hook",
      complete: !!input.hook?.trim(),
      detail: input.hook?.trim()
        ? "Brief has a working hook"
        : "Add a working hook",
    },
    {
      id: "channels",
      label: "Channels",
      complete: owned.length > 0,
      detail:
        owned.length > 0
          ? `${owned.length} channel rendering${owned.length === 1 ? "" : "s"}`
          : "Add a channel rendering",
    },
    {
      id: "copy",
      label: "Copy",
      complete: owned.length > 0 && missingCopy.length === 0,
      detail:
        missingCopy.length === 0
          ? "Every channel has working copy"
          : `Draft ${missingCopy.map((spot) => spot.platform).join(", ")} copy`,
    },
    {
      id: "production",
      label: "Production",
      complete: missingAssets.length === 0,
      detail:
        missingAssets.length === 0
          ? "Required assets are attached"
          : `Attach ${missingAssets.map((spot) => spot.platform).join(", ")} media`,
    },
    {
      id: "dates",
      label: "Dates",
      complete: owned.length > 0 && missingDates.length === 0,
      detail:
        missingDates.length === 0
          ? "Every channel has a date"
          : `Schedule ${missingDates.map((spot) => spot.platform).join(", ")}`,
    },
    {
      id: "review",
      label: "Review",
      complete: [
        "pending_review",
        "approved",
        "scheduled",
        "published",
      ].includes(input.status),
      detail: ["pending_review", "approved", "scheduled", "published"].includes(
        input.status,
      )
        ? "Entered the review pipeline"
        : "Send for review when production is ready",
    },
  ];
  const completed = checks.filter((check) => check.complete).length;
  const next = checks.find((check) => !check.complete) ?? null;
  return {
    checks,
    completed,
    total: checks.length,
    readyForReview: checks.slice(0, 5).every((check) => check.complete),
    next,
  };
}

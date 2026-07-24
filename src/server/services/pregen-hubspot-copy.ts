import type {
  CompanyEmailHistory,
  CompanyEmailHistoryItem,
} from "./hubspot-company-email-context.service";

const PILOT_SUBJECTS = [
  /^signature test$/i,
  /^i built .+ direct-booking site$/i,
  /^a private direct-booking concept for /i,
];

export function selectCompanyHistoryForGeneration(
  history: CompanyEmailHistory,
  maxItems = 14,
): CompanyEmailHistory {
  const eligible = history.items.filter(
    (item) =>
      !PILOT_SUBJECTS.some((pattern) => pattern.test(item.subject.trim())),
  );
  const selected = new Map<string, CompanyEmailHistoryItem>();

  // A reply is much more useful than ten unanswered sends. Always retain it.
  for (const item of eligible) {
    if (item.direction === "inbound") selected.set(item.engagementId, item);
  }
  for (const item of eligible) {
    if (selected.size >= maxItems) break;
    selected.set(item.engagementId, item);
  }

  const items = [...selected.values()].sort((left, right) =>
    right.sentAt.localeCompare(left.sentAt),
  );
  return {
    ...history,
    retained: items.length,
    inbound: items.filter((item) => item.direction === "inbound").length,
    outbound: items.filter((item) => item.direction === "outbound").length,
    items,
  };
}

type RenderedStep = {
  subject: string | null;
  body: string;
  delayDays: number;
};

export function hubspotPropertiesFromRenderedSteps(
  steps: RenderedStep[],
  previewUrl: string,
) {
  const touch1 = steps[0];
  const touch2 = steps[1];
  if (!touch1 || !touch2) {
    throw new Error("A pregen HubSpot draft needs at least two touches");
  }

  const touch1Parts = touch1.body.split(/\n{2,}/).map((part) => part.trim());
  const previewIndex = touch1Parts.indexOf(previewUrl);
  if (previewIndex < 1 || previewIndex === touch1Parts.length - 1) {
    throw new Error("Touch 1 must contain opening, preview URL, and closing");
  }
  const touch2Parts = touch2.body.split(/\n{2,}/).map((part) => part.trim());
  if (touch2Parts.length < 2) {
    throw new Error("Touch 2 must contain opening and closing");
  }

  return {
    growth_pregen_preview_url: previewUrl,
    growth_pregen_touch_1_subject: touch1.subject ?? "",
    growth_pregen_touch_1_body: touch1Parts.slice(0, previewIndex).join(" "),
    growth_pregen_touch_1_observation: touch1Parts
      .slice(previewIndex + 1)
      .join(" "),
    growth_pregen_touch_2_subject: touch2.subject ?? "",
    growth_pregen_touch_2_body: touch2Parts[0] ?? "",
    growth_pregen_touch_2_fit: touch2Parts.slice(1).join(" "),
  };
}

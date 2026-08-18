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
      !item.operatorTest &&
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

/** A paragraph that is nothing but a URL: the link line the renderer emits. */
function isLinkParagraph(part: string): boolean {
  return /^https?:\/\/\S+$/.test(part);
}

type RenderedStep = {
  subject: string | null;
  body: string;
  delayDays: number;
};

/**
 * The company-level token surface: the whole reviewed sequence, on the record
 * it was actually written about.
 *
 * The contact contract above carries two touches because that is what the first
 * pilot sequence consumed, so publishing silently dropped touches 3 and 4 of
 * every four-touch draft. It also puts a company-level artefact on a person,
 * which means the same copy has to be written onto every contact at the company
 * and goes stale the moment someone changes jobs.
 *
 * This is the replacement. Personalization is company-level by design (the
 * copy attributes history to whoever said it, never to the reader), so the only
 * per-person token left is the first name HubSpot puts in the greeting, and one
 * enrolled contact is as good as another.
 *
 * Shape follows what the generator actually produces, verified across the batch:
 * four touches, a subject and the preview link on touch 1 only, the rest
 * in-thread. Touch 1 splits around the link so the sequence step can render a
 * real hyperlink from `growth_pregen_preview_url` rather than a bare URL.
 */
export function hubspotCompanyPropertiesFromRenderedSteps(
  steps: RenderedStep[],
) {
  const [touch1, ...rest] = steps;
  if (!touch1) throw new Error("A pregen draft needs at least one touch");

  const parts = touch1.body.split(/\n{2,}/).map((part) => part.trim());
  const linkIndex = parts.findIndex(isLinkParagraph);
  if (linkIndex < 1 || linkIndex === parts.length - 1) {
    throw new Error("Touch 1 must contain opening, preview URL, and closing");
  }

  return {
    growth_pregen_touch_1_subject: touch1.subject ?? "",
    growth_pregen_touch_1_opening: parts.slice(0, linkIndex).join("\n\n"),
    growth_pregen_touch_1_closing: parts.slice(linkIndex + 1).join("\n\n"),
    // In-thread follow-ups: whole body, no subject, no link of their own.
    growth_pregen_touch_2_body: rest[0]?.body ?? "",
    growth_pregen_touch_3_body: rest[1]?.body ?? "",
    growth_pregen_touch_4_body: rest[2]?.body ?? "",
  };
}

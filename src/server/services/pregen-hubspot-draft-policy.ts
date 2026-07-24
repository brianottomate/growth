type DraftForPolicy = {
  touches: Array<{
    opening: string;
    closing: string;
  }>;
};

export function findPregenHubspotDraftViolations(
  draft: DraftForPolicy,
  options: {
    motion: "fresh" | "reengagement";
    pms: string | null;
  },
): string[] {
  const touch1 = draft.touches[0];
  if (!touch1) return ["Touch 1 is missing."];

  const opening = touch1.opening.trim();
  const touch1Text = `${opening}\n${touch1.closing}`.trim();
  const violations: string[] = [];

  if (!opening.toLowerCase().includes("wanderos")) {
    violations.push("Touch 1 must introduce or re-introduce WanderOS.");
  }
  if (
    options.motion === "fresh" &&
    !opening.toLowerCase().includes("wander.com")
  ) {
    violations.push(
      "Fresh touch 1 must identify WanderOS as coming from the team behind Wander.com.",
    );
  }
  if (/\battach(?:ed|ment|ments)?\b/i.test(touch1Text)) {
    violations.push(
      "The preview is linked in the email, not attached; do not describe an attachment.",
    );
  }
  if (/\bbelow\b/i.test(touch1.closing)) {
    violations.push(
      "The preview URL renders before the touch 1 closing; do not call it the link below from the closing.",
    );
  }
  if (/\bcheckout\b/i.test(touch1Text)) {
    violations.push(
      "Do not claim the private preview includes or demonstrates checkout.",
    );
  }
  const claimsTechnicalAnswer =
    /\bmost direct answer\b/i.test(touch1Text) ||
    touch1Text
      .split(/(?<=[.!?])\s+/)
      .some(
        (sentence) =>
          /\bpreview\b/i.test(sentence) &&
          /\b(?:answer|answers|answered|covers)\b/i.test(sentence) &&
          /\b(?:MCP|ChatGPT|technical|architecture)\b/i.test(sentence) &&
          !/\b(?:does not|do not|will not|cannot|doesn't|don't|won't|can't)\b/i.test(
            sentence,
          ),
      );
  if (claimsTechnicalAnswer) {
    violations.push(
      "The visual preview does not answer technical, ChatGPT, MCP, or architecture questions.",
    );
  }
  if (
    /^(?:[A-Z][a-z]{1,30}),\s+(?:you|your)\b/.test(opening) ||
    /\byou\s+(?:replied|asked|said|mentioned|wanted|flagged)\b/i.test(opening)
  ) {
    violations.push(
      "The draft is company-level; do not address a correspondent or attribute company history to the eventual recipient.",
    );
  }
  if (
    !/\b(?:nothing[^.!?]{0,80}(?:bookable|booked|booking)|preview[^.!?]{0,80}(?:not|isn't|cannot|can't)[^.!?]{0,40}(?:bookable|booked|booking)|bookings?[^.!?]{0,40}(?:disabled|not available|isn't available))\b/i.test(
      touch1Text,
    )
  ) {
    violations.push(
      "Touch 1 must make clear that nothing in the private preview can be booked.",
    );
  }
  if (!touch1.closing.includes("?")) {
    violations.push(
      "Touch 1 must end with one low-friction question that gives the recipient a clear next step.",
    );
  }

  const pms = options.pms?.trim();
  if (pms) {
    const escapedPms = pms.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const previewPmsClaim = new RegExp(
      `\\bpreview\\b[^.!?]{0,180}\\b(?:pull|pulls|pulling|sync|syncs|syncing|connect|connects|connected|source|sourced|generate|generated|populate|populated)\\b[^.!?]{0,180}\\b${escapedPms}\\b|\\b${escapedPms}\\b[^.!?]{0,180}\\b(?:pull|pulls|pulling|sync|syncs|syncing|connect|connects|connected|source|sourced|generate|generated|populate|populated)\\b[^.!?]{0,180}\\bpreview\\b`,
      "i",
    );
    if (previewPmsClaim.test(touch1Text)) {
      violations.push(
        `Do not claim that the preview pulls from, syncs with, or was generated from ${pms}.`,
      );
    }
  }

  return violations;
}

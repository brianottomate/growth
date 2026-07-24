type DraftForPolicy = {
  touches: Array<{
    opening: string;
    closing: string;
  }>;
};

/**
 * "From the team behind Wander.com" means nothing to a property manager who has
 * never heard of Wander.com. Touch 1 has to carry a number that stands on its
 * own. These are the only scale claims the product actually supports.
 */
export const SUPPORTED_PROOF_ANCHORS = [
  "$75M+ in bookings on Wander.com",
  "70,000+ nights booked on Wander.com",
  "10,000+ properties running on WanderOS",
  "1,000+ property managers running on WanderOS",
  "11+ PMS integrations",
] as const;

const PROOF_ANCHOR_PATTERN =
  /\$\s?75\s?m(?:illion)?\b|\b70[,.]?000\+?\s+nights\b|\b70k\+?\s+nights\b|\b10[,.]?000\+?\s+(?:properties|homes|listings)\b|\b1[,.]?000\+?\s+(?:property managers|managers|operators)\b|\b11\+?\s+pms\b/i;

/**
 * Register bans. Each of these is a phrase the corpus shows reps never use and
 * that makes a one-to-one email read like a template. Banning shapes keeps the
 * copy varied; requiring one exact shape would not.
 */
const LIMP_PHRASES: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /\bwould it be (?:worth|useful|helpful)\b/i,
    label: '"would it be worth/useful/helpful"',
  },
  {
    pattern: /\b\d{1,3}\s*(?:-\s*)?minutes?\b/i,
    label: "a specific meeting length in touch 1",
  },
  {
    pattern: /\bwould you be open to\b|\bopen to (?:a |an )?(?:quick )?(?:chat|call|look|conversation)\b/i,
    label: '"would you be open to"',
  },
  {
    pattern: /\bhappy to\b|\bfeel free to\b|\bdon'?t hesitate\b|\bat your convenience\b/i,
    label: 'service-desk filler ("happy to", "feel free to", "don\'t hesitate")',
  },
  {
    pattern: /\b(?:circle back|touch base|reach out|follow up with you|hope this (?:email )?finds you)\b/i,
    label: "sales-cliche connective tissue",
  },
  {
    pattern: /\blet me know if\b/i,
    label: '"let me know if"',
  },
  {
    pattern: /\bI wanted to\b|\bI'?m reaching out\b|\bjust wanted to\b/i,
    label: '"I wanted to" / "I\'m reaching out"',
  },
];

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
  if (!PROOF_ANCHOR_PATTERN.test(touch1Text)) {
    violations.push(
      `Touch 1 must establish WanderOS with one concrete number rather than lineage alone, because the recipient has never heard of Wander.com. Use one of: ${SUPPORTED_PROOF_ANCHORS.join("; ")}.`,
    );
  }
  for (const { pattern, label } of LIMP_PHRASES) {
    if (pattern.test(touch1Text)) {
      violations.push(`Touch 1 uses ${label}; rewrite it in plainer language.`);
    }
  }
  if (/\battach(?:ed|ment|ments)?\b/i.test(touch1Text)) {
    violations.push(
      "The preview is linked in the email, not attached; do not describe an attachment.",
    );
  }
  // The URL renders on its own line immediately above the closing, so the
  // recipient can already see it. Narrating its position in either direction is
  // mechanical filler occupying the strongest line in the email.
  if (/\b(?:above|below)\b/i.test(touch1.closing)) {
    violations.push(
      "The preview URL renders before the touch 1 closing; do not describe where the link sits from the closing, in either direction.",
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

  // The two proof sets belong to different products. $75M and 70,000 nights are
  // Wander.com marketplace numbers; properties, managers, and PMS integrations
  // are WanderOS platform numbers. Merging them into one sentence invents a
  // claim neither product supports.
  const WANDEROS_SCALE =
    /\b10[,.]?000\+?\s+(?:properties|homes|listings)\b|\b1[,.]?000\+?\s+(?:property managers|managers|operators)\b|\b11\+?\s+pms\b/i;
  for (const [index, touch] of draft.touches.entries()) {
    const sentences = `${touch.opening} ${touch.closing}`.split(/(?<=[.!?])\s+/);
    if (
      sentences.some(
        (sentence) =>
          /\bwander\.com\b/i.test(sentence) && WANDEROS_SCALE.test(sentence),
      )
    ) {
      violations.push(
        `Touch ${index + 1} credits Wander.com with a WanderOS platform number. $75M+ in bookings and 70,000+ nights belong to Wander.com; properties, property managers, and PMS integrations belong to WanderOS. Keep them in separate claims.`,
      );
    }
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

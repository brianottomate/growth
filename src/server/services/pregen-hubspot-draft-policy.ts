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

/**
 * Register bans. Each of these is a phrase the corpus shows reps never use and
 * that makes a one-to-one email read like a template. Banning shapes keeps the
 * copy varied; requiring one exact shape would not.
 */
const LIMP_PHRASES: Array<{
  pattern: RegExp;
  label: string;
  /**
   * Some of these are only wrong in the first touch. Naming a meeting length
   * cold is presumptuous; naming one in touch 4, to someone who has read three
   * emails and not replied, is the concrete ask that gets a yes or a no. The
   * rule text always said "in touch 1" and the loop applied it to all four.
   */
  touch1Only?: boolean;
}> = [
  {
    pattern: /\bwould it be (?:worth|useful|helpful)\b/i,
    label: '"would it be worth/useful/helpful"',
  },
  {
    pattern: /\b\d{1,3}\s*(?:-\s*)?minutes?\b/i,
    label: "a specific meeting length in touch 1",
    touch1Only: true,
  },
  {
    pattern:
      /\bwould you be open to\b|\bopen to (?:a |an )?(?:quick )?(?:chat|call|look|conversation)\b/i,
    label: '"would you be open to"',
  },
  {
    pattern:
      /\bhappy to\b|\bfeel free to\b|\bdon'?t hesitate\b|\bat your convenience\b/i,
    label:
      'service-desk filler ("happy to", "feel free to", "don\'t hesitate")',
  },
  {
    pattern:
      /\b(?:circle back|touch base|reach out|follow up with you|hope this (?:email )?finds you)\b/i,
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

/**
 * A sentence that denies something is not making the claim. "Nothing in the
 * preview is connected to your PMS" is exactly the copy we want, so every
 * claim check below skips negated sentences.
 */
const NEGATED =
  /\b(?:not|no|never|nothing|none|isn'?t|aren'?t|does not|doesn'?t|do not|don'?t|will not|won'?t|cannot|can'?t|without)\b/i;

/** Connection vocabulary, noun forms included — see the call site for why. */
const PREVIEW_WIRING =
  /\b(?:connection|connections|integration|integrations|sync|synced|syncs|syncing|feed|feeds|pipeline|hooked up|wired|live data|real[- ]time)\b/i;

/**
 * Shapes that diagnose the prospect's current tooling as inadequate. Note this
 * one deliberately does NOT skip negated sentences — the negation is the claim
 * ("it wasn't built for…").
 */
/**
 * Claims that something is wrong with the prospect's own site.
 *
 * Banned outright rather than validated. The evidence behind these is a single
 * automated capture taken the instant the page loads, so anything animated or
 * lazy-loaded reads as broken when it is fine — StayMarquis' stats block was
 * reported as "all zeros" and actually counts up to 4.8/5, 804 properties and
 * 21,806 bookings. Getting the observation right is not the fix: even a true
 * defect is a gotcha opener, and it may be fixed before the mail lands. Site
 * quality stays an internal targeting signal.
 */
const SITE_DEFECT_SUBJECT =
  /\b(?:site|website|homepage|home page|page|block|section|stats?|counter|widget|banner|hero|gallery|listing page)\b/i;
const SITE_DEFECT_CLAIM =
  /\b(?:reads? (?:all )?zeroe?s?|all zeroe?s?|shows? (?:all )?zeroe?s?|0\.0\s*\/\s*5|\$0\+|\b0 (?:propert|booking|review|listing)\w*)\b|\b(?:still (?:reads|shows|says|displays)|unpopulated|not populated|placeholder(?:s)?|empty|blank|broken|glitch\w*|erroring|not loading|fails? to load|missing (?:image|images|photo|photos|logo)|typo|misspell\w*|out of date|outdated|stale)\b/i;

const STACK_DEFICIENCY =
  /\b(?:wasn'?t|isn'?t|was not|is not|aren'?t|not)\s+(?:really\s+|ever\s+)?(?:built|designed|made|meant|intended|equipped)\b|\bfalls short\b|\bcan'?t handle\b|\bcannot handle\b|\bstruggles (?:with|to)\b|\boutgrown\b|\bdoes the job,?\s+but\b|\bonly goes so far\b/i;

export function findPregenHubspotDraftViolations(
  draft: DraftForPolicy,
  options: {
    motion: "fresh" | "reengagement";
    pms: string | null;
    /**
     * True when the generator was told who this is being sent as. Addressing
     * that person's own history as "you" is then correct and is the strongest
     * material available, so the misattribution check below stands down.
     */
    recipientKnown?: boolean;
  },
): string[] {
  const touch1 = draft.touches[0];
  if (!touch1) return ["Touch 1 is missing."];

  const opening = touch1.opening.trim();
  const touch1Text = `${opening}\n${touch1.closing}`.trim();
  const violations: string[] = [];

  // Naming WanderOS and carrying a proof number used to be enforced here, and
  // enforcement is what produced nine near-identical emails: the cheapest way
  // to satisfy a regex is the same sentence every time. Both are still asked
  // for in the prompt, where the model can vary how it earns the credibility
  // instead of reaching for one shape that passes.
  //
  // What stays in this gate is claims that are FALSE, not claims that are
  // weak. A draft with no number is a worse email; a draft crediting Wander.com
  // with a WanderOS number is a fabrication, and only one of those is a gate's
  // job.
  // The URL renders on its own line immediately above the closing, so the
  // recipient can already see it. Narrating its position in either direction is
  // mechanical filler occupying the strongest line in the email.
  if (/\b(?:above|below)\b/i.test(touch1.closing)) {
    violations.push(
      "The preview URL renders before the touch 1 closing; do not describe where the link sits from the closing, in either direction.",
    );
  }
  // A name used as a salutation duplicates HubSpot's own greeting, whether or
  // not we know the recipient.
  if (/^(?:[A-Z][a-z]{1,30}),\s+/.test(opening)) {
    violations.push(
      "HubSpot renders \"Hi [First name],\" above the opening; do not begin the opening with the recipient's name as a greeting.",
    );
  }
  // Attributing history to "you" is only wrong when we do not know who "you"
  // is. When the recipient is resolved, their own reply or call is the best
  // thing in the email and this used to forbid it.
  if (
    !options.recipientKnown &&
    /\byou\s+(?:replied|asked|said|mentioned|wanted|flagged)\b/i.test(opening)
  ) {
    violations.push(
      "No recipient was resolved, so this draft is company-level; attribute each message to the person who sent it rather than to \"you\".",
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

  // Everything above is about touch 1's *structure* — the introduction, the
  // proof anchor, the un-bookable disclosure, the link position. Everything
  // below is a forbidden claim or a register ban, and those are no less wrong in
  // touch 3. This gate used to read touch 1 only, which is how "that's the same
  // connection running the preview" shipped inside a reviewed draft.
  const pms = options.pms?.trim();
  const escapedPms = pms?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const [index, touch] of draft.touches.entries()) {
    const label = `Touch ${index + 1}`;
    const text = `${touch.opening}\n${touch.closing}`.trim();
    const sentences = text.split(/(?<=[.!?])\s+/);

    for (const { pattern, label: phrase, touch1Only } of LIMP_PHRASES) {
      if (touch1Only && index > 0) continue;
      if (pattern.test(text)) {
        violations.push(
          `${label} uses ${phrase}; rewrite it in plainer language.`,
        );
      }
    }
    if (/\battach(?:ed|ment|ments)?\b/i.test(text)) {
      violations.push(
        `${label}: the preview is linked in the email, not attached; do not describe an attachment.`,
      );
    }
    // Touch 1 only. Touch 1 is about this specific preview, which has booking
    // disabled, so the word invites a claim we cannot support. Later touches
    // describe the product, where checkout is a real capability and refusing to
    // name it costs an honest answer.
    if (index === 0 && /\bcheckout\b/i.test(text)) {
      violations.push(
        `${label}: do not claim the private preview includes or demonstrates checkout.`,
      );
    }
    if (
      /\bmost direct answer\b/i.test(text) ||
      sentences.some(
        (sentence) =>
          /\bpreview\b/i.test(sentence) &&
          /\b(?:answer|answers|answered|covers)\b/i.test(sentence) &&
          /\b(?:MCP|ChatGPT|technical|architecture)\b/i.test(sentence) &&
          !NEGATED.test(sentence),
      )
    ) {
      violations.push(
        `${label}: the visual preview does not answer technical, ChatGPT, MCP, or architecture questions.`,
      );
    }

    // The preview is a static render. It is not wired to a PMS, a calendar or a
    // feed, so tying it to any connection is false regardless of whether a
    // system is named — and naming one is not required for the claim to land.
    // "The same connection running the preview" evaded the PMS-specific check
    // twice over: `connection` is a noun, and the PMS sat in the prior sentence.
    if (
      sentences.some(
        (sentence) =>
          /\bpreview\b/i.test(sentence) &&
          PREVIEW_WIRING.test(sentence) &&
          !NEGATED.test(sentence),
      )
    ) {
      violations.push(
        `${label}: the preview is a static render and is connected to nothing. Do not describe it as running on, syncing with, or fed by any connection or integration.`,
      );
    }
    if (escapedPms) {
      const previewPmsClaim = new RegExp(
        `\\bpreview\\b[^.!?]{0,180}\\b(?:pull|pulls|pulling|sync|syncs|syncing|connect|connects|connected|source|sourced|generate|generated|populate|populated)\\b[^.!?]{0,180}\\b${escapedPms}\\b|\\b${escapedPms}\\b[^.!?]{0,180}\\b(?:pull|pulls|pulling|sync|syncs|syncing|connect|connects|connected|source|sourced|generate|generated|populate|populated)\\b[^.!?]{0,180}\\bpreview\\b`,
        "i",
      );
      // Sentence-scoped with the same negation skip as the checks above: the
      // `[^.!?]` classes already confined this to one sentence, but denying the
      // connection is legitimate copy and used to trip the rule.
      if (
        sentences.some(
          (sentence) =>
            previewPmsClaim.test(sentence) && !NEGATED.test(sentence),
        )
      ) {
        violations.push(
          `${label}: do not claim that the preview pulls from, syncs with, or was generated from ${pms}.`,
        );
      }
    }

    // Running a direct-booking site is not evidence of leaving the OTAs. Almost
    // every prospect on this list also lists on Airbnb or Vrbo, so asserting
    // otherwise is both unsupported and instantly recognisable as false to the
    // one person who knows their own channel mix. Label the investment in
    // direct; never claim the absence of marketplaces.
    // The distribution verb is deliberately broad. Constrained to "book", the
    // model rewrote the identical claim as "every one of those homes gets *sold*
    // under the StayMarquis name, not a marketplace listing" and passed.
    if (
      sentences.some(
        (sentence) =>
          /\b(?:every|all|each|none|no)\b/i.test(sentence) &&
          /\b(?:book(?:s|ed|ing|ings)?|sold|sells?|selling|list(?:s|ed|ing|ings)?|rent(?:s|ed|ing)?|market(?:s|ed|ing)?|distribut\w*|goes? out|reserv\w*)\b/i.test(
            sentence,
          ) &&
          /\b(?:marketplace|marketplaces|listing|listings|airbnb|vrbo|ota|otas|third[- ]party|someone else'?s (?:page|site|platform))\b/i.test(
            sentence,
          ),
      )
    ) {
      violations.push(
        `${label} asserts how much of their business books direct. Their channel mix is unknown and they almost certainly also list on an OTA. Name the decision to invest in direct booking without quantifying it or claiming they have no marketplace listings.`,
      );
    }

    // Site defects are never a hook — see SITE_DEFECT_CLAIM for why this is a
    // ban and not a correctness problem to solve.
    if (
      sentences.some(
        (sentence) =>
          SITE_DEFECT_SUBJECT.test(sentence) &&
          SITE_DEFECT_CLAIM.test(sentence),
      )
    ) {
      violations.push(
        `${label} builds on something being wrong with their site. Our evidence is one automated capture taken as the page loads, so animated and lazy-loaded content reads as broken when it is fine, and even a real defect is a gotcha opener that may be fixed before the mail lands. Site quality is an internal targeting signal only — write from the markets, property names, PMS on record, direct-booking decision, or logged history instead.`,
      );
    }

    // Their current setup works for them until they say otherwise. Telling a
    // Lodgify shop that Lodgify "wasn't built for" their homes invents a problem
    // they never reported, and Lodgify is the single largest PMS in this
    // universe, so the line would run against thousands of prospects.
    if (
      pms &&
      sentences.some(
        (sentence) =>
          new RegExp(`\\b${escapedPms}\\b`, "i").test(sentence) &&
          STACK_DEFICIENCY.test(sentence),
      )
    ) {
      violations.push(
        `${label} diagnoses ${pms} as inadequate for their portfolio. That is a problem the prospect never reported. Describe what WanderOS adds without characterising what they run today as a shortcoming.`,
      );
    }
  }

  // The two proof sets belong to different products. $75M and 70,000 nights are
  // Wander.com marketplace numbers; properties, managers, and PMS integrations
  // are WanderOS platform numbers. Merging them into one sentence invents a
  // claim neither product supports.
  const WANDEROS_SCALE =
    /\b10[,.]?000\+?\s+(?:properties|homes|listings)\b|\b1[,.]?000\+?\s+(?:property managers|managers|operators)\b|\b11\+?\s+pms\b/i;
  for (const [index, touch] of draft.touches.entries()) {
    const sentences = `${touch.opening} ${touch.closing}`.split(
      /(?<=[.!?])\s+/,
    );
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

  return violations;
}

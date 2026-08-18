import { describe, expect, test } from "bun:test";

import { findPregenHubspotDraftViolations } from "./pregen-hubspot-draft-policy";

const draft = (opening: string, closing: string) => ({
  touches: [
    { opening, closing },
    { opening: "Touch 2.", closing: "Touch 2 close." },
    { opening: "Touch 3.", closing: "Touch 3 close." },
    { opening: "Touch 4.", closing: "Touch 4 close." },
  ],
});

describe("findPregenHubspotDraftViolations", () => {
  test("accepts a grounded fresh opening carrying a supported number", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "Maui Kai's site is unusually blunt about booking direct, down to naming the fees guests skip. Looks like you'd rather guests deal with you than with a listing. WanderOS is the direct-booking platform 1,000+ property managers run on, and our team used Maui Kai's actual inventory to build a private working concept.",
          "Nothing in this private preview can be booked. Would you be against a look?",
        ),
        { motion: "fresh", pms: null },
      ),
    ).toEqual([]);
  });

  // Carrying a proof number is asked for in the prompt and no longer enforced
  // here. Enforcing it meant the cheapest way to pass was the same sentence for
  // every company, and nine drafts in one batch came out near-identical because
  // of it. A draft without a number is a weaker email; the gate is for claims
  // that are false.
  test("accepts a draft that earns credibility without a number", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "I was looking through Maui Kai's site and noticed how clearly you explain the direct-booking benefits. I'm with WanderOS, and our team prepared a private concept using Maui Kai's actual inventory.",
          "Nothing in this private preview can be booked. Would you be against a look?",
        ),
        { motion: "fresh", pms: null },
      ),
    ).toEqual([]);
  });

  test("rejects the limp corporate register in touch 1", () => {
    const violations = findPregenHubspotDraftViolations(
      draft(
        "I wanted to share something. WanderOS now runs 10,000+ properties.",
        "Nothing in this private preview can be booked. Would it be worth 20 minutes to walk through it?",
      ),
      { motion: "fresh", pms: null },
    ).join(" ");

    expect(violations).toContain('"I wanted to"');
    expect(violations).toContain('"would it be worth/useful/helpful"');
    expect(violations).toContain("a specific meeting length in touch 1");
  });

  test("rejects recipient attribution and unsupported preview claims", () => {
    const violations = findPregenHubspotDraftViolations(
      draft(
        "Ryan, you asked about MCP. I'm with WanderOS, and the preview pulls live from Guesty.",
        "The attached preview answers the technical question and includes checkout.",
      ),
      { motion: "reengagement", pms: "Guesty" },
    );

    expect(violations).toContain(
      'HubSpot renders "Hi [First name]," above the opening; do not begin the opening with the recipient\'s name as a greeting.',
    );
    expect(violations).toContain(
      'Attribute history to the person who said it, not to "you" — the reader may not be that person, or may no longer work there.',
    );
    // Claim and register violations now name the touch they came from, because
    // the gate reads all four.
    expect(violations).toContain(
      "Touch 1: do not claim that the preview pulls from, syncs with, or was generated from Guesty.",
    );
    expect(violations).toContain(
      "Touch 1: the preview is linked in the email, not attached; do not describe an attachment.",
    );
    expect(violations).toContain(
      "Touch 1: do not claim the private preview includes or demonstrates checkout.",
    );
    expect(violations).toContain(
      "Touch 1 must make clear that nothing in the private preview can be booked.",
    );
  });

  // Personalization is company-level. Resolving a recipient says who HubSpot
  // greets, not who was on the call: they may have changed roles or left, and
  // the reader who never said it does not recognise "you asked".
  test("rejects addressing the reader's history as you, recipient or not", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "You asked back in May whether this would carry the resort names over. WanderOS runs direct booking for 1,000+ property managers, and our team built something from Maui Kai's own inventory to answer that properly.",
          "Nothing in this private preview can be booked. Is this still worth chasing for you?",
        ),
        { motion: "reengagement", pms: null },
      ),
    ).toContain(
      'Attribute history to the person who said it, not to "you" — the reader may not be that person, or may no longer work there.',
    );
  });

  // The same detail survives the rule; it just carries the name of whoever
  // actually said it, which is what makes it checkable by the reader.
  test("allows the same history attributed to the person who said it", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "Chris asked Pierce back in May whether this would carry the resort names over. WanderOS runs direct booking for 1,000+ property managers, and our team built something from Maui Kai's own inventory to answer that properly.",
          "Nothing in this private preview can be booked. Is this still worth chasing for you?",
        ),
        { motion: "reengagement", pms: null },
      ),
    ).toEqual([]);
  });

  // The label always said "in touch 1" and the loop applied it to all four. A
  // concrete ask in the last touch is the point of the last touch.
  test("allows a meeting length outside touch 1", () => {
    const violations = findPregenHubspotDraftViolations(
      {
        touches: [
          {
            opening:
              "Maui Kai names its resorts on the site. WanderOS runs direct booking for 1,000+ property managers.",
            closing:
              "Nothing in this private preview can be booked. Bad time to look?",
          },
          { opening: "Product fit.", closing: "Still worth it?" },
          { opening: "Proof point.", closing: "Worth a look?" },
          {
            opening: "Last note on this.",
            closing: "Would 15 minutes next week be easier than more email?",
          },
        ],
      },
      { motion: "fresh", pms: null },
    );

    expect(violations).toEqual([]);
  });

  test("allows an explicit disclaimer that the preview does not answer technical questions", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "Ryan asked what the ChatGPT and MCP side actually looks like. That deserved more than another text answer. WanderOS runs direct booking for 1,000+ property managers, and our team used Cascadia's real inventory to build something concrete.",
          "The preview does not answer the technical questions, and nothing can be booked. Worth talking through them together?",
        ),
        { motion: "reengagement", pms: "Guesty" },
      ),
    ).toEqual([]);
  });

  test("rejects crediting Wander.com with a WanderOS platform number", () => {
    const withProof = (touch3: string) => ({
      touches: [
        {
          opening:
            "Maui Kai's homepage leads with no online booking fees. WanderOS runs direct booking for 1,000+ property managers.",
          closing: "Nothing in this private preview can be booked. Bad timing?",
        },
        { opening: "Touch 2.", closing: "Touch 2 close." },
        { opening: touch3, closing: "Touch 3 close." },
        { opening: "Touch 4.", closing: "Touch 4 close." },
      ],
    });

    expect(
      findPregenHubspotDraftViolations(
        withProof(
          "Wander.com has seen 70,000+ nights booked across 10,000+ properties.",
        ),
        { motion: "fresh", pms: null },
      ).join(" "),
    ).toContain("credits Wander.com with a WanderOS platform number");

    expect(
      findPregenHubspotDraftViolations(
        withProof(
          "Wander.com has seen $75M+ in bookings. WanderOS itself now carries 10,000+ properties.",
        ),
        { motion: "fresh", pms: null },
      ),
    ).toEqual([]);
  });

  test("rejects calling the already-rendered preview link below from the closing", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "Blue Beaver's cabins span one-bedroom couples' stays to 20-plus-person groups. WanderOS runs 10,000+ properties on their owners' own domains.",
          "The preview is linked below and nothing can be booked. Would you be against a look?",
        ),
        { motion: "fresh", pms: null },
      ),
    ).toContain(
      "The preview URL renders before the touch 1 closing; do not describe where the link sits from the closing, in either direction.",
    );
  });

  /**
   * The verbatim draft the gate passed for fisher3vacations.com on 2026-07-30.
   * Three unsupported claims reached a reviewer because the gate only ever read
   * touch 1. Keeping the real copy as the fixture means a regression shows up as
   * this exact sequence going quiet again.
   */
  const FISHER3 = {
    touches: [
      {
        opening:
          "Fisher3 runs eight luxury group homes across West Michigan's beach towns, and every one books straight through your own site instead of a marketplace listing. That's already the call you've made: guests book with Fisher3, not through someone else's page. WanderOS is the platform 1,000+ property managers run their direct booking on, and it connects to the PMS you're already using, Lodgify. That's what led us to put together a private preview of Fisher3 on WanderOS.",
        closing:
          "It shows your actual properties, not a demo. Nothing in this private preview can be booked. Is this a bad time to take a look?",
      },
      {
        opening:
          "Lodgify's booking widget does the job, but it wasn't built for homes with pools, game rooms, and 16 guests under one roof. WanderOS carries your listings, photos, rates, and availability over from Lodgify and puts them on a site that looks like Fisher3, not like a rental engine bolted onto WordPress.",
        closing:
          "No rebuild, no new photos, no rates to re-enter by hand. Have you already looked at other ways to get more of these bookings direct?",
      },
      {
        opening:
          "WanderOS connects to 11+ different property management systems, Lodgify included, so switching how guests book doesn't mean switching how you manage the calendar day to day.",
        closing:
          "That's the same connection running the preview from our first email. Is that still worth a look for Fisher3?",
      },
      {
        opening:
          "This is the last note from me on this one. If upgrading the booking site is on someone else's plate at Fisher3, pointing me there would help.",
        closing:
          "No pressure either way. Is this simply not the right time for Fisher3, or is there someone else I should ask?",
      },
    ],
  };

  const matching = (violations: string[], pattern: RegExp) =>
    violations.filter((violation) => pattern.test(violation));

  test("rejects the three claims that reached a reviewer on fisher3vacations.com", () => {
    const violations = findPregenHubspotDraftViolations(FISHER3, {
      motion: "fresh",
      pms: "Lodgify",
    });

    // "every one books straight through your own site instead of a marketplace
    // listing" asserts a channel mix nothing in the lead record knows.
    expect(matching(violations, /^Touch 1 asserts how much/)).toHaveLength(1);
    // "it wasn't built for homes with pools" invents a deficiency in the PMS
    // they chose — and Lodgify is the largest PMS in this universe.
    expect(matching(violations, /^Touch 2 diagnoses Lodgify/)).toHaveLength(1);
    // "the same connection running the preview" claims the preview is wired to
    // something. It is a static render, and in this case a dead link.
    expect(
      matching(violations, /^Touch 3: the preview is a static render/),
    ).toHaveLength(1);
  });

  test("allows naming the direct-booking decision without quantifying it", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "Fisher3 sells eight West Michigan group homes under your own name rather than through someone else's page. That is the call you already made. WanderOS is the platform 1,000+ property managers run their direct booking on.",
          "Nothing in this private preview can be booked. Is this a bad time to take a look?",
        ),
        { motion: "fresh", pms: "Lodgify" },
      ),
    ).toEqual([]);
  });

  /**
   * The verbatim touch 1 written for staymarquis.com on 2026-07-30. The ranker
   * read the "at a glance" block from a screenshot taken as the page loaded and
   * called it an unresolved bug; it actually counts up to 4.8/5, 804 properties,
   * 21,806 bookings and $3B+. The generator then made it the lead.
   */
  test("rejects a hook built on the prospect's site being broken", () => {
    const violations = findPregenHubspotDraftViolations(
      draft(
        "The 'StayMarquis at a Glance' block on your site still reads all zeros, 0.0/5, 0 properties, 0 bookings, $0+ AUM, next to real photography of Hamptons and North Fork homes. WanderOS is the platform 1,000+ property managers run their direct booking on.",
        "Nothing in this private preview can be booked. Is this still worth a look?",
      ),
      { motion: "reengagement", pms: "Streamline" },
    );
    expect(
      matching(violations, /^Touch 1 builds on something being wrong/),
    ).toHaveLength(1);
  });

  /**
   * What the model produced once the "book" verb was blocked. The claim is
   * identical; only the verb moved. Any distribution verb has to count.
   */
  test("catches the OTA-absence claim when it swaps the verb", () => {
    expect(
      matching(
        findPregenHubspotDraftViolations(
          draft(
            "StayMarquis covers the Hamptons, Shelter Island, and the North Fork, and every one of those homes gets sold under the StayMarquis name, not a marketplace listing. WanderOS is the platform 1,000+ property managers run their direct booking on.",
            "Nothing in this private preview can be booked. Is this worth a second look?",
          ),
          { motion: "reengagement", pms: "Streamline" },
        ),
        /^Touch 1 asserts how much/,
      ),
    ).toHaveLength(1);
  });

  test("still allows the durable facts a hook should rest on", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "Marquis Rentals lists The Manor and Villa Vino Modern across the Hamptons, Shelter Island and the North Fork, sold under your own name. WanderOS is the platform 1,000+ property managers run their direct booking on. Skyler spoke with your team earlier this year.",
          "Nothing in this private preview can be booked. Is this still worth a look?",
        ),
        { motion: "reengagement", pms: "Streamline" },
      ),
    ).toEqual([]);
  });

  test("allows denying the connection, which is the copy we want", () => {
    expect(
      matching(
        findPregenHubspotDraftViolations(
          draft(
            "Fisher3 sells its homes under its own name. WanderOS is the platform 1,000+ property managers run their direct booking on.",
            "Nothing in the preview is connected to Lodgify, and nothing in it can be booked. Is this a bad time to take a look?",
          ),
          { motion: "fresh", pms: "Lodgify" },
        ),
        /static render|pulls from/,
      ),
    ).toEqual([]);
  });
});

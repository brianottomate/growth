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

const PROOF_VIOLATION =
  "Touch 1 must establish WanderOS with one concrete number rather than lineage alone";

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

  test("rejects lineage-only credibility with no supported number", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "I was looking through Maui Kai's site and noticed how clearly you explain the direct-booking benefits. I'm with WanderOS, the direct-booking platform from the team behind Wander.com, and our team prepared a private concept using Maui Kai's actual inventory.",
          "Nothing in this private preview can be booked. Would you be against a look?",
        ),
        { motion: "fresh", pms: null },
      ).join(" "),
    ).toContain(PROOF_VIOLATION);
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
      "The draft is company-level; do not address a correspondent or attribute company history to the eventual recipient.",
    );
    expect(violations).toContain(
      "Do not claim that the preview pulls from, syncs with, or was generated from Guesty.",
    );
    expect(violations).toContain(
      "The preview is linked in the email, not attached; do not describe an attachment.",
    );
    expect(violations).toContain(
      "Do not claim the private preview includes or demonstrates checkout.",
    );
    expect(violations).toContain(
      "Touch 1 must make clear that nothing in the private preview can be booked.",
    );
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
});
